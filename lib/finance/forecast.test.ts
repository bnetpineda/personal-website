import { describe, expect, test } from "bun:test";
import { cashForecast, unscheduledSpending } from "./forecast";

const base = { today: "2026-11-01", days: 61, cash: 100_000, scheduled: [], income: { low: 0, average: 0, high: 0 }, spending: 0 };

describe("cash forecast", () => {
  test("starts at today's cash and has a point a day", () => {
    const f = cashForecast(base);
    expect(f.points).toHaveLength(62);
    expect(f.points[0]).toEqual({ date: "2026-11-01", low: 100_000, expected: 100_000, high: 100_000 });
    expect(f.end.date).toBe("2027-01-01");
  });

  test("scheduled occurrences land on their day, and stay", () => {
    const f = cashForecast({ ...base, scheduled: [{ date: "2026-11-05", amountPhp: -20_000 }, { date: "2026-11-05", amountPhp: 5_000 }, { date: "2026-11-30", amountPhp: 50_000 }] });
    const on = (d: string) => f.points.find((p) => p.date === d)!.expected;
    expect(on("2026-11-04")).toBe(100_000);
    expect(on("2026-11-05")).toBe(85_000);
    expect(on("2026-12-15")).toBe(135_000);
  });

  test("a scheduled item due today is not counted again", () => {
    const f = cashForecast({ ...base, scheduled: [{ date: "2026-11-01", amountPhp: -1_000 }] });
    expect(f.end.expected).toBe(100_000);
  });

  test("unscheduled pay and spending spread evenly; the bands come from the low and high months", () => {
    const f = cashForecast({ ...base, days: 30, income: { low: 30_440, average: 60_880, high: 91_320 }, spending: 30_440 });
    expect(f.end.low).toBeCloseTo(100_000, 6);
    expect(f.end.expected).toBeCloseTo(130_000, 6);
    expect(f.end.high).toBeCloseTo(160_000, 6);
  });

  test("finds the lowest point of the low line", () => {
    const f = cashForecast({ ...base, scheduled: [{ date: "2026-11-10", amountPhp: -90_000 }, { date: "2026-11-20", amountPhp: 120_000 }] });
    expect(f.lowest.date).toBe("2026-11-10");
    expect(f.lowest.low).toBe(10_000);
  });

  test("spending that schedules already cover is taken off the average", () => {
    expect(unscheduledSpending(50_000, 20_000)).toBe(30_000);
    expect(unscheduledSpending(10_000, 20_000)).toBe(0);
    expect(unscheduledSpending(null, 20_000)).toBe(0);
  });
});
