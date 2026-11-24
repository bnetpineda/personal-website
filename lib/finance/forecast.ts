import { addDays } from "./dates";

/*
 * Where cash is heading over the next few months. Pure (no I/O), unit-tested with `bun test`.
 *
 * It starts from the cash you hold today and adds, day by day:
 *   - every scheduled occurrence on its date (income in, bills out);
 *   - pay from imported payers, spread evenly over the month (it has no schedule);
 *   - the rest of your spending, also spread evenly: average monthly spending minus what
 *     schedules already take, so a bill isn't counted twice.
 * Three lines come out: on your lowest-paid month's pace, your average one, and your highest.
 */

/** Days in an average month. */
const MONTH_DAYS = 30.44;

export interface ForecastInput {
  today: string;
  /** How many days ahead to project. */
  days: number;
  /** PHP held in cash today. */
  cash: number;
  /** Scheduled occurrences after today, in PHP: positive for income, negative for spending. */
  scheduled: readonly { date: string; amountPhp: number }[];
  /** PHP a month from payers that have no schedule (imports): the low, average and high month. */
  income: { low: number; average: number; high: number };
  /** PHP a month of spending that no schedule covers. */
  spending: number;
}

export interface ForecastPoint {
  date: string;
  low: number;
  expected: number;
  high: number;
}

export interface Forecast {
  points: ForecastPoint[];
  /** The day the low line bottoms out. */
  lowest: ForecastPoint;
  end: ForecastPoint;
}

export function cashForecast({ today, days, cash, scheduled, income, spending }: ForecastInput): Forecast {
  const byDay = new Map<string, number>();
  for (const s of scheduled) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.amountPhp);
  const perDay = (monthly: number) => (monthly - spending) / MONTH_DAYS;
  const points: ForecastPoint[] = [];
  let fixed = 0;
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    if (i > 0) fixed += byDay.get(date) ?? 0;
    points.push({
      date,
      low: cash + fixed + perDay(income.low) * i,
      expected: cash + fixed + perDay(income.average) * i,
      high: cash + fixed + perDay(income.high) * i,
    });
  }
  const lowest = points.reduce((a, b) => (b.low < a.low ? b : a));
  return { points, lowest, end: points.at(-1)! };
}

/**
 * Spending that no schedule covers, a month: average spending minus scheduled expenses. Never
 * below zero, since schedules can cost more than a month you recorded only part of.
 */
export function unscheduledSpending(averageSpending: number | null, scheduledMonthly: number): number {
  return averageSpending == null ? 0 : Math.max(averageSpending - scheduledMonthly, 0);
}
