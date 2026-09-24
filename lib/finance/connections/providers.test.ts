import { createHmac } from "node:crypto";
import { describe, expect, mock, test } from "bun:test";
// Next enforces this boundary at build time; Bun exercises the server provider code here.
mock.module("server-only", () => ({}));
const { fetchAccountSnapshot, fetchWiseProfiles } = await import("./providers");
import type { ProviderIO } from "./providers";
import { flexFixture } from "./fixtures";
import { ConnectionError } from "./types";

const unused = async (): Promise<never> => { throw new Error("Unexpected request"); };
const baseIO: ProviderIO = { json: unused, text: unused, quotes: unused, pause: async () => {} };

describe("account API workflows", () => {
  test("Wise profile lookup authenticates at its fixed endpoint and returns only IDs and types", async () => {
    const profiles = await fetchWiseProfiles("test-wise-token", { json: async (url, headers, signal) => {
      expect(url.href).toBe("https://api.wise.com/2026Q3/profiles");
      expect(headers).toEqual({ Authorization: "Bearer test-wise-token" });
      expect(signal).toBeInstanceOf(AbortSignal);
      return [
        { id: 123, type: "PERSONAL", currentState: "VISIBLE", userId: 999, publicId: "public-uuid",
          fullName: "Private Name", email: "private@example.com", address: { city: "Private City" } },
        { id: "456", type: "BUSINESS", businessName: "Private Company" },
        { id: 789, type: "PERSONAL", currentState: "DEACTIVATED" },
      ];
    } });
    expect(profiles).toEqual([{ id: "123", type: "PERSONAL" }, { id: "456", type: "BUSINESS" }]);
  });

  test("Wise profile lookup keeps empty results empty and rejects unsafe or ambiguous IDs", async () => {
    expect(await fetchWiseProfiles("test-wise-token", { json: async () => [] })).toEqual([]);
    for (const response of [
      [{ id: Number.MAX_SAFE_INTEGER + 1, type: "PERSONAL" }],
      [{ publicId: "not-the-profile-id", type: "PERSONAL" }],
      [{ id: "../123", type: "PERSONAL" }],
      [{ id: 123, type: "PERSONAL" }, { id: "123", type: "BUSINESS" }],
      { profiles: [{ id: 123, type: "PERSONAL" }] },
    ]) {
      await expect(fetchWiseProfiles("test-wise-token", { json: async () => response })).rejects.toBeInstanceOf(ConnectionError);
    }
  });

  test("Wise profile lookup hides raw failures and preserves safe provider errors", async () => {
    await expect(fetchWiseProfiles("test-wise-token", { json: async () => {
      throw new Error("private token or profile details");
    } })).rejects.toThrow("Wise profiles could not be read. Check your API token and try again.");
    await expect(fetchWiseProfiles("test-wise-token", { json: async () => {
      throw new ConnectionError("Account access was denied.");
    } })).rejects.toThrow("Account access was denied.");
  });

  test("Binance signs read requests, follows Earn pages, and values Spot and Earn separately", async () => {
    const calls: string[] = [];
    const snapshot = await fetchAccountSnapshot({ provider: "binance", apiKey: "test-read-key", apiSecret: "test-hmac-secret" }, {
      ...baseIO,
      quotes: async () => new Map([["tether", { prices: { usd: 0.99 }, asOf: new Date() }]]),
      json: async (url, headers) => {
        calls.push(url.pathname);
        if (url.searchParams.has("signature")) {
          const query = new URLSearchParams(url.searchParams);
          const signature = query.get("signature"); query.delete("signature");
          expect(signature).toBe(createHmac("sha256", "test-hmac-secret").update(query.toString()).digest("hex"));
          expect(headers?.["X-MBX-APIKEY"]).toBe("test-read-key");
        }
        switch (url.pathname) {
          case "/api/v3/time": return { serverTime: Date.now() };
          case "/sapi/v1/account/apiRestrictions": return { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };
          case "/api/v3/account": return { uid: 123, balances: [{ asset: "USDT", free: "10", locked: "5" }, { asset: "LDUSDT", free: "39", locked: "0" }] };
          case "/api/v3/ticker/price": return [{ symbol: "BTCUSDT", price: "50000" }];
          case "/sapi/v1/simple-earn/flexible/position": return { total: 2, rows: [{ asset: "USDT", totalAmount: "20", productId: `product-${url.searchParams.get("current")}` }] };
          case "/sapi/v1/simple-earn/locked/position": return { total: 1, rows: [{ asset: "BTC", amount: "0.1", positionId: 1 }] };
          default: throw new Error("Unexpected endpoint");
        }
      },
    });
    expect(snapshot.positions).toHaveLength(4);
    expect(snapshot.accountKey).toBe("uid:123");
    expect(snapshot.usdtUsd).toBe(0.99);
    expect(snapshot.positions.some((p) => p.symbol === "LDUSDT")).toBe(false);
    expect(snapshot.warnings.some((warning) => warning.includes("no supported price pair"))).toBe(false);
    expect(snapshot.positions[0].marketValue).toBe(14.85);
    expect(snapshot.positions[3].marketValue).toBe(4950);
    expect(calls.filter((path) => path.includes("flexible/position"))).toHaveLength(2);
    expect(snapshot.positions.every((p) => p.costBasis === null)).toBe(true);
  });

  test("a failed Earn request rejects the snapshot instead of returning a Spot-only balance", async () => {
    await expect(fetchAccountSnapshot({ provider: "binance", apiKey: "test-read-key", apiSecret: "test-secret" }, {
      ...baseIO, quotes: async () => new Map(), json: async (url) => {
        if (url.pathname.endsWith("/time")) return { serverTime: Date.now() };
        if (url.pathname.endsWith("/apiRestrictions")) return { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };
        if (url.pathname.includes("locked/position")) throw new Error("Earn unavailable");
        if (url.pathname.endsWith("/account")) return { balances: [] };
        if (url.pathname.includes("flexible/position")) return { total: 0, rows: [] };
        return [];
      },
    })).rejects.toThrow("Earn unavailable");
  });

  test("IBKR retries a pending report at the fixed host and ignores response URLs", async () => {
    let retrievals = 0;
    const snapshot = await fetchAccountSnapshot({ provider: "ibkr", token: "test-token", queryId: "123" }, {
      ...baseIO, text: async (url, headers) => {
        expect(url.hostname).toBe("ndcdyn.interactivebrokers.com");
        expect(headers).toEqual({});
        if (url.pathname.endsWith("SendRequest")) return '<FlexStatementResponse><Status>Success</Status><ReferenceCode>999</ReferenceCode><Url>https://untrusted.example/</Url></FlexStatementResponse>';
        expect(url.searchParams.get("q")).toBe("999");
        return ++retrievals === 1 ? '<FlexStatementResponse><Status>Fail</Status><ErrorCode>1019</ErrorCode></FlexStatementResponse>' : flexFixture();
      },
    });
    expect(retrievals).toBe(2);
    expect(snapshot.positions).toHaveLength(3);
  });
  test("IBKR pending reports have a bounded retry limit", async () => {
    let retrievals = 0;
    await expect(fetchAccountSnapshot({ provider: "ibkr", token: "test-token", queryId: "123" }, {
      ...baseIO, text: async (url) => {
        if (url.pathname.endsWith("SendRequest")) return '<FlexStatementResponse><Status>Success</Status><ReferenceCode>999</ReferenceCode></FlexStatementResponse>';
        retrievals++;
        return '<FlexStatementResponse><Status>Fail</Status><ErrorCode>1019</ErrorCode></FlexStatementResponse>';
      },
    })).rejects.toThrow("still preparing");
    expect(retrievals).toBe(4);
  });
  test("an expired IBKR Flex token says so instead of a bare error code", async () => {
    await expect(fetchAccountSnapshot({ provider: "ibkr", token: "test-token", queryId: "123" }, {
      ...baseIO, text: async () => '<FlexStatementResponse><Status>Fail</Status><ErrorCode>1012</ErrorCode></FlexStatementResponse>',
    })).rejects.toThrow("Flex token has expired");
  });
});
