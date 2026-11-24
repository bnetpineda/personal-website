import type { GoalMeasure } from "./constants";
import { addDays, daysBetween } from "./dates";

/* Goal progress. Pure (no I/O), unit-tested with `bun test`. */

/** The live figures a goal can measure, in PHP. Null when unknown (never read as zero). */
export interface GoalFigures {
  netWorth: number | null;
  cash: number | null;
  investments: number | null;
  /** Average monthly spending over recent complete months; null without enough records. */
  monthlySpending: number | null;
}

export interface GoalProgress {
  /** "months" for the emergency fund (months of spending covered), else PHP. */
  unit: "PHP" | "months";
  current: number | null;
  target: number;
  /** 0 to 1 and beyond; null when the current figure is unknown. */
  ratio: number | null;
  /** In the goal's unit; 0 once reached. */
  remaining: number | null;
  /** PHP to put aside each month to reach the target by its date; null without a date or once reached. */
  perMonth: number | null;
  reached: boolean;
  /** Why the figure is missing, in plain words. */
  missing: string | null;
}

export function goalProgress(
  goal: { measure: GoalMeasure; target: number; saved: number | null; targetOn: string | null },
  figures: GoalFigures,
  today: string,
): GoalProgress {
  const months = goal.measure === "emergency_fund";
  const spending = figures.monthlySpending != null && figures.monthlySpending > 0 ? figures.monthlySpending : null;
  const current =
    goal.measure === "manual" ? goal.saved
      : goal.measure === "net_worth" ? figures.netWorth
        : goal.measure === "cash" ? figures.cash
          : goal.measure === "investments" ? figures.investments
            : figures.cash == null || spending == null ? null : figures.cash / spending;
  const missing = current != null ? null
    : months ? (spending == null ? "Needs a few months of recorded spending" : "Needs a cash balance")
      : "No figure yet: connect or add an account";
  const ratio = current == null ? null : current / goal.target;
  const remaining = current == null ? null : Math.max(goal.target - current, 0);
  const reached = current != null && current >= goal.target;
  // What's left to save, in pesos: the emergency fund's months become months of spending.
  const leftPhp = remaining == null ? null : months ? (spending == null ? null : remaining * spending) : remaining;
  const monthsLeft = goal.targetOn ? daysBetween(today, goal.targetOn) / 30.44 : null;
  const perMonth = reached || leftPhp == null || monthsLeft == null ? null : leftPhp / Math.max(monthsLeft, 1);
  return { unit: months ? "months" : "PHP", current, target: goal.target, ratio, remaining, perMonth, reached, missing };
}

/** Average of the months that recorded any spending, so a month with no statements doesn't drag it down. */
export function averageMonthlySpending(months: readonly { expense: number | null; incomplete?: boolean }[]): number | null {
  const counted = months.flatMap((m) => (m.expense != null && m.expense > 0 && !m.incomplete ? [m.expense] : []));
  return counted.length >= 2 ? counted.reduce((sum, v) => sum + v, 0) / counted.length : null;
}

/* ---- pace and projections ---- */

/** Days in an average month. */
const MONTH_DAYS = 30.44;
/** The pace is read from this many days of history, and needs at least `MIN_SPAN_DAYS` of it. */
export const PACE_WINDOW_DAYS = 90;
const MIN_SPAN_DAYS = 28;
const MIN_POINTS = 4;
/** Further out than this, a date says nothing useful. */
const MAX_PROJECTION_MONTHS = 50 * 12;

/**
 * How fast a figure has been moving, per month: the least-squares slope through the points of the
 * last `windowDays` (dated YYYY-MM-DD). Null with too little history to read a pace from.
 */
export function trendPerMonth(points: readonly { date: string; value: number }[], today: string, windowDays = PACE_WINDOW_DAYS): number | null {
  const from = addDays(today, -windowDays);
  const recent = points.filter((p) => p.date >= from && p.date <= today && Number.isFinite(p.value));
  if (recent.length < MIN_POINTS) return null;
  const xs = recent.map((p) => daysBetween(from, p.date));
  if (Math.max(...xs) - Math.min(...xs) < MIN_SPAN_DAYS) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = recent.reduce((a, p) => a + p.value, 0) / recent.length;
  let num = 0;
  let den = 0;
  recent.forEach((p, i) => {
    num += (xs[i] - meanX) * (p.value - meanY);
    den += (xs[i] - meanX) ** 2;
  });
  return den === 0 ? null : (num / den) * MONTH_DAYS;
}

/** A day of the net-worth history, as goals read it. */
export interface GoalHistoryPoint {
  date: string;
  netWorth: number;
  assets: number;
  cash: number;
}

/**
 * How fast a goal's figure has been moving, a month, in the goal's own unit (months of spending for
 * the emergency fund). Goals you update by hand have no history to read a pace from.
 */
export function goalPace(measure: GoalMeasure, history: readonly GoalHistoryPoint[], monthlySpending: number | null, today: string): number | null {
  const series = (value: (p: GoalHistoryPoint) => number) => trendPerMonth(history.map((p) => ({ date: p.date, value: value(p) })), today);
  switch (measure) {
    case "net_worth": return series((p) => p.netWorth);
    case "cash": return series((p) => p.cash);
    case "investments": return series((p) => p.assets - p.cash);
    case "emergency_fund": {
      const pace = series((p) => p.cash);
      return pace == null || monthlySpending == null || monthlySpending <= 0 ? null : pace / monthlySpending;
    }
    case "manual": return null;
  }
}

export type GoalProjection =
  | { status: "reached" }
  | { status: "unknown"; reason: string }
  | { status: "not-closer" }
  | { status: "too-far" }
  | { status: "on-pace"; on: string; months: number; late: boolean | null };

/**
 * When a goal is reached at the pace it has been moving: what's left divided by the pace. `late`
 * compares that date with the goal's own (null without one).
 */
export function projectGoal(
  progress: Pick<GoalProgress, "reached" | "remaining">,
  pacePerMonth: number | null,
  today: string,
  targetOn: string | null,
  manual = false,
): GoalProjection {
  if (progress.reached) return { status: "reached" };
  if (manual) return { status: "unknown", reason: "A goal you update by hand has no history to read a pace from" };
  if (progress.remaining == null) return { status: "unknown", reason: "No figure yet" };
  if (pacePerMonth == null) return { status: "unknown", reason: "Needs about a month of daily history" };
  if (pacePerMonth <= 0) return { status: "not-closer" };
  const months = progress.remaining / pacePerMonth;
  if (months > MAX_PROJECTION_MONTHS) return { status: "too-far" };
  const on = addDays(today, Math.ceil(months * MONTH_DAYS));
  return { status: "on-pace", on, months, late: targetOn ? on > targetOn : null };
}

/** A straight line carried forward from today's value at a monthly pace, every `stepDays` up to `days` ahead. */
export function projectLine(value: number, pacePerMonth: number, today: string, days: number, stepDays = 7): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  for (let d = 0; d <= days; d += stepDays) out.push({ date: addDays(today, d), value: value + (pacePerMonth / MONTH_DAYS) * d });
  if (days % stepDays !== 0) out.push({ date: addDays(today, days), value: value + (pacePerMonth / MONTH_DAYS) * days });
  return out;
}
