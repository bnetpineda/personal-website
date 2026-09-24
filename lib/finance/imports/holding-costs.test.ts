import { describe, expect, test } from "bun:test";
import type { ConnectedPosition, ConnectionSnapshot } from "../connections/types";
import { binanceHoldingRows, heldUsdtPairs, holdingCosts } from "./holding-costs";
import { summarizeSpotTrades } from "./spot";
import type { SpotTrade } from "./types";

const position = (symbol = "BTC", quantity = 1, id = `spot:${symbol}`): ConnectedPosition => ({
  id, symbol, name: symbol, quantity, assetClass: "crypto", marketValue: 200, currency: "USD", costBasis: null,
});
const snapshot = (positions = [position()]): ConnectionSnapshot => ({ asOf: "2026-09-24T10:00:00.000Z", accountKey: "uid:1", positions, warnings: [] });
const job = { accountKey: "uid:1", scope: "spot:BTCUSDT", completedAt: new Date("2026-09-24T11:00Z"), lastSyncedAt: new Date("2026-09-24T11:00Z"), error: null };
const entry = (id: number, overrides: Partial<SpotTrade> = {}) => ({ accountKey: "uid:1", externalId: `spot:BTCUSDT:${id}`, occurredOn: "2020-01-01",
  kind: "trade", currency: "USDT", status: "reviewed", trade: { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", quantity: 1,
    quoteQuantity: 100, price: 100, commission: 1, commissionAsset: "USDT", side: "BUY", executedAt: `2020-01-01T00:00:0${id}.000Z`, ...overrides } as SpotTrade });

describe("holding trade costs", () => {
  test("uses remaining FIFO lots and quote fees, without changing provider balances or claiming USD basis", () => {
    const s = snapshot([position("BTC", 1.5)]);
    const before = JSON.stringify(s);
    const rows = [entry(1), entry(2, { quoteQuantity: 200 }), entry(3, { side: "SELL", quantity: 0.5, quoteQuantity: 75 })];
    const [cost] = holdingCosts(s, rows, [job]);
    expect(cost.status).toBe("estimate");
    const summary = summarizeSpotTrades(rows, s.asOf);
    const prepared = holdingCosts(s, [], [job], { fifo: summary.fifo, ignoredBases: new Set(summary.ignoredBases), paymentAssets: new Set(summary.paymentAssets) })[0];
    expect(prepared).toEqual(cost);
    expect(cost.trackedQuantity).toBe(1.5);
    expect(cost.lines[0]).toMatchObject({ cost: 251.5, currency: "USDT" });
    expect(cost.lines[0].averageCost).toBeCloseTo(251.5 / 1.5);
    expect(JSON.stringify(s)).toBe(before);
    expect(s.positions[0].costBasis).toBeNull();
  });
  test("never borrows another account's trades or uses trades after the balance snapshot", () => {
    const rows = [entry(1), { ...entry(2), accountKey: "uid:2" }, entry(3, { executedAt: "2026-09-25T00:00:00.000Z" })];
    expect(holdingCosts(snapshot(), rows, [job])[0].trackedQuantity).toBe(1);
    expect(holdingCosts({ ...snapshot(), accountKey: undefined }, rows, [job])[0].status).toBe("unavailable");
    expect(holdingCosts(snapshot(), rows, [{ ...job, accountKey: "uid:2" }])[0].status).toBe("partial");
  });
  test("unknown acquisitions never become zero-cost lots, even if some purchases are known", () => {
    const [cost] = holdingCosts(snapshot([position("BTC", 1.1)]), [entry(1), {
      ...entry(2), trade: null, kind: "reward", currency: "BTC", externalId: "earn:flexible:reward",
    }], [job]);
    expect(cost.status).toBe("partial");
    expect(cost.lines[0].cost).toBe(101);
    expect(cost.trackedQuantity).toBe(1);
    expect(cost.reasons.some((r) => r.includes("rewards or transfers"))).toBe(true);
    expect(holdingCosts(snapshot(), [], [job])[0]).toMatchObject({ status: "unavailable", lines: [] });
    const [exhausted] = holdingCosts(snapshot(), [entry(1), entry(2, { side: "SELL" })], [job]);
    expect(exhausted.status).toBe("unavailable");
    expect(exhausted.reasons.some((r) => r.includes("used up"))).toBe(true);
  });
  test("the estimate is per coin across wallets and drops matched LD receipts", () => {
    const s = snapshot([position("BTC", 0.2), position("BTC", 0.8, "flexible:BTC001"), { ...position("LDBTC", 0.8), marketValue: null }]);
    const [cost] = holdingCosts(s, [entry(1)], [job]);
    expect(holdingCosts(s, [entry(1)], [job])).toHaveLength(1);
    expect(cost).toMatchObject({ status: "estimate", heldQuantity: 1, trackedQuantity: 1, positionCount: 2 });
    expect(cost.lines[0].cost).toBe(101);
  });
  test("unfinished, failed or older history is always qualified", () => {
    for (const j of [{ ...job, completedAt: null }, { ...job, error: "failed" }, { ...job, lastSyncedAt: new Date("2026-09-23") }]) {
      expect(holdingCosts(snapshot(), [entry(1)], [j])[0].status).toBe("partial");
    }
  });
  test("unmatched sells, ignored trades, third-coin fees and cross-market payment are gaps", () => {
    for (const rows of [
      [entry(1, { side: "SELL" }), entry(2)],
      [entry(1, { commissionAsset: "BNB" })],
      [entry(1), { ...entry(2), status: "ignored" }],
      [entry(1), entry(2, { symbol: "ETHBTC", baseAsset: "ETH", quoteAsset: "BTC", commission: 0 })],
      [entry(1), entry(2, { symbol: "ETHUSDT", baseAsset: "ETH", commissionAsset: "BTC" })],
      [entry(1), { ...entry(2), trade: null, kind: "fee", currency: "BTC", externalId: "withdraw:1:fee" }],
    ]) expect(holdingCosts(snapshot(), rows, [job])[0].status).toBe("partial");
  });
  test("never adds costs in different currencies and flags pair-specific FIFO", () => {
    const [cost] = holdingCosts(snapshot([position("BTC", 2)]), [entry(1), entry(2, { symbol: "BTCEUR", quoteAsset: "EUR" })], [job, { ...job, scope: "spot:BTCEUR" }]);
    expect(cost.status).toBe("partial");
    expect(cost.lines.map((l) => l.currency)).toEqual(["USDT", "EUR"]);
    expect(cost.reasons.some((r) => r.includes("separately per trading pair"))).toBe(true);
  });
  test("base-coin fees reduce bought units and float noise does not create a false mismatch", () => {
    const [cost] = holdingCosts(snapshot([position("BTC", 0.999000000000001)]), [entry(1, { commission: 0.001, commissionAsset: "BTC" })], [job]);
    expect(cost.status).toBe("estimate");
    expect(cost.lines[0]).toMatchObject({ quantity: 0.999, cost: 100 });
  });
});

test("market discovery deduplicates wallets, requires listed pairs, preserves LDO and has a bounded size", () => {
  expect(heldUsdtPairs([position(), position("BTC", 0.1, "flexible:BTC"), position("LDO"), position("USDT"), position("OBSOLETE")], ["BTCUSDT", "LDOUSDT"]))
    .toEqual({ pairs: ["BTCUSDT", "LDOUSDT"], skipped: ["OBSOLETE"] });
  const positions = Array.from({ length: 25 }, (_, i) => position(`COIN${i}`));
  const selected = heldUsdtPairs(positions, positions.map((p) => `${p.symbol}USDT`));
  expect(selected.pairs).toHaveLength(20);
  expect(selected.skipped).toHaveLength(5);
});

describe("estimated holding P/L", () => {
  test("uses the actual USDT/USD valuation rate and compares purchase cost in the same currency", () => {
    const [cost] = holdingCosts({ ...snapshot([{ ...position(), marketValue: 198 }]), usdtUsd: 0.99 }, [entry(1)], [job]);
    expect(cost.pnlEstimate).toMatchObject({ currency: "USDT", quantity: 1, coverage: 1, averageCost: 101, cost: 101, marketValue: 200, pnl: 99 });
    expect(cost.pnlEstimate!.pnlUsd).toBeCloseTo(98.01);
    expect(cost.pnlEstimate!.costUsd).toBeCloseTo(99.99);
    expect(cost.pnlEstimate!.pnlPct).toBeCloseTo(99 / 101);
  });
  test("reduces cost proportionally when historical lots exceed the current balance", () => {
    const [cost] = holdingCosts({ ...snapshot(), usdtUsd: 1 }, [entry(1, { quantity: 2, quoteQuantity: 200, commission: 2 })], [job]);
    expect(cost.lines[0].cost).toBe(202);
    expect(cost.status).toBe("partial");
    expect(cost.pnlEstimate).toMatchObject({ quantity: 1, coverage: 1, cost: 101, marketValue: 200, pnl: 99 });
  });
  test("extra units with unknown cost do not turn into fabricated profit", () => {
    const [cost] = holdingCosts({ ...snapshot([{ ...position("BTC", 5), marketValue: 1000 }]), usdtUsd: 1 },
      [entry(1, { quantity: 2, quoteQuantity: 200, commission: 2 })], [job]);
    expect(cost.pnlEstimate).toMatchObject({ quantity: 2, coverage: 0.4, cost: 202, marketValue: 400, pnl: 198 });
    expect(cost.heldQuantity).toBe(5);
  });
  test("legacy snapshots recover only their own USDT rate, never assume a dollar peg", () => {
    const s = snapshot([position(), { ...position("USDT", 10), marketValue: 9.7 }]);
    const [cost] = holdingCosts(s, [entry(1)], [job]);
    expect(cost.pnlEstimate!.costUsd).toBeCloseTo(97.97);
    expect(cost.pnlEstimate!.pnlUsd).toBeCloseTo(102.03);
    expect(holdingCosts(snapshot(), [entry(1)], [job])[0].pnlEstimate).toBeNull();
  });
  test("missing prices, unsupported quotes and unknown accounts stay unavailable; a zero price is a loss", () => {
    const s = { ...snapshot(), usdtUsd: 1 };
    expect(holdingCosts({ ...s, positions: [{ ...position(), marketValue: null }] }, [entry(1)], [job])[0].pnlEstimate).toBeNull();
    expect(holdingCosts(s, [entry(1, { quoteAsset: "BTC" })], [job])[0].pnlEstimate).toBeNull();
    expect(holdingCosts({ ...s, accountKey: undefined }, [entry(1)], [job])[0].pnlEstimate).toBeNull();
    expect(holdingCosts({ ...s, positions: [{ ...position(), marketValue: 0 }] }, [entry(1)], [job])[0].pnlEstimate!.pnl).toBe(-101);
  });
  test("combines wallets once, preserving value and unknown prices", () => {
    const positions = [{ ...position("BTC", 0.25), marketValue: 50 }, { ...position("BTC", 0.75, "flexible:BTC"), marketValue: 150 }];
    const original = JSON.stringify(positions);
    const combined = binanceHoldingRows(positions);
    expect(combined).toHaveLength(1);
    expect(combined[0]).toMatchObject({ quantity: 1, marketValue: 200, costBasis: null });
    expect(JSON.stringify(positions)).toBe(original);
    const costs = holdingCosts({ ...snapshot(positions), usdtUsd: 1 }, [entry(1)], [job]);
    expect(costs).toHaveLength(1);
    expect(costs[0].pnlEstimate!.pnlUsd).toBe(99);
    expect(binanceHoldingRows([positions[0], { ...positions[1], marketValue: null }])[0].marketValue).toBeNull();
  });
});
