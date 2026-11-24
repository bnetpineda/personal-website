import { sumInPhp, type FxTable } from "./calc";
import type { CashFlowKind, RecurrenceFrequency } from "./constants";
import { addMonths } from "./dates";
import { payeeKey, payeeOf } from "./payee";
import { monthlyEquivalent } from "./recurrence";

/*
 * Income that keeps arriving through imports (a client or employer paying into Wise every month)
 * counts towards Recurring's monthly totals without a schedule. A schedule would post a second
 * entry next to the imported one, so this reads what was actually received instead. Charges that
 * come back every month (subscriptions paid by card) are read the same way.
 *
 * Only closed months count: the month in progress holds part of a month's pay, so it would make
 * the latest rate and the average look lower than they are.
 */

/** One imported entry posted to Transactions (income or spending). */
export interface ImportedFlow {
  description: string;
  occurredOn: string;
  amount: number;
  currency: string;
  categoryName: string;
  categoryColor: string;
  categoryId?: number;
  account?: string | null;
}

export type ReceivedIncome = ImportedFlow;

export interface RepeatPayer {
  key: string;
  name: string;
  currency: string;
  /** The current rate: the latest closed month's pay, spread over the gap since the month before it paid. */
  monthly: number;
  /** Average received per month, from the first to the last closed month it paid. */
  average: number;
  /** Every payment seen, this month's included. */
  payments: number;
  /** The smallest and largest closed month it paid (hourly work swings between them). */
  low: number;
  high: number;
  /** What it paid each closed month (YYYY-MM → amount, in its currency). */
  byMonth: Record<string, number>;
  lastOn: string;
  categoryName: string;
  categoryColor: string;
  categoryId?: number;
  account?: string | null;
}

/** "Received from Centauri Media Ltd", or Wise's older "Received money from … with reference …" → the sender. */
export const payerName = payeeOf;

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));

/** The payee part of a repeat payer's key (keys are `payee|currency`). */
export const payeeOfKey = (key: string) => key.slice(0, key.lastIndexOf("|"));

/**
 * Payers seen in at least two different closed months (before `currentMonth`, YYYY-MM), largest
 * first. Entries in the current month only move `lastOn` and `payments`.
 */
export function repeatPayers(entries: ImportedFlow[], currentMonth: string): RepeatPayer[] {
  const groups = new Map<string, ImportedFlow[]>();
  for (const entry of entries) {
    // Digits change every month (invoice numbers, dates); the payer does not.
    const key = `${payeeKey(entry.description)}|${entry.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const payers: RepeatPayer[] = [];
  for (const [key, all] of groups) {
    const group = all.filter((e) => e.occurredOn.slice(0, 7) < currentMonth);
    if (group.length === 0) continue;
    const months = group.map((e) => monthIndex(e.occurredOn));
    const paid = [...new Set(months)].sort((a, b) => a - b);
    if (paid.length < 2) continue;
    const [previous, last] = paid.slice(-2);
    const latestMonth = group.filter((e) => monthIndex(e.occurredOn) === last).reduce((sum, e) => sum + e.amount, 0);
    const latest = all.reduce((a, b) => (b.occurredOn > a.occurredOn ? b : a));
    const byMonth: Record<string, number> = {};
    for (const e of group) byMonth[e.occurredOn.slice(0, 7)] = (byMonth[e.occurredOn.slice(0, 7)] ?? 0) + e.amount;
    payers.push({
      key,
      name: payerName(latest.description),
      currency: latest.currency,
      monthly: latestMonth / (last - previous),
      average: group.reduce((sum, e) => sum + e.amount, 0) / (last - paid[0] + 1),
      payments: all.length,
      low: Math.min(...Object.values(byMonth)),
      high: Math.max(...Object.values(byMonth)),
      byMonth,
      lastOn: latest.occurredOn,
      categoryName: latest.categoryName,
      categoryColor: latest.categoryColor,
      categoryId: latest.categoryId,
      account: latest.account,
    });
  }
  return payers.sort((a, b) => b.monthly - a.monthly || a.name.localeCompare(b.name));
}

/** Six closed months of imports, plus this one: long enough to see a payer repeat, recent enough to still be paying. */
export function importedIncomeSince(today: string): string {
  return `${addMonths(today.slice(0, 7), -6)}-01`;
}

export interface Subscription extends RepeatPayer {
  /** A typical charge (the median one), in its currency. */
  typical: number;
  /** When the next charge should land: a month after the last one (YYYY-MM-DD). */
  nextOn: string;
}

/** How far a charge may drift from the typical one and still read as the same subscription. */
const SUBSCRIPTION_SPREAD = 0.2;

/**
 * Imported charges that look like subscriptions: about one charge a month, of about the same
 * amount, in at least two closed months, the latest no more than two months ago. Groceries and
 * fuel repeat too, but several times a month and for different amounts, so they stay out.
 * Payees a schedule already covers (`scheduled`: descriptions of expense schedules) are left out.
 */
export function subscriptions(entries: ImportedFlow[], currentMonth: string, scheduled: Iterable<string> = []): Subscription[] {
  const covered = new Set([...scheduled].map(payeeKey));
  const out: Subscription[] = [];
  for (const charge of repeatPayers(entries, currentMonth)) {
    if (covered.has(payeeOfKey(charge.key))) continue;
    const mine = entries.filter((e) => e.occurredOn.slice(0, 7) < currentMonth && `${payeeKey(e.description)}|${e.currency}` === charge.key);
    const months = Object.keys(charge.byMonth).sort();
    // About once a month: one extra charge (a retried payment) is allowed.
    if (mine.length > months.length + 1) continue;
    if (monthIndex(`${months.at(-1)}-01`) < monthIndex(`${currentMonth}-01`) - 2) continue;
    const amounts = mine.map((e) => e.amount).sort((a, b) => a - b);
    const typical = amounts[Math.floor((amounts.length - 1) / 2)];
    if (!(typical > 0) || amounts.some((a) => Math.abs(a - typical) > typical * SUBSCRIPTION_SPREAD)) continue;
    const last = mine.reduce((a, b) => (b.occurredOn > a.occurredOn ? b : a)).occurredOn;
    out.push({ ...charge, typical, nextOn: nextMonthSameDay(charge.lastOn > last ? charge.lastOn : last) });
  }
  return out.sort((a, b) => b.typical - a.typical || a.name.localeCompare(b.name));
}

/** The same day next month, clamped to that month's last day (Jan 31 → Feb 28). */
export function nextMonthSameDay(day: string): string {
  const month = addMonths(day.slice(0, 7), 1);
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(Number(day.slice(8, 10)), last)).padStart(2, "0")}`;
}

type Schedule = { kind: CashFlowKind; amount: number; currency: string; frequency: RecurrenceFrequency; paused: boolean; nextOn: string | null };

/**
 * What a month brings in when pay varies (hourly work), in PHP: each repeat payer's average month plus
 * active income schedules, and the range from everyone's lowest month to everyone's highest. Plan
 * spending on `low`; what comes in above it is room to save.
 */
export function typicalIncome(fx: FxTable, schedules: Schedule[], payers: RepeatPayer[]) {
  const fixed = schedules.filter((r) => r.kind === "income" && !r.paused && r.nextOn != null)
    .map((r) => ({ amount: monthlyEquivalent(r.amount, r.frequency), currency: r.currency }));
  const sum = (pick: (p: RepeatPayer) => number) => sumInPhp(fx, [...fixed, ...payers.map((p) => ({ amount: pick(p), currency: p.currency }))]);
  const average = sum((p) => p.average);
  return { average: average.total, low: sum((p) => p.low).total, high: sum((p) => p.high).total, fixed: sumInPhp(fx, fixed).total, sources: fixed.length + payers.length, missing: average.missing };
}

/** Each month's pay from repeat payers, in PHP at today's rates: the months the typical figure is drawn from. */
export function repeatIncomeByMonth(fx: FxTable, payers: RepeatPayer[], months: string[]): { month: string; value: number }[] {
  return months.map((month) => ({ month, value: sumInPhp(fx, payers.map((p) => ({ amount: p.byMonth[month] ?? 0, currency: p.currency }))).total }));
}
