import { describe, expect, mock, test } from "bun:test";
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
test("IBKR history reads the last 30 days of the account's own query", async () => {
  const io: ProviderIO = { json: unused, quotes: unused, pause: async () => {}, text: async (url) => {
    if (url.pathname.endsWith("SendRequest")) {
      expect(url.searchParams.get("q")).toBe("123");
      expect(url.searchParams.get("p")).toBe("30");
      return "<FlexStatementResponse><Status>Success</Status><ReferenceCode>999</ReferenceCode></FlexStatementResponse>";
    }
    return '<FlexQueryResponse><FlexStatements><FlexStatement accountId="TEST" fromDate="20260825" toDate="20260923"><CashTransactions></CashTransactions><Trades></Trades></FlexStatement></FlexStatements></FlexQueryResponse>';
  } };
  const result = await fetchHistory({ provider: "ibkr", token: "test-token", queryId: "123" }, io);
  expect(result.coverage).toMatchObject({ from: "2026-08-25", to: "2026-09-23" });
});

describe("Hyperliquid history", () => {
  const address = "0x00000000000000000000000000000000000000aa";
  const at = (iso: string) => Date.parse(iso);
  const markets = [{ tokens: [{ name: "USDC", index: 0 }, { name: "HYPE", index: 150 }], universe: [{ name: "@107", index: 0, tokens: [150, 0] }] }, [{ midPx: "85" }]];
  const fills = [
    { coin: "@107", px: "87.5", sz: "2", side: "B", time: at("2026-09-20T01:00:00Z"), dir: "Buy", closedPnl: "0.0", fee: "0.01", feeToken: "HYPE", tid: 7 },
    { coin: "BTC", px: "60000", sz: "0.1", side: "A", time: at("2026-09-21T01:00:00Z"), dir: "Close Long", closedPnl: "150.5", fee: "2.5", feeToken: "USDC", tid: 8 },
  ];
  const ledger = [
    { time: at("2026-09-19T01:00:00Z"), hash: "0xa", delta: { type: "send", user: "0xbridge", destination: address, token: "USDC", amount: "500.0", fee: "0.0" } },
    { time: at("2026-09-19T02:00:00Z"), hash: "0xb", delta: { type: "deposit", usdc: "100.0" } },
    { time: at("2026-09-19T03:00:00Z"), hash: "0xc", delta: { type: "withdraw", usdc: "40.0", fee: "1.0", nonce: 1 } },
    { time: at("2026-09-19T04:00:00Z"), hash: "0xd", delta: { type: "send", user: address, destination: "0xother", token: "HYPE", amount: "1.5", fee: "0.0" } },
    { time: at("2026-09-19T05:00:00Z"), hash: "0xe", delta: { type: "borrowLend", token: "UBTC", operation: "withdraw", amount: "0.1", interestAmount: "0.002" } },
    // Moves within the account are not activity.
    { time: at("2026-09-19T06:00:00Z"), hash: "0xf", delta: { type: "borrowLend", token: "UBTC", operation: "supply", amount: "0.1", interestAmount: "0.0" } },
    { time: at("2026-09-19T07:00:00Z"), hash: "0x10", delta: { type: "cStakingTransfer", token: "HYPE", amount: "9.9", isDeposit: true } },
    { time: at("2026-09-19T08:00:00Z"), hash: "0x11", delta: { type: "accountClassTransfer", usdc: "50.0", toPerp: true } },
    { time: at("2026-09-19T09:00:00Z"), hash: "0x12", delta: { type: "send", user: address, destination: address, token: "USDC", amount: "5.0" } },
  ];
  const funding = (iso: string, usdc: string) => ({ time: at(iso), hash: "0x0", delta: { type: "funding", coin: "BTC", usdc, szi: "0.1", fundingRate: "0.0001", nSamples: null } });
  const responses: Record<string, unknown> = {
    spotMetaAndAssetCtxs: markets, userFillsByTime: fills, userNonFundingLedgerUpdates: ledger,
    userFunding: [funding("2026-09-20T01:00:00Z", "-1.25"), funding("2026-09-20T02:00:00Z", "0.25"), funding("2026-09-24T01:00:00Z", "-9.0")],
    delegatorRewards: [{ time: at("2026-09-20T00:00:00Z"), source: "delegation", totalAmount: "0.0005" }],
    portfolio: [["allTime", { accountValueHistory: [[at("2026-09-17T00:00:00Z"), "0.0"], [at("2026-09-19T00:00:00Z"), "500.0"], [at("2026-09-23T00:00:00Z"), "600.0"]] }], ["perpAllTime", { accountValueHistory: [[at("2026-09-23T00:00:00Z"), "1.0"]] }]],
  };
  const io = (data = responses): ProviderIO => ({ text: unused, quotes: unused, pause: async () => {}, json: async (url, _headers, _signal, body) => {
    expect(url.href).toBe("https://api.hyperliquid.xyz/info");
    const query = body as { type: string; startTime?: number };
    const rows = data[query.type];
    // Time-range queries repeat until a page has nothing new.
    return query.startTime === undefined || !Array.isArray(rows) ? rows : rows.filter((row) => (row as { time: number }).time >= query.startTime!);
  } });
  const history = (data = responses) => fetchHistory({ provider: "hyperliquid", address }, io(data), now);
  const entry = async (id: string) => (await history()).entries.find((e) => e.externalId === id)!;

  test("money in and out are transfers, whichever way the ledger words them", async () => {
    expect(await entry(`ledger:${at("2026-09-19T01:00:00Z")}:0xa:send`)).toMatchObject({ kind: "transfer", amount: 500, currency: "USDC", description: "Hyperliquid deposit · USDC", occurredOn: "2026-09-19", accountKey: `address:${address}` });
    expect(await entry(`ledger:${at("2026-09-19T02:00:00Z")}:0xb:deposit`)).toMatchObject({ kind: "transfer", amount: 100 });
    expect(await entry(`ledger:${at("2026-09-19T03:00:00Z")}:0xc:withdraw`)).toMatchObject({ kind: "transfer", amount: -40, description: "Hyperliquid withdrawal · USDC" });
    expect(await entry(`ledger:${at("2026-09-19T03:00:00Z")}:0xc:withdraw:fee`)).toMatchObject({ kind: "fee", amount: -1, currency: "USDC" });
    expect(await entry(`ledger:${at("2026-09-19T04:00:00Z")}:0xd:send`)).toMatchObject({ kind: "transfer", amount: -1.5, currency: "HYPE" });
  });
  test("moves within the account are left out, and lending interest is kept", async () => {
    const { entries } = await history();
    const ledgerRows = entries.filter((e) => e.externalId.startsWith("ledger:") && !e.externalId.endsWith(":fee"));
    expect(ledgerRows).toHaveLength(5);
    expect(await entry(`ledger:${at("2026-09-19T05:00:00Z")}:0xe:borrowLend`)).toMatchObject({ kind: "interest", amount: 0.002, currency: "UBTC" });
    expect(entries.some((e) => e.externalId.includes("cStakingTransfer") || e.externalId.includes("accountClassTransfer"))).toBe(false);
  });
  test("spot fills swap coins for USDC; a perp's size never counts as money moved", async () => {
    expect(await entry("fill:7:B")).toMatchObject({ kind: "trade", amount: -175, currency: "USDC", description: "Buy 2 HYPE @ 87.5", realizedPnl: null });
    expect(await entry("fill:7:B:fee")).toMatchObject({ kind: "fee", amount: -0.01, currency: "HYPE" });
    expect(await entry("fill:8:A")).toMatchObject({ kind: "trade", amount: 150.5, currency: "USDC", description: "Close Long 0.1 BTC @ 60000", realizedPnl: 150.5 });
  });
  test("funding is one line per coin per finished UTC day, so re-reading never changes a record", async () => {
    expect(await entry("funding:BTC:2026-09-20")).toMatchObject({ kind: "interest", amount: -1, currency: "USDC", description: "Perp funding · BTC", occurredOn: "2026-09-20" });
    const { entries } = await history();
    expect(entries.some((e) => e.externalId === "funding:BTC:2026-09-24")).toBe(false);
  });
  test("staking rewards are HYPE rewards", async () => {
    expect(await entry(`staking:delegation:${at("2026-09-20T00:00:00Z")}`)).toMatchObject({ kind: "reward", amount: 0.0005, currency: "HYPE" });
  });
  test("Hyperliquid's own account value fills the chart from the first funded day, in dollars", async () => {
    const { nav, coverage } = await history();
    expect(nav).toEqual([
      { accountKey: `address:${address}`, date: "2026-09-19", value: 500, currency: "USD" },
      { accountKey: `address:${address}`, date: "2026-09-23", value: 600, currency: "USD" },
    ]);
    expect(coverage).toMatchObject({ from: "2026-08-25", to: "2026-09-24" });
  });
  test("a token the ledger cannot name as an asset is skipped, and malformed numbers reject the history", async () => {
    const outcome = { time: at("2026-09-19T01:00:00Z"), hash: "0x20", delta: { type: "send", user: "0xa", destination: address, token: "+1230", amount: "5" } };
    const { entries } = await history({ ...responses, userNonFundingLedgerUpdates: [outcome], userFillsByTime: [], userFunding: [], delegatorRewards: [] });
    expect(entries).toHaveLength(0);
    const bad = { time: 1, hash: "0x21", delta: { type: "deposit", usdc: "" } };
    await expect(history({ ...responses, userNonFundingLedgerUpdates: [bad] })).rejects.toThrow();
  });
  test("pages until nothing new arrives, without repeating rows on the shared timestamp", async () => {
    const page = (time: number, tid: number) => ({ ...fills[0], time, tid });
    const calls: number[] = [];
    const pages = [[page(at("2026-09-20T01:00:00Z"), 1), page(at("2026-09-20T02:00:00Z"), 2)], [page(at("2026-09-20T02:00:00Z"), 2), page(at("2026-09-20T03:00:00Z"), 3)], [page(at("2026-09-20T03:00:00Z"), 3)]];
    const result = await fetchHistory({ provider: "hyperliquid", address }, { ...io(), json: async (_url, _headers, _signal, body) => {
      const query = body as { type: string; startTime: number };
      if (query.type !== "userFillsByTime") return responses[query.type];
      calls.push(query.startTime);
      return pages[calls.length - 1];
    } }, now);
    expect(calls).toHaveLength(3);
    expect(result.entries.filter((e) => e.kind === "trade")).toHaveLength(3);
  });
});
