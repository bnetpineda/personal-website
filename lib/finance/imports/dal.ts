import "server-only";
import { and, asc, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { categoryRules, importedEntries, investmentReports, investmentSyncs } from "@/lib/db/schema";
import { spotFifo } from "./spot";
import { monthRange } from "../dates";
import { earningsByCurrency, transferSuggestions } from "./review";
import type { EntryStatus } from "./types";
import type { ConnectionSnapshot } from "../connections/types";
import { holdingCosts } from "./holding-costs";

export async function getBinanceHoldingCosts(snapshot: ConnectionSnapshot | null) {
  await requireAdmin();
  if (!snapshot?.accountKey) return holdingCosts(snapshot, [], []);
  const db = getDb();
  const [entries, jobs] = await Promise.all([
    db.select({ accountKey: importedEntries.accountKey, externalId: importedEntries.externalId, occurredOn: importedEntries.occurredOn,
      status: importedEntries.status, kind: importedEntries.kind, currency: importedEntries.currency, trade: importedEntries.trade })
      .from(importedEntries).where(and(eq(importedEntries.provider, "binance"), eq(importedEntries.accountKey, snapshot.accountKey))),
    db.select({ accountKey: investmentSyncs.accountKey, scope: investmentSyncs.scope, completedAt: investmentSyncs.completedAt,
      lastSyncedAt: investmentSyncs.lastSyncedAt, error: investmentSyncs.error }).from(investmentSyncs).where(eq(investmentSyncs.accountKey, snapshot.accountKey)),
  ]);
  return holdingCosts(snapshot, entries, jobs);
}

export async function getInbox(status: EntryStatus | "all", page: number) {
  await requireAdmin();
  const db = getDb();
  const condition = status === "all" ? undefined : eq(importedEntries.status, status);
  const [entries, totals, rules, candidates] = await Promise.all([
    db.select().from(importedEntries).where(condition).orderBy(desc(importedEntries.occurredOn), asc(importedEntries.id)).limit(50).offset(page * 50),
    db.select({ status: importedEntries.status, total: count() }).from(importedEntries).groupBy(importedEntries.status),
    db.select().from(categoryRules).orderBy(desc(categoryRules.enabled), asc(categoryRules.contains)),
    db.select().from(importedEntries).where(eq(importedEntries.status, "pending")).orderBy(desc(importedEntries.occurredOn)).limit(500),
  ]);
  const total = totals.filter((r) => status === "all" || r.status === status).reduce((sum, r) => sum + r.total, 0);
  return { entries, totals, total, rules, candidates, suggestions: transferSuggestions(candidates) };
}

export async function getEarnings(month: string | null) {
  await requireAdmin();
  const e = importedEntries;
  const range = month ? monthRange(month) : null;
  const filter = range ? and(gte(e.occurredOn, range.start), lt(e.occurredOn, range.end)) : undefined;
  const rows = await getDb().select({ provider: e.provider, currency: e.currency, kind: e.kind, status: e.status,
    // Matched movements between two investment accounts are not new invested capital.
    amount: sql<number>`coalesce(sum(case when ${e.status} = 'transfer' and ${e.transferId} is not null and exists(
      select 1 from imported_entries partner where partner.transfer_id = ${e.transferId} and partner.id <> ${e.id}
        and partner.provider in ('binance','ibkr')) then 0 else ${e.amount} end), 0)`.mapWith(Number),
    realizedPnl: sql<number | null>`sum(${e.realizedPnl})`.mapWith(Number),
  }).from(e).where(filter)
    .groupBy(e.provider, e.currency, e.kind, e.status);
  const [pending] = await getDb().select({ total: count() }).from(e).where(and(eq(e.status, "pending"), eq(e.kind, "transfer"), filter));
  return { rows: earningsByCurrency(rows), pendingTransfers: pending.total };
}

export async function getInvestmentHistory(provider: "binance" | "ibkr" | "all", page: number) {
  await requireAdmin();
  const db = getDb(), filter = provider === "all" ? sql`${importedEntries.provider} in ('binance','ibkr')` : eq(importedEntries.provider, provider);
  const [jobs, reports, entries, totals, coverage, trades] = await Promise.all([
    db.select().from(investmentSyncs).orderBy(asc(investmentSyncs.scope)),
    db.select().from(investmentReports).orderBy(desc(investmentReports.createdAt)).limit(100),
    db.select().from(importedEntries).where(filter).orderBy(desc(importedEntries.occurredOn), desc(importedEntries.createdAt), asc(importedEntries.id)).limit(50).offset(page * 50),
    db.select({ total: count() }).from(importedEntries).where(filter),
    db.select({ provider: importedEntries.provider, total: count(), from: sql<string>`min(${importedEntries.occurredOn})`, to: sql<string>`max(${importedEntries.occurredOn})` })
      .from(importedEntries).where(sql`${importedEntries.provider} in ('binance','ibkr')`).groupBy(importedEntries.provider),
    db.select({ accountKey: importedEntries.accountKey, externalId: importedEntries.externalId, status: importedEntries.status, trade: importedEntries.trade })
      .from(importedEntries).where(and(eq(importedEntries.provider, "binance"), sql`${importedEntries.trade} is not null`)),
  ]);
  return { jobs, reports, entries, total: totals[0].total, coverage, fifo: spotFifo(trades) };
}
