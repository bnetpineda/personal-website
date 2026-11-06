import type { GoalMeasure } from "./constants";
import { daysBetween } from "./dates";

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
