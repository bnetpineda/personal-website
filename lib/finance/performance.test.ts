import { describe, expect, test } from "bun:test";
import type { ConnectedPosition } from "./connections/types";
import type { HoldingCost } from "./imports/holding-costs";
import { accountTotals, changeSince, combineChanges, fxToUsd, moverRows, navTotals, profitLossCoverage, snapshotDay, topMovers, withCurrent } from "./performance";

const fx = { USD: 56, EUR: 62 };
const position = (overrides: Partial<ConnectedPosition>): ConnectedPosition => ({
  id: overrides.symbol ?? "X", name: overrides.symbol ?? "X", symbol: "X", assetClass: "stock", currency: "USD",
  quantity: 1, marketValue: 100, costBasis: 80, ...overrides,
});
const coin = (symbol: string, pnlUsd: number, status: HoldingCost["status"] = "estimate", marketValue = 50): HoldingCost => ({
  symbol, heldQuantity: 1, trackedQuantity: 1, positionCount: 1, status, lines: [], reasons: [],
  pnlEstimate: { currency: "USDT", quantity: 1, coverage: 1, averageCost: marketValue - pnlUsd, cost: marketValue - pnlUsd, marketValue,
    pnl: pnlUsd, pnlPct: pnlUsd / (marketValue - pnlUsd), costUsd: marketValue - pnlUsd, pnlUsd },
});

describe("fxToUsd", () => {
  test("crosses through the PHP rates", () => {
    expect(fxToUsd(fx, "USD")).toBe(1);
    expect(fxToUsd(fx, "EUR")).toBeCloseTo(62 / 56);
    expect(fxToUsd(fx, "PHP")).toBeCloseTo(1 / 56);
    expect(fxToUsd(fx, "JPY")).toBeNull();
    expect(fxToUsd({}, "EUR")).toBeNull();
  });
});

describe("accountTotals", () => {
  test("IBKR: net value with cash, cost and P/L from reported cost basis only", () => {
    const totals = accountTotals("ibkr", [
      position({ symbol: "VOO", marketValue: 500, costBasis: 400 }),
      position({ symbol: "ASML", currency: "EUR", marketValue: 100, costBasis: 120 }),
      position({ symbol: "NEW", marketValue: 50, costBasis: null }),
      position({ symbol: "USD", assetClass: "cash", marketValue: -30, costBasis: -30 }),
    ], fx);
    const eur = 62 / 56;
    expect(totals.valueUsd).toBeCloseTo(500 + 100 * eur + 50 - 30);
    expect(totals.costUsd).toBeCloseTo(400 + 120 * eur);
    expect(totals.pnlUsd).toBeCloseTo(100 - 20 * eur);
    expect(totals.missingFx).toEqual([]);
  });
  test("leaves out positions without a price or a rate, and says which currencies", () => {
    const totals = accountTotals("ibkr", [position({ marketValue: null }), position({ currency: "JPY", marketValue: 1000, costBasis: 900 })], fx);
    expect(totals).toEqual({ valueUsd: 0, costUsd: null, pnlUsd: null, missingFx: ["JPY"] });
  });
  test("a reported cost of 0 on a held position is unknown cost, not 100% profit", () => {
    const totals = accountTotals("ibkr", [position({ symbol: "VOO", marketValue: 500, costBasis: 0 }), position({ symbol: "ASML", marketValue: 100, costBasis: 80 })], fx);
    expect(totals).toMatchObject({ valueUsd: 600, costUsd: 80, pnlUsd: 20 });
    expect(accountTotals("ibkr", [position({ marketValue: 500, costBasis: 0 })], fx)).toMatchObject({ costUsd: null, pnlUsd: null });
  });
  test("Binance: value from balances, P/L from every coin with a Spot purchase estimate", () => {
    const positions = [
      position({ id: "spot:BTC", symbol: "BTC", assetClass: "crypto", marketValue: 300, costBasis: null }),
      position({ id: "spot:SOL", symbol: "SOL", assetClass: "crypto", marketValue: 100, costBasis: null }),
      // Unpriced Earn receipt covered by the flexible position: never counted twice.
      position({ id: "spot:LDSOL", symbol: "LDSOL", assetClass: "crypto", quantity: 1, marketValue: null, costBasis: null }),
      position({ id: "flexible:SOL", symbol: "SOL", assetClass: "crypto", quantity: 1, marketValue: 100, costBasis: null }),
    ];
    // Partial estimates count (Earn rewards make nearly every coin partial); coins without one do not.
    const unavailable: HoldingCost = { ...coin("ETH", 0), status: "unavailable", pnlEstimate: null };
    const totals = accountTotals("binance", positions, fx, [coin("BTC", 50, "estimate", 300), coin("SOL", 40, "partial", 200), unavailable]);
    expect(totals.valueUsd).toBe(500);
    expect(totals.costUsd).toBe(250 + 160);
    expect(totals.pnlUsd).toBe(90);
    expect(accountTotals("binance", positions, fx, [unavailable])).toMatchObject({ costUsd: null, pnlUsd: null });
  });
});

describe("profit/loss coverage", () => {
  test("a zero broker basis is unknown; cash and dust do not make P/L partial", () => {
    expect(profitLossCoverage("ibkr", [
      position({ symbol: "VOO", marketValue: 500, costBasis: 0 }),
      position({ symbol: "KNOWN", marketValue: 100, costBasis: 80 }),
      position({ symbol: "USD", assetClass: "cash", marketValue: 50, costBasis: null }),
      position({ symbol: "DUST", marketValue: 0.5, costBasis: null }),
    ], fx)).toEqual({ known: 1, missing: 1 });
  });

  test("Binance coverage counts a coin once across Spot and Earn, and requires a usable estimate", () => {
    const positions = [
      position({ id: "spot:BTC", symbol: "BTC", assetClass: "crypto", costBasis: null }),
      position({ id: "earn:BTC", symbol: "BTC", assetClass: "crypto", costBasis: null }),
      position({ symbol: "ETH", assetClass: "crypto", costBasis: null }),
    ];
    expect(profitLossCoverage("binance", positions, fx, [coin("BTC", 10), { ...coin("ETH", 0), pnlEstimate: null }])).toEqual({ known: 1, missing: 1 });
    expect(profitLossCoverage("ibkr", [], fx)).toEqual({ known: 0, missing: 0 });
  });
});

describe("snapshotDay", () => {
  test("IBKR keeps the statement date; Binance uses the Manila day it was read", () => {
    expect(snapshotDay("ibkr", "2026-09-30T00:00:00.000Z")).toBe("2026-09-30");
    expect(snapshotDay("binance", "2026-09-30T17:00:00.000Z")).toBe("2026-10-01");
  });
});

describe("history", () => {
  const points = [
    { date: "2026-09-01", value: 100 },
    { date: "2026-09-10", value: 120 },
    { date: "2026-09-20", value: 90 },
    { date: "2026-10-01", value: 110 },
  ];
  test("live balances replace a saved row for the same day", () => {
    const merged = withCurrent([{ date: "2026-09-30", valueUsd: 1, pnlUsd: null }, { date: "2026-10-01", valueUsd: 2, pnlUsd: 0 }], { date: "2026-10-01", valueUsd: 3, pnlUsd: 1 });
    expect(merged).toEqual([{ date: "2026-09-30", valueUsd: 1, pnlUsd: null }, { date: "2026-10-01", valueUsd: 3, pnlUsd: 1 }]);
  });
  test("changeSince starts at the last point on or before the date", () => {
    expect(changeSince(points, "2026-09-15")).toEqual({ change: -10, base: 120, pct: -10 / 120, from: "2026-09-10" });
    expect(changeSince(points, "2026-09-20")).toMatchObject({ change: 20, from: "2026-09-20" });
  });
  test("changeSince uses the first point while history is younger than the period", () => {
    expect(changeSince(points, "2026-08-01")).toMatchObject({ change: 10, pct: 0.1, from: "2026-09-01" });
  });
  test("no change without two points, or when the start is the latest point", () => {
    expect(changeSince(points.slice(0, 1), "2026-08-01")).toBeNull();
    expect(changeSince(points, "2026-10-05")).toBeNull();
    expect(changeSince([{ date: "2026-09-01", value: 0 }, { date: "2026-09-02", value: 5 }], "2026-09-01")).toMatchObject({ change: 5, pct: null });
  });
  test("combineChanges adds amounts and weighs the percentage by starting value", () => {
    const combined = combineChanges([{ change: 10, base: 100, pct: 0.1, from: "2026-09-05" }, null, { change: -5, base: 400, pct: -5 / 400, from: "2026-09-02" }]);
    expect(combined).toEqual({ change: 5, base: 500, pct: 0.01, from: "2026-09-02" });
    expect(combineChanges([null])).toBeNull();
  });
});

describe("movers", () => {
  test("IBKR rows skip cash, unknown cost and holdings under US$1", () => {
    const rows = moverRows("ibkr", [
      position({ symbol: "VOO", marketValue: 500, costBasis: 400 }),
      position({ symbol: "USD", assetClass: "cash", marketValue: 50, costBasis: 50 }),
      position({ symbol: "NEW", marketValue: 50, costBasis: null }),
      position({ symbol: "DUST", marketValue: 0.5, costBasis: 1 }),
    ], fx);
    expect(rows).toEqual([{ symbol: "VOO", pnlUsd: 100, pnlPct: 0.25 }]);
  });
  test("Binance rows come from each coin's estimate, partial ones included", () => {
    const rows = moverRows("binance", [], fx, [coin("BTC", 50), coin("SOL", -20), coin("ETH", 30, "partial"), coin("PEPE", 0.1, "estimate", 0.5),
      { ...coin("DOGE", 0), status: "unavailable", pnlEstimate: null }]);
    expect(rows.map((r) => r.symbol)).toEqual(["BTC", "SOL", "ETH"]);
  });
  test("IBKR rows treat a reported cost of 0 as unknown", () => {
    expect(moverRows("ibkr", [position({ symbol: "VOO", marketValue: 500, costBasis: 0 })], fx)).toEqual([]);
  });
  test("topMovers ranks gains and losses by amount", () => {
    const { winners, losers } = topMovers([
      { symbol: "A", pnlUsd: 10, pnlPct: 2 }, { symbol: "B", pnlUsd: 50, pnlPct: 0.1 }, { symbol: "C", pnlUsd: -5, pnlPct: -0.5 },
      { symbol: "D", pnlUsd: -40, pnlPct: -0.1 }, { symbol: "E", pnlUsd: 0, pnlPct: 0 },
    ], 1);
    expect(winners.map((m) => m.symbol)).toEqual(["B"]);
    expect(losers.map((m) => m.symbol)).toEqual(["D"]);
  });
});

describe("navTotals", () => {
  test("sums accounts per day in dollars and drops days some account did not report", () => {
    const totals = navTotals([
      { accountKey: "U1", date: "2026-09-02", value: 100, currency: "USD" },
      { accountKey: "U2", date: "2026-09-02", value: 56, currency: "EUR" },
      { accountKey: "U1", date: "2026-09-01", value: 90, currency: "USD" },
      { accountKey: "U1", date: "2026-09-03", value: 95, currency: "USD" },
      { accountKey: "U2", date: "2026-09-01", value: 50, currency: "EUR" },
    ], fx);
    expect(totals.map((t) => t.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(totals[1].valueUsd).toBeCloseTo(100 + 56 * 62 / 56);
  });
  test("a day with a currency that has no rate, or a repeated account, is skipped", () => {
    expect(navTotals([{ accountKey: "U1", date: "2026-09-01", value: 1, currency: "JPY" }], fx)).toEqual([]);
    expect(navTotals([
      { accountKey: "U1", date: "2026-09-01", value: 1, currency: "USD" },
      { accountKey: "U1", date: "2026-09-01", value: 2, currency: "USD" },
    ], fx)).toEqual([]);
  });
});
