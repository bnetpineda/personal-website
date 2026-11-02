import { describe, expect, test } from "bun:test";
import { HYPERLIQUID_FILL_LIMIT, hyperliquidSnapshot, recordedCosts, spotMarkets, type HyperliquidState } from "./hyperliquid";
import { credentialsSchema } from "./types";

/** Synthetic account shaped like a real one: HYPE staked, UBTC lent, almost nothing left in spot. */
const address = "0x00000000000000000000000000000000000000aa";
const markets = [{
  tokens: [{ name: "USDC", index: 0 }, { name: "HYPE", index: 150 }, { name: "UBTC", index: 197 }, { name: "ODD", index: 300 }, { name: "USDT0", index: 268 }, { name: "CROSS", index: 400 }],
  universe: [{ name: "@107", index: 0, tokens: [150, 0] }, { name: "@142", index: 1, tokens: [197, 0] }, { name: "@166", index: 2, tokens: [268, 0] }, { name: "@200", index: 3, tokens: [400, 268] }],
}, [{ midPx: "85", markPx: "84", dayNtlVlm: "100" }, { midPx: null, markPx: "77000", dayNtlVlm: "100" }, { midPx: "0.5", dayNtlVlm: "1" }, { midPx: "10", dayNtlVlm: "1" }]];
const fill = (coin: string, side: "A" | "B", sz: string, px: string, fee: string, feeToken: string, time = 1) =>
  ({ coin, side, sz, px, fee, feeToken, time, dir: side === "B" ? "Buy" : "Sell", closedPnl: "0.0", tid: time, hash: "0x1" });
const state = (overrides: Partial<HyperliquidState> = {}): HyperliquidState => ({
  address, abstraction: "unifiedAccount", markets,
  spot: { balances: [{ coin: "USDC", token: 0, total: "0.5", hold: "0.0", entryNtl: "0.0" }] },
  perps: [{ marginSummary: { accountValue: "0.0" }, assetPositions: [] }],
  lending: { tokenToState: [[150, { borrow: { value: "0.0" }, supply: { value: "0.0" } }], [197, { borrow: { value: "0.0" }, supply: { value: "0.01" } }]] },
  staking: { delegated: "10.0", undelegated: "0.0", totalPendingWithdrawal: "0.0" },
  vaults: [], rewards: [{ time: 2, source: "delegation", totalAmount: "0.01" }],
  portfolio: [["day", { accountValueHistory: [[1, "1"], [2, "1620.5"]] }], ["perpDay", { accountValueHistory: [[3, "0.0"]] }]],
  fills: [fill("@107", "B", "10", "80", "0.01", "HYPE"), fill("@142", "B", "0.01", "70000", "0", "UBTC")],
  ...overrides,
});
const row = (snapshot: ReturnType<typeof hyperliquidSnapshot>, id: string) => snapshot.positions.find((p) => p.id === id)!;

describe("Hyperliquid balances", () => {
  test("staked and lent coins count, valued at USDC markets, and match the account value", () => {
    const snapshot = hyperliquidSnapshot(state());
    expect(row(snapshot, "staking")).toMatchObject({ name: "HYPE · Staked", symbol: "HYPE", assetClass: "crypto", currency: "USD", marketValue: 850 });
    expect(row(snapshot, "lending:197")).toMatchObject({ name: "UBTC · Lending", marketValue: 770 });
    expect(row(snapshot, "spot:USDC")).toMatchObject({ assetClass: "cash", marketValue: 0.5, costBasis: 0.5 });
    expect(snapshot.positions).toHaveLength(3);
    expect(snapshot.warnings.some((w) => w.includes("differ"))).toBe(false);
    expect(snapshot.accountKey).toBe(`address:${address}`);
  });
  test("staking counts undelegated and unstaking coins, and debt is negative", () => {
    const snapshot = hyperliquidSnapshot(state({
      staking: { delegated: "1.0", undelegated: "2.0", totalPendingWithdrawal: "3.0" },
      lending: { tokenToState: [[0, { borrow: { value: "100.0" }, supply: { value: "0.0" } }]] },
    }));
    expect(row(snapshot, "staking").quantity).toBe(6);
    expect(row(snapshot, "borrow:0")).toMatchObject({ name: "USDC · Borrowed", quantity: -100, marketValue: -100 });
  });
  test("warns when the positions drift from Hyperliquid's own account value", () => {
    const snapshot = hyperliquidSnapshot(state({ portfolio: [["day", { accountValueHistory: [[2, "2000"]] }]] }));
    expect(snapshot.warnings.some((w) => w.includes("differ"))).toBe(true);
  });
  test("a token without a market stays visible, unvalued and out of the total", () => {
    const snapshot = hyperliquidSnapshot(state({ spot: { balances: [{ coin: "ODD", total: "5" }] } }));
    expect(row(snapshot, "spot:ODD").marketValue).toBeNull();
    expect(snapshot.warnings.some((w) => w.includes("no Hyperliquid market"))).toBe(true);
  });
  test("a token quoted only in another stablecoin is crossed through it, and mid falls back to mark", () => {
    const { prices } = spotMarkets(markets);
    expect(prices.get("USDC")).toBe(1);
    expect(prices.get("CROSS")).toBe(5);
    expect(prices.get("UBTC")).toBe(77000);
  });
  test("malformed numbers reject the snapshot instead of becoming zero", () => {
    expect(() => hyperliquidSnapshot(state({ staking: { delegated: "", undelegated: "0", totalPendingWithdrawal: "0" } }))).toThrow();
    expect(() => hyperliquidSnapshot(state({ spot: { error: "nope" } }))).toThrow();
  });
  test("wallet addresses are validated and normalized, and a private key is refused", () => {
    expect(credentialsSchema.parse({ provider: "hyperliquid", address: " 0xABCDEF0000000000000000000000000000ABCDEF " })).toEqual({ provider: "hyperliquid", address: "0xabcdef0000000000000000000000000000abcdef" });
    expect(credentialsSchema.safeParse({ provider: "hyperliquid", address: `0x${"a".repeat(64)}` }).success).toBe(false);
    expect(credentialsSchema.safeParse({ provider: "hyperliquid", address: "not an address" }).success).toBe(false);
  });
});

describe("Hyperliquid perps", () => {
  const long = { position: { coin: "BTC", szi: "0.1", entryPx: "60000", unrealizedPnl: "200", leverage: { type: "cross", value: 10 } } };
  const short = { position: { coin: "xyz:TSLA", szi: "-2", entryPx: "100", unrealizedPnl: "-5", leverage: { type: "isolated", value: 5 } } };
  const noCoins = { lending: { tokenToState: [] }, staking: { delegated: "0", undelegated: "0", totalPendingWithdrawal: "0" }, portfolio: [] };
  test("a position counts as margin plus unrealized P/L, never its full size, and the total is the account value", () => {
    const snapshot = hyperliquidSnapshot(state({ ...noCoins, abstraction: "default", spot: { balances: [] },
      perps: [{ marginSummary: { accountValue: "1000" }, assetPositions: [long] }, { marginSummary: { accountValue: "100" }, assetPositions: [short] }] }));
    expect(row(snapshot, "perp:BTC")).toMatchObject({ name: "BTC long · 10x perp", quantity: 0.1, marketValue: 800, costBasis: 600, assetClass: "crypto" });
    expect(row(snapshot, "perp:xyz:TSLA")).toMatchObject({ name: "xyz:TSLA short · 5x perp", quantity: -2, marketValue: 35, costBasis: 40, assetClass: "other" });
    expect(row(snapshot, "perp-margin")).toMatchObject({ assetClass: "cash", marketValue: 265 });
    expect(snapshot.positions.reduce((sum, p) => sum + p.marketValue!, 0)).toBeCloseTo(1100);
  });
  test("a unified account holds its margin in the spot USDC balance, so it is not counted twice", () => {
    const snapshot = hyperliquidSnapshot(state({ ...noCoins, spot: { balances: [{ coin: "USDC", total: "1000" }] },
      perps: [{ marginSummary: { accountValue: "800" }, assetPositions: [long] }] }));
    expect(row(snapshot, "spot:USDC").marketValue).toBe(400);
    expect(row(snapshot, "perp:BTC").marketValue).toBe(800);
    expect(snapshot.positions.some((p) => p.id === "perp-margin")).toBe(false);
    expect(snapshot.positions.reduce((sum, p) => sum + p.marketValue!, 0)).toBe(1200);
  });
});

describe("Hyperliquid cost estimates", () => {
  const pairs = spotMarkets(markets);
  const parsed = (rows: ReturnType<typeof fill>[]) => rows.map((r) => ({ ...r, px: Number(r.px), sz: Number(r.sz), fee: Number(r.fee), closedPnl: 0, tid: String(r.tid) }));
  test("buys net of coin fees, and staking rewards add units that cost nothing", () => {
    const lots = recordedCosts(parsed([fill("@107", "B", "10", "80", "0.01", "HYPE")]), pairs, 0.01);
    expect(lots.get("HYPE")!.cost).toBe(800);
    expect(lots.get("HYPE")!.quantity).toBeCloseTo(10);
  });
  test("selling reduces cost in proportion, and USDC fees add to it", () => {
    const lots = recordedCosts(parsed([fill("@107", "B", "10", "80", "1", "USDC", 1), fill("@107", "A", "5", "90", "1", "USDC", 2)]), pairs, 0);
    expect(lots.get("HYPE")).toEqual({ quantity: 5, cost: 400.5 });
  });
  test("selling more than was bought, or trading outside USDC, leaves the coin without a cost", () => {
    expect(recordedCosts(parsed([fill("@107", "A", "5", "90", "0", "USDC")]), pairs, 0).has("HYPE")).toBe(false);
    expect(recordedCosts(parsed([fill("@200", "B", "5", "10", "0", "CROSS")]), pairs, 0).has("CROSS")).toBe(false);
  });
  test("perp fills never touch spot costs", () => {
    expect(recordedCosts(parsed([fill("BTC", "B", "1", "60000", "1", "USDC")]), pairs, 0).size).toBe(0);
  });
  test("a coin's cost follows its units across staking, lending and spot", () => {
    const snapshot = hyperliquidSnapshot(state({
      spot: { balances: [{ coin: "HYPE", total: "4" }] }, staking: { delegated: "6.0", undelegated: "0", totalPendingWithdrawal: "0" },
      fills: [fill("@107", "B", "10", "80", "0", "USDC")], rewards: [],
    }));
    expect(row(snapshot, "spot:HYPE").costBasis).toBeCloseTo(320);
    expect(row(snapshot, "staking").costBasis).toBeCloseTo(480);
  });
  test("coins from outside the wallet's buys have no cost rather than showing as profit", () => {
    const snapshot = hyperliquidSnapshot(state({ fills: [fill("@107", "B", "5", "80", "0", "USDC")], rewards: [] }));
    expect(row(snapshot, "staking").costBasis).toBeNull();
    expect(row(snapshot, "lending:197").costBasis).toBeNull();
  });
  test("a wallet with more fills than Hyperliquid keeps gets no estimate, and says so", () => {
    const snapshot = hyperliquidSnapshot(state({ fills: Array.from({ length: HYPERLIQUID_FILL_LIMIT }, () => fill("@107", "B", "10", "80", "0", "USDC")) }));
    expect(row(snapshot, "staking").costBasis).toBeNull();
    expect(snapshot.warnings.some((w) => w.includes("more fills"))).toBe(true);
  });
});
