import { describe, expect, test } from "bun:test";
import { monthlySeries } from "./calc";
import { dashboardMonth } from "./dashboard";
import { statementCoverage } from "./imports/coverage";

const coverage = statementCoverage([
  { provider: "wise", month: "2026-09", entries: 7, importedAt: null },
  { provider: "wise", month: "2026-11", entries: 2, importedAt: null },
  { provider: "maribank", month: "2026-09", entries: 5, importedAt: null },
]);

const point = (month: string, income = 0, expense = 0) => ({ month, income, expense, net: income - expense });

describe("dashboard recorded totals", () => {
  test("an uncovered empty month is unknown, not three zero totals", () => {
    expect(dashboardMonth(point("2026-10"), coverage, "2026-11")).toEqual({
      month: "2026-10", income: null, expense: null, net: null, incomplete: true, missing: ["wise", "maribank"],
    });
  });

  test("a covered month keeps genuine zero totals", () => {
    expect(dashboardMonth(point("2026-09"), coverage, "2026-11")).toEqual({
      month: "2026-09", income: 0, expense: 0, net: 0, incomplete: false, missing: [],
    });
  });

  test("recorded income does not imply zero spending or a known net", () => {
    const month = dashboardMonth(point("2026-11", 1200), coverage, "2026-11");
    expect(month.income).toBe(1200);
    expect(month.expense).toBeNull();
    expect(month.net).toBeNull();
    expect(month.missing).toEqual(["maribank"]);
  });

  test("recorded spending does not imply zero income or a known net", () => {
    const month = dashboardMonth(point("2026-11", 0, 500), coverage, "2026-11");
    expect(month.expense).toBe(500);
    expect(month.income).toBeNull();
    expect(month.net).toBeNull();
  });

  test("partial positive totals stay visible and their recorded net can be zero", () => {
    const month = dashboardMonth(point("2026-11", 500, 500), coverage, "2026-11");
    expect(month).toMatchObject({ income: 500, expense: 500, net: 0, incomplete: true });
  });

  test("months before tracking and internal statement gaps stay unknown", () => {
    expect(dashboardMonth(point("2026-08"), coverage, "2026-11").net).toBeNull();
    expect(dashboardMonth(point("2026-10"), coverage, "2026-11").income).toBeNull();
  });

  test("future empty months are not reported as zero even without tracked banks", () => {
    expect(dashboardMonth(point("2026-12"), {}, "2026-11")).toMatchObject({
      income: null, expense: null, net: null, incomplete: true,
    });
  });

  test("manual-only tracking retains recorded zeros without invented statement requirements", () => {
    expect(dashboardMonth(point("2026-11", 1200), {}, "2026-11")).toMatchObject({
      income: 1200, expense: 0, net: 1200, incomplete: false, missing: [],
    });
  });

  test("charts and tiles use the same availability for every zero-filled month", () => {
    const series = monthlySeries("2026-11", 3, [{ month: "2026-11", kind: "income", total: 1200 }])
      .map((p) => dashboardMonth(p, coverage, "2026-11"));
    expect(series.map((p) => p.income)).toEqual([0, null, 1200]);
    expect(series.map((p) => p.expense)).toEqual([0, null, null]);
    expect(series.map((p) => p.net)).toEqual([0, null, null]);
  });
});
