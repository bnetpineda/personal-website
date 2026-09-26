import { expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const { fetchHistory } = await import("./providers");
import type { ProviderIO } from "../connections/providers";

const unused = async (): Promise<never> => { throw new Error("Unexpected request"); };
const now = new Date("2026-09-24T10:00:00Z");
const rewards = (time: number) => ({ projectId: "USDT001", type: "BONUS", asset: "USDT", time, rewards: "1" });
function ioFor(earn: (page: number) => unknown): ProviderIO {
  return { text: unused, pause: async () => {}, quotes: unused, json: async (url) => {
    if (url.pathname.endsWith("/time")) return { serverTime: Date.now() };
    if (url.pathname.endsWith("/apiRestrictions")) return { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };
    if (url.pathname.endsWith("/account")) return { uid: 123 };
    expect(Number(url.searchParams.get("endTime"))).toBe(Date.parse("2026-09-24T00:00:00Z") - 1);
    if (url.pathname.includes("flexible/history")) { expect(url.searchParams.get("type")).toBe("ALL"); return earn(Number(url.searchParams.get("current"))); }
    if (url.pathname.includes("locked/history")) return { total: 0, rows: [] };
    return [];
  } };
}
const credentials = { provider: "binance" as const, apiKey: "test-api-key", apiSecret: "test-api-secret" };
test("history paginates completed UTC windows and ties deduplication to the account UID", async () => {
  const result = await fetchHistory(credentials, ioFor((page) => ({ total: 2, rows: [rewards(Date.parse(`2026-09-${20 + page}T00:00:00Z`))] })), now);
  expect(result.entries).toHaveLength(2);
  expect(result.entries[0].accountKey).toBe("uid:123");
  expect(result.coverage).toMatchObject({ from: "2026-08-25", to: "2026-09-23" });
});
test("changing totals, repeated pages and truncated responses reject the whole history", async () => {
  await expect(fetchHistory(credentials, ioFor((page) => ({ total: page === 1 ? 2 : 3, rows: [rewards(Date.now())] })), now)).rejects.toThrow("changed");
  await expect(fetchHistory(credentials, ioFor(() => ({ total: 2, rows: [rewards(1234567890000)] })), now)).rejects.toThrow("repeated");
  await expect(fetchHistory(credentials, ioFor(() => ({ total: 2, rows: [] })), now)).rejects.toThrow("incomplete");
});
test("IBKR history requires the separately configured query", async () => {
  await expect(fetchHistory({ provider: "ibkr", token: "test-token", queryId: "123" })).rejects.toThrow("history Flex Query");
});
