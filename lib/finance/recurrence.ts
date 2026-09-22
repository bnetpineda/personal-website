import type { RecurrenceFrequency } from "./constants";
import { addDays, addMonths, daysBetween } from "./dates";

/*
 * Pure recurrence math for recurring income/expenses. Days are "YYYY-MM-DD" strings.
 * Occurrence n is always computed from the start date (never from the previous one), so
 * "monthly on the 31st" goes Jan 31 → Feb 28 → Mar 31 without drifting.
 */

export interface Schedule {
  frequency: RecurrenceFrequency;
  /** First occurrence; its day of month / weekday anchors the schedule. */
  startOn: string;
  /** Last day an occurrence may fall on (inclusive). */
  endOn?: string | null;
  /** Twice a month only: the other day of month (1–31, clamped to short months). */
  secondDay?: number | null;
}

const MONTH_STEP: Partial<Record<RecurrenceFrequency, number>> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };
const DAY_STEP: Partial<Record<RecurrenceFrequency, number>> = { weekly: 7, biweekly: 14 };

/** Hard stop so a bad schedule can never loop forever or flood the table. */
const MAX_OCCURRENCES = 500;

function lastDayOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function onDay(month: string, day: number): string {
  return `${month}-${String(Math.min(day, lastDayOf(month))).padStart(2, "0")}`;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** Default second payday for "twice a month": 15 days from the start day (15th → 30th, 20th → 5th). */
export function defaultSecondDay(startOn: string): number {
  const day = Number(startOn.slice(8, 10));
  return day <= 15 ? day + 15 : day - 15;
}

/** Every occurrence in [from, to] (inclusive), oldest first. */
export function occurrencesBetween(s: Schedule, from: string, to: string): string[] {
  const lo = from > s.startOn ? from : s.startOn;
  const hi = s.endOn && s.endOn < to ? s.endOn : to;
  if (lo > hi) return [];
  const out: string[] = [];

  const dayStep = DAY_STEP[s.frequency];
  if (dayStep) {
    let n = Math.max(0, Math.ceil(daysBetween(s.startOn, lo) / dayStep));
    for (let d = addDays(s.startOn, n * dayStep); d <= hi && out.length < MAX_OCCURRENCES; d = addDays(s.startOn, ++n * dayStep)) {
      out.push(d);
    }
    return out;
  }

  const startMonth = s.startOn.slice(0, 7);
  const anchor = Number(s.startOn.slice(8, 10));

  if (s.frequency === "semimonthly") {
    const days = [...new Set([anchor, s.secondDay ?? defaultSecondDay(s.startOn)])];
    for (let month = lo.slice(0, 7); month <= hi.slice(0, 7) && out.length < MAX_OCCURRENCES; month = addMonths(month, 1)) {
      const dates = [...new Set(days.map((d) => onDay(month, d)))].sort();
      for (const d of dates) if (d >= lo && d <= hi) out.push(d);
    }
    return out;
  }

  const step = MONTH_STEP[s.frequency] ?? 1;
  let k = Math.max(0, Math.floor(monthsBetween(startMonth, lo.slice(0, 7)) / step));
  for (let d = onDay(addMonths(startMonth, k * step), anchor); d <= hi && out.length < MAX_OCCURRENCES; d = onDay(addMonths(startMonth, ++k * step), anchor)) {
    if (d >= lo) out.push(d);
  }
  return out;
}

/** First occurrence on or after `day`, or null once the schedule has ended. */
export function nextOccurrence(s: Schedule, day: string): string | null {
  // The longest gap between occurrences is a year (plus a leap day).
  return occurrencesBetween(s, day, addDays(day, 370))[0] ?? null;
}

const PER_MONTH: Record<RecurrenceFrequency, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  semimonthly: 2,
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  yearly: 1 / 12,
};

/** Average amount per month, for "fixed income / expenses per month" totals. */
export function monthlyEquivalent(amount: number, frequency: RecurrenceFrequency): number {
  return amount * PER_MONTH[frequency];
}

function ordinal(day: number): string {
  if (day >= 31) return "last day";
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}

function utc(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Monthly on the 15th", "Every 2 weeks on Fri", "Twice a month · 15th & 30th", "Yearly on Mar 5". */
export function describeSchedule(s: Schedule): string {
  const day = Number(s.startOn.slice(8, 10));
  const the = (d: number) => (d >= 31 ? "the last day" : `the ${ordinal(d)}`);
  switch (s.frequency) {
    case "weekly":
    case "biweekly": {
      const weekday = new Intl.DateTimeFormat("en-PH", { weekday: "short", timeZone: "UTC" }).format(utc(s.startOn));
      return `${s.frequency === "weekly" ? "Weekly" : "Every 2 weeks"} on ${weekday}`;
    }
    case "semimonthly": {
      const days = [day, s.secondDay ?? defaultSecondDay(s.startOn)].sort((a, b) => a - b);
      return `Twice a month · ${ordinal(days[0])} & ${ordinal(days[1])}`;
    }
    case "monthly":
      return `Monthly on ${the(day)}`;
    case "quarterly":
      return `Every 3 months on ${the(day)}`;
    case "semiannual":
      return `Every 6 months on ${the(day)}`;
    case "yearly":
      return `Yearly on ${new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }).format(utc(s.startOn))}`;
  }
}

export interface Occurrence<T> {
  item: T;
  date: string;
}

/** Occurrences of many schedules in [from, to], sorted by date. */
export function occurrencesOf<T>(items: T[], schedule: (item: T) => Schedule & { from?: string | null }, from: string, to: string) {
  const out: Occurrence<T>[] = [];
  for (const item of items) {
    const s = schedule(item);
    const start = s.from && s.from > from ? s.from : from;
    for (const date of occurrencesBetween(s, start, to)) out.push({ item, date });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** A recurring row (DB or form input) as a `Schedule`. */
export function scheduleOf(r: Schedule): Schedule {
  return { frequency: r.frequency, startOn: r.startOn, endOn: r.endOn ?? null, secondDay: r.secondDay ?? null };
}

export interface RecurringState {
  paused: boolean;
  autoPost: boolean;
  /** Oldest occurrence not yet posted/confirmed/skipped; null when ended. */
  nextOn: string | null;
}

const live = <T extends Schedule & RecurringState>(items: T[]) => items.filter((r) => !r.paused && r.nextOn != null);

/** Occurrences waiting for confirmation (items set to "ask me"), up to `today`. */
export function dueOccurrences<T extends Schedule & RecurringState>(items: T[], today: string): Occurrence<T>[] {
  return occurrencesOf(
    live(items).filter((r) => !r.autoPost),
    (r) => ({ ...scheduleOf(r), from: r.nextOn }),
    "0001-01-01",
    today
  );
}

/** What's scheduled in [from, to]; confirm-mode items already due are left to dueOccurrences. */
export function upcomingOccurrences<T extends Schedule & RecurringState>(items: T[], today: string, from: string, to: string): Occurrence<T>[] {
  return occurrencesOf(live(items), (r) => ({ ...scheduleOf(r), from: r.nextOn }), from, to).filter(
    (o) => o.item.autoPost || o.date > today
  );
}
