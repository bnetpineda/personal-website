import { describe, expect, test } from "bun:test";
import { averageMonthlySpending, goalProgress } from "./goals";

const figures = { netWorth: 500_000, cash: 120_000, investments: 380_000, monthlySpending: 40_000 };
const today = "2026-11-06";

describe("goal progress", () => {
  test("an emergency fund counts months of spending that cash covers", () => {
    const p = goalProgress({ measure: "emergency_fund", target: 6, saved: null, targetOn: null }, figures, today);
    expect(p.unit).toBe("months");
    expect(p.current).toBe(3);
    expect(p.ratio).toBe(0.5);
    expect(p.remaining).toBe(3);
  });

  test("with a date, it says what to put aside each month, in pesos", () => {
    const p = goalProgress({ measure: "emergency_fund", target: 6, saved: null, targetOn: "2027-11-06" }, figures, today);
    // Three months of spending left, over about twelve months.
    expect(p.perMonth).toBeCloseTo(120_000 / 12, -2);
  });

  test("live measures read the matching figure; manual goals read what was entered", () => {
    expect(goalProgress({ measure: "net_worth", target: 1_000_000, saved: null, targetOn: null }, figures, today).ratio).toBe(0.5);
    expect(goalProgress({ measure: "investments", target: 380_000, saved: null, targetOn: null }, figures, today).reached).toBe(true);
    expect(goalProgress({ measure: "manual", target: 50_000, saved: 10_000, targetOn: null }, figures, today).remaining).toBe(40_000);
  });

  test("an unknown figure stays unknown, never zero progress", () => {
    const p = goalProgress({ measure: "emergency_fund", target: 6, saved: null, targetOn: "2027-01-01" }, { ...figures, monthlySpending: null }, today);
    expect(p.current).toBeNull();
    expect(p.ratio).toBeNull();
    expect(p.perMonth).toBeNull();
    expect(p.missing).toContain("spending");
  });

  test("a reached goal asks for nothing more", () => {
    const p = goalProgress({ measure: "cash", target: 100_000, saved: null, targetOn: "2027-01-01" }, figures, today);
    expect(p.reached).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.perMonth).toBeNull();
  });
});

describe("average monthly spending", () => {
  test("leaves out empty and incomplete months, and needs two to call it typical", () => {
    expect(averageMonthlySpending([{ expense: 30_000 }, { expense: 50_000 }, { expense: 0 }, { expense: 10, incomplete: true }])).toBe(40_000);
    expect(averageMonthlySpending([{ expense: 30_000 }])).toBeNull();
  });
});
