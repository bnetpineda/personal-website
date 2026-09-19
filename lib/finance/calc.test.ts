import { describe, expect, test } from "bun:test";
import {
  allocation,
  applyAdjustment,
  budgetProgress,
  computeNetWorth,
  holdingMetrics,
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
