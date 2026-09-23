import { describe, expect, test } from "bun:test";
import {
  allocation,
  applyAdjustment,
  budgetProgress,
  budgetSegments,
  computeNetWorth,
  connectedHoldingMetrics,
  holdingMetrics,
  isSmallHolding,
  monthlySeries,
  savingsRate,
  type Position,
} from "./calc";

const fx = { USD: 56, EUR: 62 };

const btc: Position = { assetClass: "crypto", quantity: 0.5, avgCost: 3_000_000, currency: "PHP", lastPrice: 5_000_000 };
const voo: Position = { assetClass: "etf", quantity: 10, avgCost: 400, currency: "USD", lastPrice: 500 };
const savings: Position = { assetClass: "cash", quantity: 120_000, avgCost: 1, currency: "PHP", lastPrice: null };

describe("holdingMetrics", () => {
  test("values a priced holding in native currency and PHP", () => {
    const m = holdingMetrics(voo, fx);
    expect(m.value).toBe(5000);
    expect(m.cost).toBe(4000);
    expect(m.pnl).toBe(1000);
    expect(m.pnlPct).toBeCloseTo(0.25);
    expect(m.valuePhp).toBe(280_000);
    expect(m.pnlPhp).toBe(56_000);
  });

  test("falls back to average cost when there is no price (cash / unpriced)", () => {
    const m = holdingMetrics(savings, fx);
    expect(m.hasPrice).toBe(false);
    expect(m.value).toBe(120_000);
    expect(m.pnl).toBe(0);
    expect(m.valuePhp).toBe(120_000);
  });

  test("reports null PHP values when the FX rate is unknown", () => {
    const m = holdingMetrics({ ...voo, currency: "JPY" }, fx);
    expect(m.rate).toBeNull();
    expect(m.valuePhp).toBeNull();
  });
});

describe("connected holding display metrics", () => {
  test("keeps Binance cost and P/L unknown while showing its market value", () => {
    expect(connectedHoldingMetrics({ currency: "USD", marketValue: 100, costBasis: null }, fx))
      .toEqual({ valuePhp: 5600, pnl: null, pnlPhp: null, pnlPct: null });
  });

  test("keeps unpriced balances unknown instead of valuing them at cost", () => {
    expect(connectedHoldingMetrics({ currency: "USD", marketValue: null, costBasis: 100 }, fx))
      .toEqual({ valuePhp: null, pnl: null, pnlPhp: null, pnlPct: null });
    expect(connectedHoldingMetrics({ currency: "JPY", marketValue: 120, costBasis: 100 }, fx))
      .toEqual({ valuePhp: null, pnl: 20, pnlPhp: null, pnlPct: 0.2 });
  });

  test("handles signed broker positions and zero market values without multiplying quantity again", () => {
    expect(connectedHoldingMetrics({ currency: "USD", marketValue: -80, costBasis: -100 }, fx))
      .toEqual({ valuePhp: -4480, pnl: 20, pnlPhp: 1120, pnlPct: 0.2 });
    expect(connectedHoldingMetrics({ currency: "USD", marketValue: 0, costBasis: 100 }, fx).pnlPct).toBe(-1);
    expect(connectedHoldingMetrics({ currency: "USD", marketValue: 100, costBasis: 0 }, fx).pnlPct).toBeNull();
  });
});

describe("minimum holding value", () => {
  test("hides values below one US dollar but keeps the boundary and larger signed positions", () => {
    expect(isSmallHolding(0, "USD", {})).toBe(true);
    expect(isSmallHolding(0.999, "USD", {})).toBe(true);
    expect(isSmallHolding(1, "USD", {})).toBe(false);
    expect(isSmallHolding(-0.5, "USD", {})).toBe(true);
    expect(isSmallHolding(-100, "USD", {})).toBe(false);
  });

  test("converts the holding's total value, not its unit price, to USD", () => {
    expect(isSmallHolding(55, "PHP", fx)).toBe(true);
    expect(isSmallHolding(56, "PHP", fx)).toBe(false);
    expect(isSmallHolding(0.5, "EUR", fx)).toBe(true);
    expect(isSmallHolding(1, "EUR", fx)).toBe(false);
    const pricedToken = holdingMetrics({ ...btc, quantity: 100, lastPrice: 1 }, fx);
    expect(isSmallHolding(pricedToken.value, "PHP", fx)).toBe(false);
  });

  test("never silently hides an unpriced balance or one with missing exchange rates", () => {
    expect(isSmallHolding(null, "USD", fx)).toBe(false);
    expect(isSmallHolding(0.01, "JPY", fx)).toBe(false);
    expect(isSmallHolding(10, "PHP", {})).toBe(false);
    expect(isSmallHolding(0, "JPY", {})).toBe(true);
  });
});

describe("applyAdjustment", () => {
  test("buying more recomputes the weighted average including the fee", () => {
    const r = applyAdjustment({ quantity: 10, avgCost: 100 }, { type: "buy", quantity: 10, price: 200, fee: 20 });
    expect(r).toEqual({ ok: true, quantity: 20, avgCost: 151 });
  });

  test("buying into an empty position uses the buy price", () => {
    const r = applyAdjustment({ quantity: 0, avgCost: 0 }, { type: "buy", quantity: 0.1, price: 3_000_000 });
    expect(r).toEqual({ ok: true, quantity: 0.1, avgCost: 3_000_000 });
  });

  test("strips float noise", () => {
    const r = applyAdjustment({ quantity: 0.1, avgCost: 1 }, { type: "buy", quantity: 0.2, price: 1 });
    expect(r).toEqual({ ok: true, quantity: 0.3, avgCost: 1 });
  });

  test("selling lowers quantity and keeps the average cost", () => {
    const r = applyAdjustment({ quantity: 10, avgCost: 151 }, { type: "sell", quantity: 4 });
    expect(r).toEqual({ ok: true, quantity: 6, avgCost: 151 });
  });

  test("selling everything lands exactly on zero", () => {
    const r = applyAdjustment({ quantity: 0.3, avgCost: 5 }, { type: "sell", quantity: 0.1 + 0.2 });
    expect(r).toEqual({ ok: true, quantity: 0, avgCost: 5 });
  });

  test("rejects overselling and non-positive quantities", () => {
    expect(applyAdjustment({ quantity: 1, avgCost: 5 }, { type: "sell", quantity: 2 }).ok).toBe(false);
    expect(applyAdjustment({ quantity: 1, avgCost: 5 }, { type: "sell", quantity: 0 }).ok).toBe(false);
    expect(applyAdjustment({ quantity: 1, avgCost: 5 }, { type: "buy", quantity: 1, price: -1 }).ok).toBe(false);
  });
});

describe("computeNetWorth", () => {
  test("sums assets, subtracts debts, and groups by class", () => {
    const nw = computeNetWorth([btc, voo, savings], [{ balance: 20_000, currency: "PHP" }, { balance: 100, currency: "USD" }], fx);
    expect(nw.assetsPhp).toBe(2_500_000 + 280_000 + 120_000);
    expect(nw.liabilitiesPhp).toBe(25_600);
    expect(nw.netWorthPhp).toBe(2_900_000 - 25_600);
    expect(nw.investedPhp).toBe(1_500_000 + 224_000 + 120_000);
    expect(nw.unrealizedPhp).toBe(1_000_000 + 56_000);
    // cash is excluded from the P/L % denominator
    expect(nw.unrealizedPct).toBeCloseTo(1_056_000 / 1_724_000);
    expect(nw.byClass).toEqual({ crypto: 2_500_000, etf: 280_000, cash: 120_000 });
    expect(nw.missingFx).toEqual([]);
  });

  test("skips archived rows and reports currencies without FX", () => {
    const nw = computeNetWorth([{ ...btc, archived: true }, { ...voo, currency: "JPY" }], [{ balance: 5, currency: "KRW" }], fx);
    expect(nw.assetsPhp).toBe(0);
    expect(nw.liabilitiesPhp).toBe(0);
    expect(nw.missingFx).toEqual(["JPY", "KRW"]);
  });
});

describe("helpers", () => {
  test("allocation shares sort largest first", () => {
    const a = allocation({ cash: 25, crypto: 75, stock: 0 });
    expect(a.map((x) => x.assetClass)).toEqual(["crypto", "cash"]);
    expect(a[0].share).toBe(0.75);
  });

  test("budget progress", () => {
    expect(budgetProgress(500, null)).toBeNull();
    expect(budgetProgress(500, 0)).toBeNull();
    expect(budgetProgress(1200, 1000)).toEqual({ ratio: 1.2, over: true, remaining: -200 });
  });

  test("budget segments add up to max(spent, budget)", () => {
    expect(budgetSegments(3200, 5000)).toEqual({ within: 3200, left: 1800, over: 0 });
    expect(budgetSegments(6000, 5000)).toEqual({ within: 5000, left: 0, over: 1000 });
    expect(budgetSegments(0, 5000)).toEqual({ within: 0, left: 5000, over: 0 });
    expect(budgetSegments(750, null)).toEqual({ within: 750, left: 0, over: 0 });
    expect(budgetSegments(750, 0)).toEqual({ within: 750, left: 0, over: 0 });
    expect(budgetSegments(100.1, 100.3)).toEqual({ within: 100.1, left: 0.2, over: 0 });
  });

  test("savings rate", () => {
    expect(savingsRate(0, 100)).toBeNull();
    expect(savingsRate(100_000, 60_000)).toBeCloseTo(0.4);
  });

  test("monthly series is zero-filled across the year boundary", () => {
    const series = monthlySeries("2026-02", 4, [
      { month: "2025-12", kind: "income", total: 100 },
      { month: "2026-02", kind: "expense", total: 40 },
    ]);
    expect(series.map((p) => p.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(series[1]).toEqual({ month: "2025-12", income: 100, expense: 0, net: 100 });
    expect(series[3]).toEqual({ month: "2026-02", income: 0, expense: 40, net: -40 });
  });
});
