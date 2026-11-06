import "server-only";
import { and, count, eq, gte, inArray, lt, max, min, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { accountConnections, cashFlows, categories, categoryBudgets, importedEntries, notificationDismissals, recurringCashFlows } from "@/lib/db/schema";
import { monthBudget } from "./calc";
import { statementCoverage } from "./imports/coverage";
import { env } from "@/lib/env";
import { currentMonth, monthRange } from "./dates";
import { buildNotifications } from "./notifications";

export async function getNotifications() {
  await requireAdmin();
  const month = currentMonth();
  const db = getDb(), { start, end } = monthRange(month);
  const e = importedEntries;
  const [connections, budgets, bills, dismissed, aiBacklog, months, overrides] = await Promise.all([
    db.select({
      provider: accountConnections.provider, enabled: accountConnections.enabled, lastSyncedAt: accountConnections.lastSyncedAt, lastAttemptAt: accountConnections.lastAttemptAt,
      error: accountConnections.error, credentialsExpireOn: accountConnections.credentialsExpireOn,
      historySyncedAt: accountConnections.historySyncedAt, historyError: accountConnections.historyError,
      asOf: sql<string | null>`${accountConnections.snapshot}->>'asOf'`,
    }).from(accountConnections),
    db.select({ id: categories.id, name: categories.name, budget: categories.monthlyBudget,
      spent: sql<number>`coalesce(sum(${cashFlows.amountPhp}), 0)`.mapWith(Number) }).from(categories)
      .leftJoin(cashFlows, and(eq(cashFlows.categoryId, categories.id), eq(cashFlows.kind, "expense"), gte(cashFlows.occurredOn, start), lt(cashFlows.occurredOn, end)))
      // Every expense category: a month's own budget can apply where there's no default.
      .where(and(eq(categories.archived, false), eq(categories.kind, "expense")))
      .groupBy(categories.id),
    db.select({ id: recurringCashFlows.id, description: recurringCashFlows.description, nextOn: recurringCashFlows.nextOn })
      .from(recurringCashFlows).where(and(eq(recurringCashFlows.paused, false), eq(recurringCashFlows.kind, "expense"))),
    db.select({ key: notificationDismissals.key }).from(notificationDismissals),
    env.aiGatewayApiKey() ? db.select({ waiting: sql<number>`count(*)`.mapWith(Number), oldest: min(e.occurredOn) }).from(e)
      .where(and(eq(e.status, "pending"), lt(e.createdAt, sql`now() - interval '1 day'`))).then(([row]) => row?.oldest ? { waiting: row.waiting, oldest: row.oldest } : null)
      : Promise.resolve(null),
    db.select({ provider: e.provider, month: sql<string>`to_char(${e.occurredOn}, 'YYYY-MM')`, entries: count(), importedAt: max(e.createdAt) })
      .from(e).where(inArray(e.provider, ["wise", "maribank"])).groupBy(e.provider, sql`2`),
    db.select({ categoryId: categoryBudgets.categoryId, amount: categoryBudgets.amount }).from(categoryBudgets).where(eq(categoryBudgets.month, month)),
  ]);
  const keys = new Set(dismissed.map((d) => d.key));
  const own = new Map(overrides.map((o) => [o.categoryId, o.amount]));
  const budgeted = budgets.map((b) => ({ ...b, budget: monthBudget({ id: b.id, monthlyBudget: b.budget }, own) ?? 0 })).filter((b) => b.budget > 0);
  return buildNotifications({ connections: connections.map(({ asOf, ...connection }) => ({ ...connection, snapshot: asOf ? { asOf } : null })), budgets: budgeted, bills, aiBacklog, statements: statementCoverage(months) })
    .map((alert) => ({ ...alert, dismissed: keys.has(alert.key) }));
}
