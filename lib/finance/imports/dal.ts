import "server-only";
import { and, asc, count, desc, eq, gte, isNull, lte, lt, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { categoryRules, importedEntries, investmentReports, investmentSyncs } from "@/lib/db/schema";
import { monthRange } from "../dates";
import { earningsByCurrency } from "./review";
import type { ConnectionSnapshot } from "../connections/types";
import { holdingCosts } from "./holding-costs";
import { readAllSpotFifo, readSpotFifo } from "./spot-fifo";

export async function getBinanceHoldingCosts(snapshot: ConnectionSnapshot | null) {
  await requireAdmin();
  if (!snapshot?.accountKey) return holdingCosts(snapshot, [], []);
  const db = getDb();
  const accountKey = snapshot.accountKey;
  const [prepared, entries, jobs] = await Promise.all([
    readSpotFifo(accountKey, snapshot.asOf),
    db.select({ accountKey: importedEntries.accountKey, externalId: importedEntries.externalId, occurredOn: importedEntries.occurredOn,
      status: importedEntries.status, kind: importedEntries.kind, currency: importedEntries.currency, trade: importedEntries.trade })
      .from(importedEntries).where(and(eq(importedEntries.provider, "binance"), eq(importedEntries.accountKey, accountKey),
        isNull(importedEntries.trade), lte(importedEntries.occurredOn, snapshot.asOf.slice(0, 10)))),
    db.select({ accountKey: investmentSyncs.accountKey, scope: investmentSyncs.scope, completedAt: investmentSyncs.completedAt,
      lastSyncedAt: investmentSyncs.lastSyncedAt, error: investmentSyncs.error }).from(investmentSyncs).where(eq(investmentSyncs.accountKey, accountKey)),
  ]);
  return holdingCosts(snapshot, entries, jobs, prepared);
}

export async function getCategoryRules() {
  await requireAdmin();
  return getDb().select().from(categoryRules).orderBy(desc(categoryRules.enabled), asc(categoryRules.contains));
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
  const earnings = earningsByCurrency(rows);
  return { rows: earnings.rows, postedCash: earnings.postedCash };
}

export async function getInvestmentHistory(provider: "binance" | "ibkr" | "all", page: number) {
  await requireAdmin();
  const db = getDb(), filter = provider === "all" ? sql`${importedEntries.provider} in ('binance','ibkr')` : eq(importedEntries.provider, provider);
  const [jobs, reports, entries, totals, coverage] = await Promise.all([
    db.select().from(investmentSyncs).orderBy(asc(investmentSyncs.scope)),
    db.select().from(investmentReports).orderBy(desc(investmentReports.createdAt)).limit(100),
    db.select().from(importedEntries).where(filter).orderBy(desc(importedEntries.occurredOn), desc(importedEntries.createdAt), asc(importedEntries.id)).limit(50).offset(page * 50),
    db.select({ total: count() }).from(importedEntries).where(filter),
    db.select({ provider: importedEntries.provider, total: count(), from: sql<string>`min(${importedEntries.occurredOn})`, to: sql<string>`max(${importedEntries.occurredOn})` })
      .from(importedEntries).where(sql`${importedEntries.provider} in ('binance','ibkr')`).groupBy(importedEntries.provider),
  ]);
  return { jobs, reports, entries, total: totals[0].total, coverage, fifo: provider === "ibkr" ? [] : await readAllSpotFifo() };
}
