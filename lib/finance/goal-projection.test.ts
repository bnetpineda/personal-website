import { describe, expect, test } from "bun:test";
import { addDays } from "./dates";
import { goalPace, projectGoal, projectLine, trendPerMonth } from "./goals";

const today = "2026-11-20";
/** A point every 3 days over the last `days`, rising `perDay`. */
const rising = (days: number, perDay: number, start = 100_000) =>
  Array.from({ length: Math.floor(days / 3) + 1 }, (_, i) => ({ date: addDays(today, -days + i * 3), value: start + perDay * i * 3 }));

describe("pace", () => {
  test("a steady rise reads as its slope, a month", () => {
    expect(trendPerMonth(rising(60, 1_000), today)).toBeCloseTo(30_440, 6);
  });

  test("only the last 90 days count", () => {
    const old = [{ date: "2026-01-01", value: 9_999_999 }];
    expect(trendPerMonth([...old, ...rising(60, 1_000)], today)).toBeCloseTo(30_440, 6);
  });

  test("too little history has no pace", () => {
    expect(trendPerMonth(rising(9, 1_000), today)).toBeNull();
    expect(trendPerMonth(rising(60, 1_000).slice(0, 3), today)).toBeNull();
  });

  test("each measure reads its own figure; the emergency fund in months of spending", () => {
    const history = rising(60, 1_000).map((p) => ({ date: p.date, netWorth: p.value * 2, assets: p.value * 3, cash: p.value }));
    expect(goalPace("cash", history, 30_440, today)).toBeCloseTo(30_440, 6);
    expect(goalPace("net_worth", history, null, today)).toBeCloseTo(60_880, 6);
    expect(goalPace("investments", history, null, today)).toBeCloseTo(60_880, 6);
    expect(goalPace("emergency_fund", history, 30_440, today)).toBeCloseTo(1, 6);
    expect(goalPace("emergency_fund", history, null, today)).toBeNull();
    expect(goalPace("manual", history, null, today)).toBeNull();
  });
});

describe("when a goal is reached", () => {
  test("what's left over the pace, from today", () => {
    const p = projectGoal({ reached: false, remaining: 60_880 }, 30_440, today, "2027-03-01");
    expect(p).toEqual({ status: "on-pace", on: addDays(today, 61), months: 2, late: false });
  });

  test("later than the goal's own date reads as late", () => {
    const p = projectGoal({ reached: false, remaining: 300_000 }, 30_440, today, "2027-01-01");
    expect(p.status === "on-pace" && p.late).toBe(true);
  });

  test("reached, falling, too slow, or without history", () => {
    expect(projectGoal({ reached: true, remaining: 0 }, 1, today, null)).toEqual({ status: "reached" });
    expect(projectGoal({ reached: false, remaining: 10 }, -5, today, null)).toEqual({ status: "not-closer" });
    expect(projectGoal({ reached: false, remaining: 1_000_000 }, 1, today, null)).toEqual({ status: "too-far" });
    expect(projectGoal({ reached: false, remaining: 10 }, null, today, null).status).toBe("unknown");
    expect(projectGoal({ reached: false, remaining: 10 }, 5, today, null, true).status).toBe("unknown");
  });
});

test("a projected line runs from today's value to the last day", () => {
  const line = projectLine(1_000, 30.44, today, 10, 7);
  expect(line.map((p) => p.date)).toEqual([today, addDays(today, 7), addDays(today, 10)]);
  expect(line.at(-1)!.value).toBeCloseTo(1_010, 6);
});
