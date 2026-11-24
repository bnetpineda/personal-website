import { EventEmitter } from "node:events";
import type { request as httpsRequest } from "node:https";
import { describe, expect, mock, spyOn, test } from "bun:test";
mock.module("server-only", () => ({}));
const { readJson, readText } = await import("./http");
const { ConnectionError } = await import("./types");

type Transport = typeof httpsRequest;
interface Sent { url: URL; options: { method?: string; headers?: Record<string, string>; signal?: AbortSignal }; body?: string }

/** A stand-in for node:https: answers with `status` and the given chunks, and records what was sent. */
function fakeTransport(status: number, chunks: string[] = [], sent: Sent[] = []) {
  const transport = ((url: URL, options: Sent["options"], onResponse: (response: EventEmitter & { statusCode: number; resume: () => void }) => void) => {
    const request = Object.assign(new EventEmitter(), {
      destroyed: false,
      destroy() { this.destroyed = true; },
      end(body?: string) {
        sent.push({ url, options, body });
        queueMicrotask(() => {
          const response = Object.assign(new EventEmitter(), { statusCode: status, resume: () => {} });
          onResponse(response);
          for (const chunk of chunks) {
            if (request.destroyed) return;
            response.emit("data", Buffer.from(chunk));
          }
          response.emit("end");
        });
      },
    });
    return request;
  }) as unknown as Transport;
  return { transport, sent };
}

const binance = new URL("https://api.binance.com/api/v3/time");
const info = new URL("https://api.hyperliquid.xyz/info");

describe("readText guards", () => {
  test("only the three provider hosts, over plain https, with no port or credentials", () => {
    const { transport } = fakeTransport(200, ["ok"]);
    for (const bad of [
      "http://api.binance.com/api/v3/time",
      "https://evil.example.com/api",
      "https://api.binance.com.evil.example/",
      "https://api.binance.com:8443/api/v3/time",
      "https://user:pass@api.binance.com/api/v3/time",
      "https://localhost/",
    ]) {
      expect(() => readText(new URL(bad), {}, undefined, undefined, transport)).toThrow(ConnectionError);
    }
  });

  test("a body may only go to Hyperliquid's read endpoint, never /exchange or another host", async () => {
    const { transport, sent } = fakeTransport(200, ["{}"]);
    expect(() => readText(new URL("https://api.hyperliquid.xyz/exchange"), {}, undefined, { type: "order" }, transport)).toThrow(ConnectionError);
    expect(() => readText(binance, {}, undefined, { a: 1 }, transport)).toThrow(ConnectionError);
    expect(await readText(info, {}, undefined, { type: "meta" }, transport)).toBe("{}");
    expect(sent[0].options.method).toBe("POST");
    expect(sent[0].body).toBe(JSON.stringify({ type: "meta" }));
    expect(sent[0].options.headers?.["content-type"]).toBe("application/json");
    await readText(binance, { "X-Key": "k" }, undefined, undefined, transport);
    expect(sent[1].options.method).toBe("GET");
    expect(sent[1].body).toBeUndefined();
    expect(sent[1].options.headers?.["X-Key"]).toBe("k");
  });

  test("every request has an 8-second timeout, combined with the caller's signal", async () => {
    const timeout = spyOn(AbortSignal, "timeout");
    try {
      const { transport, sent } = fakeTransport(200, ["ok"]);
      await readText(binance, {}, undefined, undefined, transport);
      expect(timeout).toHaveBeenCalledWith(8000);
      const caller = new AbortController();
      caller.abort();
      await readText(binance, {}, caller.signal, undefined, transport);
      expect(sent[0].options.signal?.aborted).toBe(false);
      expect(sent[1].options.signal?.aborted).toBe(true);
    } finally {
      timeout.mockRestore();
    }
  });

  test("a response over 8 MB is cut off", async () => {
    const big = "x".repeat(1_000_000);
    const { transport } = fakeTransport(200, Array(9).fill(big));
    await expect(readText(binance, {}, undefined, undefined, transport)).rejects.toThrow("too large");
  });

  test("status codes become plain messages that never echo the URL or body", async () => {
    const cases: [number, string][] = [
      [401, "Account access was denied"], [403, "Account access was denied"],
      [429, "rate limit"], [418, "rate limit"], [451, "unavailable from the server's region"], [500, "HTTP 500"],
    ];
    for (const [status, text] of cases) {
      const { transport } = fakeTransport(status, ["secret-body"]);
      const failure = readText(new URL("https://api.binance.com/api/v3/account?signature=abc"), {}, undefined, undefined, transport);
      await expect(failure).rejects.toThrow(text);
      await failure.catch((error: Error) => {
        expect(error).toBeInstanceOf(ConnectionError);
        expect(error.message).not.toContain("signature");
        expect(error.message).not.toContain("secret-body");
      });
    }
  });

  test("a network error is reported without detail", async () => {
    const transport = (() => {
      const request = Object.assign(new EventEmitter(), { destroy() {}, end() { queueMicrotask(() => request.emit("error", new Error("ECONNRESET 10.0.0.1"))); } });
      return request;
    }) as unknown as Transport;
    await expect(readText(binance, {}, undefined, undefined, transport)).rejects.toThrow("could not be reached in time");
  });

  test("readJson turns unreadable bodies and refused addresses into ConnectionErrors", async () => {
    await expect(readJson(new URL("https://evil.example.com/"))).rejects.toBeInstanceOf(ConnectionError);
  });
});
