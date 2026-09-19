import { TIMEZONE } from "./constants";

/* All calendar logic runs in Asia/Manila; months are "YYYY-MM", days are "YYYY-MM-DD". */

const dayParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Manila as YYYY-MM-DD. */
export function todayManila(now: Date = new Date()): string {
  const parts = Object.fromEntries(dayParts.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function currentMonth(now: Date = new Date()): string {
  return todayManila(now).slice(0, 7);
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  return `${year}-${String(index - year * 12 + 1).padStart(2, "0")}`;
}

/** Half-open date range [start, end) covering the month, for `date` column filters. */
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${addMonths(month, 1)}-01` };
}

export function monthLabel(month: string, style: "long" | "short" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { month: style, year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

function toUtcDays(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function daysBetween(from: string, to: string): number {
  return Math.round(toUtcDays(to) - toUtcDays(from));
}

export function addDays(day: string, delta: number): string {
  return new Date((toUtcDays(day) + delta) * 86_400_000).toISOString().slice(0, 10);
}

/** Next occurrence of a monthly due day (clamped to short months), counted from `today`. */
export function nextDueDate(dueDay: number, today: string): { date: string; inDays: number } {
  const month = today.slice(0, 7);
  const candidate = (m: string) => {
    const [y, mo] = m.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return `${m}-${String(Math.min(dueDay, lastDay)).padStart(2, "0")}`;
  };
  let date = candidate(month);
  if (date < today) date = candidate(addMonths(month, 1));
  return { date, inDays: daysBetween(today, date) };
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(then: Date, now: Date): string {
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
