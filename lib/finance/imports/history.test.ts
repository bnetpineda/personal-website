import { describe, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
import { parseWiseStatement } from "./wise-csv";
import { parseIbkrHistory } from "./provider-parsers";
import { parseSpotPage, spotFifo } from "./spot";
import { sameSource, type ImportEntry } from "./types";
const { fetchHistory } = await import("./providers");
const { addUtcDays, fetchSpotPair, historySetupSchema, startHeldSpotHistory } = await import("./history-service");
import type { ProviderIO } from "../connections/providers";

const header = "TransferWise ID,Date,Amount,Currency,Description,Total fees,Running Balance";
describe("Wise closing balances", () => {
  test("ascending and descending files produce the same closing balance, including fees", () => {
    const rows = ["CARD-1,2026-09-20,-11,USD,Shop,1,89", "PAY-2,2026-09-21,20,USD,Payment,0,109"];
    for (const ordered of [rows, [...rows].reverse()]) {
      const result = parseWiseStatement([header, ...ordered].join("\n"), "included");
      expect(result.balances).toEqual([{ currency: "USD", amount: 109, asOf: "2026-09-21" }]);
      expect(result.entries.reduce((sum, e) => sum + e.amount, 0)).toBe(9);
    }
  });
  test("same-day order is derived from running balances, not row position alone", () => {
    const rows = ["A,2026-09-20,-10,USD,A,0,90", "B,2026-09-20,5,USD,B,0,95"];
    expect(parseWiseStatement([header, ...rows].join("\n"), "separate").balances[0].amount).toBe(95);
    expect(parseWiseStatement([header, ...rows.reverse()].join("\n"), "separate").balances[0].amount).toBe(95);
  });
  test("ambiguous same-day reversals never pick an arbitrary balance", () => {
    const result = parseWiseStatement(`${header}\nA,2026-09-20,-10,USD,A,0,90\nB,2026-09-20,10,USD,B,0,100`, "separate");
    expect(result.entries).toHaveLength(2); expect(result.balances).toHaveLength(0); expect(result.balanceWarning).toContain("unambiguous");
  });
  test("multiple currencies, zero closing balances, duplicates and empty balance columns", () => {
    const usd = "A,2026-09-20,-10,USD,A,0,0";
    const result = parseWiseStatement(`${header}\n${usd}\n${usd}\nB,2026-09-21,5,EUR,B,0,25`, "separate");
    expect(result.balances.map((b) => b.amount)).toEqual([0, 25]); expect(result.entries).toHaveLength(2);
    expect(parseWiseStatement("ID,Date,Amount,Currency,Description\nA,2026-09-20,10,USD,A", "separate").balanceWarning).toContain("No Running Balance");
    expect(() => parseWiseStatement(`${header}\nA,2026-09-20,10,USD,A,0,`, "separate")).toThrow();
  });
  test("inconsistent or negative balances allow transactions but never a holding update", () => {
    for (const rows of ["A,2026-09-20,-10,USD,A,0,90\nB,2026-09-21,5,USD,B,0,999", "A,2026-09-20,-10,USD,A,0,-1"]) {
      const result = parseWiseStatement(`${header}\n${rows}`, "separate");
      expect(result.entries.length).toBeGreaterThan(0); expect(result.balances).toHaveLength(0); expect(result.balanceWarning).toBeDefined();
    }
  });
});

const pair = { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" };
test("public market metadata never receives a signature, timestamp or API key", async () => {
  const io: ProviderIO = { json: async (url, headers) => {
    expect(url.href).toBe("https://api.binance.com/api/v3/exchangeInfo?symbol=BTCUSDT");
    expect(headers).toEqual({});
    return { symbols: [pair] };
  }, text: async () => "", pause: async () => {}, quotes: async () => new Map() };
  expect(await fetchSpotPair("BTCUSDT", AbortSignal.timeout(1000), io)).toEqual(pair);
  await expect(fetchSpotPair("BTCUSDT", AbortSignal.timeout(1000), { ...io, json: async () => ({ symbols: [] }) })).rejects.toThrow("could not identify");
});
test("automatic cost imports reject a changed account before configuring streams", async () => {
  const credentials = { provider: "binance" as const, apiKey: "qa-key", apiSecret: "qa-secret" };
  const io: ProviderIO = { json: async (url) => {
    if (url.pathname.endsWith("/time")) return { serverTime: Date.now() };
    if (url.pathname.endsWith("/apiRestrictions")) return { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };
    if (url.pathname.endsWith("/account")) return { uid: 2 };
    throw new Error("No further request should be made");
  }, text: async () => "", pause: async () => {}, quotes: async () => new Map() };
  await expect(startHeldSpotHistory(io, async () => ({ credentials, row: { encryptedCredentials: "opaque", snapshot: {
    asOf: new Date().toISOString(), accountKey: "uid:1", positions: [], warnings: [],
  } } }))).rejects.toThrow("account changed");
});
const fill = (id = 1, overrides: Record<string, unknown> = {}) => ({ id, symbol: "BTCUSDT", qty: "1", quoteQty: "100", price: "100", commission: "1", commissionAsset: "USDT", time: Date.parse("2020-01-01T20:00:00Z") + id, isBuyer: true, ...overrides });
describe("full Spot trade history", () => {
  test("keeps base quantity, quote movement, timestamp and commission with stable identities", () => {
    const result = parseSpotPage([fill()], pair, "uid:1", "0");
    expect(result.entries.map((e) => [e.externalId, e.amount])).toEqual([["spot:BTCUSDT:1", -100], ["spot:BTCUSDT:1:fee", -1]]);
    expect(result.entries[0].trade).toMatchObject({ quantity: 1, side: "BUY", quoteAsset: "USDT" });
    expect(result.entries[0].occurredOn).toBe("2020-01-02"); expect(result.cursor).toBe("2"); expect(result.complete).toBe(true);
    const reordered = JSON.parse(JSON.stringify(result.entries[0], Object.keys(result.entries[0]).reverse())) as ImportEntry;
    // PostgreSQL jsonb can return keys in a different order.
    reordered.trade = Object.fromEntries(Object.entries(result.entries[0].trade!).reverse()) as ImportEntry["trade"];
    expect(sameSource(result.entries[0], reordered)).toBe(true);
  });
  test("a full page requires continuation and an empty tail preserves the cursor", () => {
    const result = parseSpotPage(Array.from({ length: 1000 }, (_, i) => fill(i + 1, { commission: "0" })), pair, "uid:1", "0");
    expect(result.complete).toBe(false); expect(result.cursor).toBe("1001");
    expect(parseSpotPage([], pair, "uid:1", result.cursor)).toMatchObject({ complete: true, cursor: "1001", entries: [] });
  });
  test("wrong markets, duplicate pages, unsafe IDs and changed fills fail", () => {
    expect(() => parseSpotPage([fill(1), fill(1)], pair, "uid:1", "0")).toThrow("repeated");
    expect(() => parseSpotPage([fill()], pair, "uid:1", "2")).toThrow();
    expect(() => parseSpotPage([fill(1, { symbol: "ETHUSDT" })], pair, "uid:1", "0")).toThrow();
    expect(() => parseSpotPage([fill(Number.MAX_SAFE_INTEGER + 1)], pair, "uid:1", "0")).toThrow();
    const a = parseSpotPage([fill()], pair, "uid:1", "0").entries[0];
    expect(sameSource(a, { ...a, trade: { ...a.trade!, quantity: 2 } })).toBe(false);
  });
  test("FIFO respects fees, account isolation and missing purchase lots", () => {
    const entries = parseSpotPage([fill(1), fill(2, { isBuyer: false, qty: "0.5", quoteQty: "60", price: "120", commission: "0.5" })], pair, "uid:1", "0").entries;
    const rows = entries.filter((e) => e.trade).map((e) => ({ ...e, trade: e.trade!, status: "reviewed" }));
    const [estimate] = spotFifo(rows);
    expect(estimate.remaining).toBe(0.5); expect(estimate.cost).toBe(50.5); expect(estimate.realized).toBe(9); expect(estimate.unmatched).toBe(0);
    expect(spotFifo([rows[1]])[0].unmatched).toBe(1);
    expect(spotFifo([rows[0], { ...rows[1], accountKey: "uid:2" }])).toHaveLength(2);
    expect(spotFifo([{ ...rows[0], status: "ignored" }, rows[1]])[0].unmatched).toBe(1);
  });
});

describe("historical import ranges", () => {
  test("IBKR accepts multi-year archives and keeps reported IDs for overlapping live imports", () => {
    const xml = '<FlexQueryResponse><FlexStatements><FlexStatement accountId="QA" fromDate="20180101" toDate="20201231"><CashTransactions><CashTransaction transactionID="123" reportDate="20180501" currency="USD" amount="10" type="Dividends" /></CashTransactions><Trades /></FlexStatement></FlexStatements></FlexQueryResponse>';
    const result = parseIbkrHistory(xml);
    expect(result.coverage).toMatchObject({ from: "2018-01-01", to: "2020-12-31" }); expect(result.accounts).toEqual(["QA"]);
    expect(result.entries[0].externalId).toBe("cash:123");
    expect(() => parseIbkrHistory(xml.replace('reportDate="20180501"', 'reportDate="20170501"'))).toThrow("outside");
  });
  test("backfill uses exact bounded UTC windows and the expected account", async () => {
    const windows: string[] = [];
    const io: ProviderIO = { text: async () => "", quotes: async () => new Map(), pause: async () => {}, json: async (url) => {
      if (url.pathname.endsWith("/time")) return { serverTime: Date.now() };
      if (url.pathname.endsWith("/apiRestrictions")) return { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };
      if (url.pathname.endsWith("/account")) return { uid: 42 };
      windows.push(`${url.searchParams.get("startTime")}:${url.searchParams.get("endTime")}`);
      return url.pathname.includes("simple-earn") ? { total: 0, rows: [] } : [];
    } };
    const credentials = { provider: "binance" as const, apiKey: "qa", apiSecret: "qa" };
    const result = await fetchHistory(credentials, io, new Date("2026-09-24"), { from: "2019-01-01", to: "2019-01-30" }, "uid:42");
    expect(result.coverage.from).toBe("2019-01-01"); expect(windows).toHaveLength(4);
    expect(new Set(windows).size).toBe(1); expect(windows[0]).toBe(`${Date.parse("2019-01-01T00:00:00Z")}:${Date.parse("2019-01-31T00:00:00Z") - 1}`);
    await expect(fetchHistory(credentials, io, new Date("2026-09-24"), { from: "2019-01-01", to: "2019-02-01" })).rejects.toThrow("30 completed");
    await expect(fetchHistory(credentials, io, new Date("2026-09-24"), undefined, "uid:99")).rejects.toThrow("account changed");
    expect(addUtcDays("2020-02-28", 2)).toBe("2020-03-01");
    expect(historySetupSchema.parse({ from: "2020-01-01", pairs: "btcusdt, ETHUSDT btcusdt" }).pairs).toEqual(["BTCUSDT", "ETHUSDT"]);
  });
});
