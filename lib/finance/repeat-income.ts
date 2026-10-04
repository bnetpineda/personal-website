import { sumInPhp, type FxTable } from "./calc";
import type { CashFlowKind, RecurrenceFrequency } from "./constants";
import { addMonths } from "./dates";
import { payeeOf } from "./payee";
import { monthlyEquivalent } from "./recurrence";

/*
 * Income that keeps arriving through imports (a client or employer paying into Wise every month)
 * counts towards Recurring's monthly totals without a schedule. A schedule would post a second
 * entry next to the imported one, so this reads what was actually received instead.
 */

export interface ReceivedIncome {
  description: string;
  occurredOn: string;
  amount: number;
  currency: string;
  categoryName: string;
  categoryColor: string;
}

export interface RepeatPayer {
  key: string;
  name: string;
  currency: string;
  /** The current rate: the latest month's pay, spread over the gap since the month before it paid. */
  monthly: number;
  /** Average received per month, from the first to the last month it paid. */
  average: number;
  payments: number;
  /** The smallest and largest month it paid (hourly work swings between them). */
  low: number;
  high: number;
  /** What it paid each month (YYYY-MM → amount, in its currency). */
  byMonth: Record<string, number>;
  lastOn: string;
  categoryName: string;
  categoryColor: string;
}

/** "Received from Centauri Media Ltd", or Wise's older "Received money from … with reference …" → the sender. */
export const payerName = payeeOf;

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));

/** Payers seen in at least two different months, largest first. */
export function repeatPayers(entries: ReceivedIncome[]): RepeatPayer[] {
  const groups = new Map<string, ReceivedIncome[]>();
  for (const entry of entries) {
    // Digits change every month (invoice numbers, dates); the payer does not.
    const key = `${payerName(entry.description).toLowerCase().replace(/[\d\W_]+/g, " ").trim()}|${entry.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const payers: RepeatPayer[] = [];
  for (const [key, group] of groups) {
    const months = group.map((e) => monthIndex(e.occurredOn));
    const paid = [...new Set(months)].sort((a, b) => a - b);
    if (paid.length < 2) continue;
    const [previous, last] = paid.slice(-2);
    const latestMonth = group.filter((e) => monthIndex(e.occurredOn) === last).reduce((sum, e) => sum + e.amount, 0);
    const latest = group.reduce((a, b) => (b.occurredOn > a.occurredOn ? b : a));
    const byMonth: Record<string, number> = {};
    for (const e of group) byMonth[e.occurredOn.slice(0, 7)] = (byMonth[e.occurredOn.slice(0, 7)] ?? 0) + e.amount;
    payers.push({
      key,
      name: payerName(latest.description),
      currency: latest.currency,
      monthly: latestMonth / (last - previous),
      average: group.reduce((sum, e) => sum + e.amount, 0) / (last - paid[0] + 1),
      payments: group.length,
      low: Math.min(...Object.values(byMonth)),
      high: Math.max(...Object.values(byMonth)),
      byMonth,
      lastOn: latest.occurredOn,
      categoryName: latest.categoryName,
      categoryColor: latest.categoryColor,
    });
  }
  return payers.sort((a, b) => b.monthly - a.monthly || a.name.localeCompare(b.name));
}

/** Six months of imported income: long enough to see a monthly payer repeat, recent enough to still be paying. */
export function importedIncomeSince(today: string): string {
  return `${addMonths(today.slice(0, 7), -5)}-01`;
}

type Schedule = { kind: CashFlowKind; amount: number; currency: string; frequency: RecurrenceFrequency; paused: boolean; nextOn: string | null };

/** Monthly income in PHP: active income schedules plus what repeat payers currently pay. */
export function monthlyIncome(fx: FxTable, schedules: Schedule[], payers: RepeatPayer[]) {
  return sumInPhp(fx, [
    ...schedules.filter((r) => r.kind === "income" && !r.paused && r.nextOn != null)
      .map((r) => ({ amount: monthlyEquivalent(r.amount, r.frequency), currency: r.currency })),
    ...payers.map((p) => ({ amount: p.monthly, currency: p.currency })),
  ]);
}

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
  return { average: average.total, low: sum((p) => p.low).total, high: sum((p) => p.high).total, sources: fixed.length + payers.length, missing: average.missing };
}

/** Each month's pay from repeat payers, in PHP at today's rates: the months the typical figure is drawn from. */
export function repeatIncomeByMonth(fx: FxTable, payers: RepeatPayer[], months: string[]): { month: string; value: number }[] {
  return months.map((month) => ({ month, value: sumInPhp(fx, payers.map((p) => ({ amount: p.byMonth[month] ?? 0, currency: p.currency }))).total }));
}
