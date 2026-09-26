import "server-only";
import { and, eq, gt, gte, lt, min, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { accountConnections, cashFlows, categories, importedEntries, notificationDismissals, recurringCashFlows } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { currentMonth, monthRange } from "./dates";
import { buildNotifications } from "./notifications";

export async function getNotifications() {
  await requireAdmin();
  const db = getDb(), { start, end } = monthRange(currentMonth());
  const e = importedEntries;
  const [connections, budgets, bills, dismissed, aiBacklog] = await Promise.all([
    db.select({
      provider: accountConnections.provider, enabled: accountConnections.enabled, lastSyncedAt: accountConnections.lastSyncedAt,
      error: accountConnections.error, credentialsExpireOn: accountConnections.credentialsExpireOn,
      historySyncedAt: accountConnections.historySyncedAt, historyError: accountConnections.historyError,
      asOf: sql<string | null>`${accountConnections.snapshot}->>'asOf'`,
    }).from(accountConnections),
    db.select({ id: categories.id, name: categories.name, budget: categories.monthlyBudget,
      spent: sql<number>`coalesce(sum(${cashFlows.amountPhp}), 0)`.mapWith(Number) }).from(categories)
      .leftJoin(cashFlows, and(eq(cashFlows.categoryId, categories.id), eq(cashFlows.kind, "expense"), gte(cashFlows.occurredOn, start), lt(cashFlows.occurredOn, end)))
      .where(and(eq(categories.archived, false), eq(categories.kind, "expense"), gt(categories.monthlyBudget, 0)))
      .groupBy(categories.id),
    db.select({ id: recurringCashFlows.id, description: recurringCashFlows.description, nextOn: recurringCashFlows.nextOn })
      .from(recurringCashFlows).where(and(eq(recurringCashFlows.paused, false), eq(recurringCashFlows.kind, "expense"))),
    db.select({ key: notificationDismissals.key }).from(notificationDismissals),
    env.aiGatewayApiKey() ? db.select({ waiting: sql<number>`count(*)`.mapWith(Number), oldest: min(e.occurredOn) }).from(e)
      .where(and(eq(e.status, "pending"), lt(e.createdAt, sql`now() - interval '1 day'`))).then(([row]) => row?.oldest ? { waiting: row.waiting, oldest: row.oldest } : null)
      : Promise.resolve(null),
  ]);
  const keys = new Set(dismissed.map((d) => d.key));
  return buildNotifications({ connections: connections.map(({ asOf, ...connection }) => ({ ...connection, snapshot: asOf ? { asOf } : null })), budgets: budgets.map((b) => ({ ...b, budget: b.budget ?? 0 })), bills, aiBacklog })
    .map((alert) => ({ ...alert, dismissed: keys.has(alert.key) }));
}
