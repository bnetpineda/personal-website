import { describe, expect, test } from "bun:test";
import type { ProviderIO } from "../connections/providers";
import { USDT_RATE_REUSED_WARNING } from "../connections/providers";
import { fetchAccount } from "./providers";

const unused = async (): Promise<never> => { throw new Error("Unexpected request"); };
const now = new Date("2026-09-24T10:00:00Z");
const ibkr = { provider: "ibkr" as const, token: "test-token", queryId: "123" };
const ready = "<FlexStatementResponse><Status>Success</Status><ReferenceCode>999</ReferenceCode></FlexStatementResponse>";
const report = (statements: string) => `<FlexQueryResponse><FlexStatements>${statements}</FlexStatements></FlexQueryResponse>`;
const statement = (from: string, to: string) => `<FlexStatement accountId="TEST1" fromDate="${from}" toDate="${to}">
  <OpenPositions><OpenPosition conid="101" symbol="TEST" description="Test" currency="USD" assetCategory="STK" position="2" positionValue="240" costBasisMoney="200" levelOfDetail="SUMMARY" /></OpenPositions>
  <CashReport><CashReportCurrency currency="USD" endingCash="100" /></CashReport>
  <CashTransactions><CashTransaction type="Dividends" amount="5" currency="USD" transactionID="77" reportDate="20260915" description="TEST dividend" /></CashTransactions>
  <Trades></Trades>
</FlexStatement>`;

describe("one sync asks each provider once for what balances and history share", () => {
  test("IBKR: one 30-day Flex report gives both the balances and the history", async () => {
    const requests: string[] = [];
    const io: ProviderIO = { json: unused, quotes: unused, pause: async () => {}, text: async (url) => {
      if (url.pathname.endsWith("SendRequest")) { requests.push(url.searchParams.get("p") ?? "saved"); return ready; }
      return report(statement("20260825", "20260923"));
    } };
    const { snapshot, history } = await fetchAccount(ibkr, { io, now });
    expect(requests).toEqual(["30"]);
    expect(snapshot.positions.map((p) => p.id)).toEqual(["TEST1:position:101:USD", "TEST1:cash:USD"]);
    expect(snapshot.asOf).toBe("2026-09-23T00:00:00.000Z");
    expect(history.ok && history.value.entries.map((e) => e.externalId)).toEqual(["cash:77"]);
  });

  test("IBKR: a query broken out per day falls back to the saved period for balances", async () => {
    const requests: string[] = [];
    const io: ProviderIO = { json: unused, quotes: unused, pause: async () => {}, text: async (url) => {
      if (url.pathname.endsWith("SendRequest")) { requests.push(url.searchParams.get("p") ?? "saved"); return ready; }
      // The 30-day request came back as one statement per day; the saved period is a single day.
      return requests.at(-1) === "30" ? report(statement("20260922", "20260922") + statement("20260923", "20260923")) : report(statement("20260923", "20260923"));
    } };
    const { snapshot, history } = await fetchAccount(ibkr, { io, now });
    expect(requests).toEqual(["30", "saved"]);
    expect(snapshot.positions).toHaveLength(2);
    // Per-day statements never made a valid history; that stays a history error, not a failed sync.
    expect(history.ok).toBe(false);
  });

  test("IBKR: a history the query can't provide only reports an error; balances still sync", async () => {
    const io: ProviderIO = { json: unused, quotes: unused, pause: async () => {}, text: async (url) =>
      url.pathname.endsWith("SendRequest") ? ready : report(statement("20260825", "20260923").replace("<Trades></Trades>", "")) };
    const { snapshot, history } = await fetchAccount(ibkr, { io, now });
    expect(snapshot.positions).toHaveLength(2);
    expect(history.ok).toBe(false);
  });

  const address = "0x00000000000000000000000000000000000000aa";
  const hyperliquid = (body: Record<string, unknown>): unknown => {
    switch (body.type) {
      case "userRole": return { role: "user" };
      case "perpDexs": return [null];
      case "userAbstraction": return "default";
      case "spotMetaAndAssetCtxs": return [{ tokens: [{ name: "USDC", index: 0 }], universe: [] }, []];
      case "spotClearinghouseState": return { balances: [] };
      case "borrowLendUserState": return { tokenToState: [] };
      case "delegatorSummary": return { delegated: "0.0", undelegated: "0.0", totalPendingWithdrawal: "0.0" };
      case "clearinghouseState": return { marginSummary: { accountValue: "0.0" }, assetPositions: [] };
      case "userFillsByTime": return (body.startTime as number) > Date.parse("2026-09-20T00:00:00Z") ? [] : [
        { coin: "BTC", px: "60000", sz: "0.1", side: "A", time: Date.parse("2026-01-02T00:00:00Z"), dir: "Close Long", closedPnl: "1.0", fee: "0", feeToken: "USDC", tid: 1 },
        { coin: "BTC", px: "60000", sz: "0.1", side: "A", time: Date.parse("2026-09-20T00:00:00Z"), dir: "Close Long", closedPnl: "2.0", fee: "0", feeToken: "USDC", tid: 2 },
      ];
      default: return [];
    }
  };

  test("Hyperliquid: markets, rewards, portfolio and fills are read once and shared with history", async () => {
    const calls: string[] = [];
    const fillStarts: number[] = [];
    const io: ProviderIO = { text: unused, quotes: unused, pause: async () => {}, json: async (_url, _headers, _signal, body) => {
      const query = body as { type: string; startTime?: number };
      calls.push(query.type);
      if (query.type === "userFillsByTime") fillStarts.push(query.startTime!);
      return hyperliquid(query);
    } };
    const { history } = await fetchAccount({ provider: "hyperliquid", address }, { io, now });
    for (const type of ["spotMetaAndAssetCtxs", "delegatorRewards", "portfolio"]) expect(calls.filter((c) => c === type)).toHaveLength(1);
    // Fills are paged once from the beginning (the next page starts at the last fill's time), never again from the history window.
    expect(fillStarts).toEqual([0, Date.parse("2026-09-20T00:00:00Z")]);
    expect(calls).toContain("userFunding");
    expect(calls).toContain("userNonFundingLedgerUpdates");
    // History keeps its 30-day window even though the snapshot read every fill.
    expect(history.ok && history.value.entries.filter((e) => e.kind === "trade").map((e) => e.externalId)).toEqual(["fill:2:A"]);
  });

  const binanceIO = (paths: string[], quotes: ProviderIO["quotes"]): ProviderIO => ({ text: unused, pause: async () => {}, quotes, json: async (url) => {
    paths.push(url.pathname);
    switch (url.pathname) {
      case "/api/v3/time": return { serverTime: Date.now() };
      case "/sapi/v1/account/apiRestrictions": return { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };
      case "/api/v3/account": return { uid: 123, balances: [{ asset: "USDT", free: "10", locked: "0" }] };
      case "/api/v3/ticker/price": return [];
      case "/sapi/v1/simple-earn/flexible/position": case "/sapi/v1/simple-earn/locked/position": return { total: 0, rows: [] };
      default: return url.pathname.includes("rewardsRecord") ? { total: 0, rows: [] } : [];
    }
  } });
  const binance = { provider: "binance" as const, apiKey: "test-read-key", apiSecret: "test-secret" };
  const tether = async () => new Map([["tether", { prices: { usd: 1 }, asOf: new Date() }]]);

  test("Binance: server time, key check and account are read once for balances and history", async () => {
    const paths: string[] = [];
    const { snapshot, history } = await fetchAccount(binance, { io: binanceIO(paths, tether), now: new Date() });
    expect(snapshot.accountKey).toBe("uid:123");
    expect(history.ok).toBe(true);
    for (const path of ["/api/v3/time", "/sapi/v1/account/apiRestrictions", "/api/v3/account"]) expect(paths.filter((p) => p === path)).toHaveLength(1);
    expect(paths.some((p) => p.includes("rewardsRecord"))).toBe(true);
  });

  test("Binance: when CoinGecko fails, a recent saved USDT rate is reused with a warning", async () => {
    const failing = async () => { throw new Error("CoinGecko rate limit hit"); };
    const previous = { asOf: new Date(Date.now() - 86_400_000).toISOString(), usdtUsd: 0.999, positions: [], warnings: [] };
    const { snapshot } = await fetchAccount(binance, { io: binanceIO([], failing), previous });
    expect(snapshot.usdtUsd).toBe(0.999);
    expect(snapshot.warnings).toContain(USDT_RATE_REUSED_WARNING);
    // Too old to stand in, or never saved: the sync still fails and keeps the previous balances.
    const stale = { ...previous, asOf: new Date(Date.now() - 5 * 86_400_000).toISOString() };
    await expect(fetchAccount(binance, { io: binanceIO([], failing), previous: stale })).rejects.toThrow("USDT/USD quote is unavailable");
    await expect(fetchAccount(binance, { io: binanceIO([], failing) })).rejects.toThrow("USDT/USD quote is unavailable");
  });
});
