import { afterAll, expect, test } from "bun:test";
import { timedFetch } from "./timed-fetch";

// A server that never answers, like a database request stuck in the network.
const server = Bun.serve({ port: 0, fetch: () => new Promise<Response>(() => {}) });
afterAll(() => server.stop(true));

test("a request that never answers is aborted at the limit", async () => {
  const started = Date.now();
  await expect(timedFetch(50)(server.url)).rejects.toThrow();
  expect(Date.now() - started).toBeLessThan(2_000);
});

test("the caller's own signal still aborts first", async () => {
  const controller = new AbortController();
  const request = timedFetch(10_000)(server.url, { signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toThrow();
});
