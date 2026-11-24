import "server-only";
import { and, count, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, max, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { cashFlows, importedEntries, liabilities, recurringCashFlows } from "@/lib/db/schema";
import { DOUBLE_CHARGE_DAYS, LARGE_NEW_PAYEE_PHP, NEW_PAYEE_DAYS, PRICE_RISE_DAYS, type CategorySpending, type DebtDue } from "./anomalies";
import { BANK_PROVIDERS } from "./connections/types";
import { addDays, addMonths, monthRange, todayManila } from "./dates";
import { payeeKey, payeeOf } from "./payee";

/* The reads behind the money alerts (lib/finance/anomalies.ts). Callers have already checked the session. */

export async function loadDebtsDue(): Promise<DebtDue[]> {
  return getDb().select({ id: liabilities.id, name: liabilities.name, dueDay: liabilities.dueDay, lastPaidOn: max(cashFlows.occurredOn) })
    .from(liabilities).leftJoin(cashFlows, eq(cashFlows.liabilityId, liabilities.id))
    .where(and(eq(liabilities.archived, false), gt(liabilities.balance, 0), isNotNull(liabilities.dueDay)))
    .groupBy(liabilities.id);
}

const escapeLike = (text: string) => text.replace(/[%_\\]/g, (c) => `\\${c}`);

/**
 * `spentThisMonth` is each expense category's spending so far (already loaded for budget alerts),
 * with `budgeted` set where a budget alert covers it.
 */
export async function loadSpendingSignals(month: string, spentThisMonth: { id: number; name: string; spent: number; budgeted: boolean }[], today = todayManila()) {
  const db = getDb();
  const first = monthRange(addMonths(month, -3)).start, start = monthRange(month).start;
  const recentSince = addDays(today, -PRICE_RISE_DAYS), payeeSince = addDays(today, -NEW_PAYEE_DAYS);
  const [history, expenses, bankCharges, subscriptions, [older]] = await Promise.all([
    db.select({ categoryId: cashFlows.categoryId, month: sql<string>`to_char(${cashFlows.occurredOn}, 'YYYY-MM')`, spent: sql<number>`sum(${cashFlows.amountPhp})`.mapWith(Number) })
      .from(cashFlows).where(and(eq(cashFlows.kind, "expense"), gte(cashFlows.occurredOn, first), lt(cashFlows.occurredOn, start))).groupBy(cashFlows.categoryId, sql`2`),
    // Scheduled and debt payments are expected, so they are neither new payees nor price rises.
    db.select({ id: cashFlows.id, description: cashFlows.description, amount: cashFlows.amount, currency: cashFlows.currency, amountPhp: cashFlows.amountPhp, occurredOn: cashFlows.occurredOn })
      .from(cashFlows).where(and(eq(cashFlows.kind, "expense"), gte(cashFlows.occurredOn, recentSince), lte(cashFlows.occurredOn, today), isNull(cashFlows.recurringId), isNull(cashFlows.liabilityId)))
      .limit(2000),
    db.select({ id: importedEntries.id, provider: importedEntries.provider, occurredOn: importedEntries.occurredOn, amount: importedEntries.amount, currency: importedEntries.currency, description: importedEntries.description })
      .from(importedEntries).where(and(inArray(importedEntries.provider, [...BANK_PROVIDERS]), eq(importedEntries.status, "posted"), lt(importedEntries.amount, 0),
        gte(importedEntries.occurredOn, addDays(today, -DOUBLE_CHARGE_DAYS)))).limit(2000),
    db.select({ id: recurringCashFlows.id, description: recurringCashFlows.description, amount: recurringCashFlows.amount, currency: recurringCashFlows.currency })
      .from(recurringCashFlows).where(and(eq(recurringCashFlows.kind, "expense"), eq(recurringCashFlows.paused, false), isNotNull(recurringCashFlows.nextOn))),
    db.select({ total: count() }).from(cashFlows).where(and(eq(cashFlows.kind, "expense"), lt(cashFlows.occurredOn, payeeSince))),
  ]);
  // Only the few large recent payments need a look back, so the history is searched for just their payees.
  const candidates = [...new Set(expenses.filter((x) => x.occurredOn >= payeeSince && x.amountPhp >= LARGE_NEW_PAYEE_PHP).map((x) => payeeOf(x.description)))].slice(0, 20);
  const earlier = candidates.length ? await db.select({ description: cashFlows.description }).from(cashFlows)
    .where(and(eq(cashFlows.kind, "expense"), lt(cashFlows.occurredOn, payeeSince), or(...candidates.map((p) => sql`${cashFlows.description} ilike ${`%${escapeLike(p)}%`}`))))
    .limit(500) : [];
  const months = [addMonths(month, -3), addMonths(month, -2), addMonths(month, -1)];
  const spentIn = new Map(history.map((h) => [`${h.categoryId}|${h.month}`, h.spent]));
  const categories: CategorySpending[] = spentThisMonth.map((c) => ({ ...c,
    previous: months.map((m) => spentIn.get(`${c.id}|${m}`) ?? 0) as [number, number, number] }));
  return { categories, expenses, bankCharges, subscriptions, knownPayees: new Set(earlier.map((x) => payeeKey(x.description))), olderExpenses: older?.total ?? 0 };
}
