import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { categories, categoryRules, importedEntries, investmentReports, investmentSyncs } from "@/lib/db/schema";
import { monthRange } from "../dates";
import type { EntryKind } from "./types";
import { bankFiling, DUPLICATE_REASON, earningsByCurrency, type BankFiling } from "./review";
import { BANK_PROVIDERS, type ConnectionSnapshot } from "../connections/types";
import { loadBinanceHoldingCosts } from "../portfolio";
import { readAllSpotFifo } from "./spot-fifo";

export async function getBinanceHoldingCosts(snapshot: ConnectionSnapshot | null) {
  await requireAdmin();
  return loadBinanceHoldingCosts(snapshot);
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
        and partner.provider in ('binance','ibkr','hyperliquid')) then 0 else ${e.amount} end), 0)`.mapWith(Number),
    realizedPnl: sql<number | null>`sum(${e.realizedPnl})`.mapWith(Number),
  }).from(e).where(filter)
    .groupBy(e.provider, e.currency, e.kind, e.status);
  const earnings = earningsByCurrency(rows);
  return { rows: earnings.rows, postedCash: earnings.postedCash };
}

/**
 * Deposits and withdrawals of each investment account since `since` (by default the first saved account
 * value, where the "All" range starts), in their own currency, summed per day. Transfers between two of
 * your own accounts count for each of them: money leaving one account is not that account's loss, and it
 * nets out across the portfolio.
 */
export async function getInvestmentFlows(since?: string) {
  await requireAdmin();
  const e = importedEntries;
  const from = since ?? sql`(select coalesce(min(snapshot_date), current_date) from portfolio_snapshots)`;
  return getDb().select({ provider: e.provider, date: e.occurredOn, currency: e.currency, amount: sql<number>`sum(${e.amount})`.mapWith(Number) })
    .from(e)
    .where(and(eq(e.status, "transfer"), gte(e.occurredOn, from), inArray(e.provider, ["binance", "ibkr", "hyperliquid"])))
    .groupBy(e.provider, e.occurredOn, e.currency);
}

export const BANK_ACTIVITY_PAGE = 50;
export type BankActivityFilter = "all" | BankFiling;

/**
 * Every bank import (Wise, MariBank, GoTyme) with how it was filed and why, newest first: posted ones
 * and the ones that never reached Transactions (transfers, ignored, a twin of something logged).
 * Each row carries its transfer partner, when it has one.
 */
export async function getBankActivity({ provider, filter, q, page }: { provider: "all" | "wise" | "maribank" | "gotyme"; filter: BankActivityFilter; q: string; page: number }) {
  await requireAdmin();
  const db = getDb(), e = importedEntries;
  const partner = alias(importedEntries, "partner");
  const duplicate = sql`${e.status} = 'ignored' and ${e.aiReason} like ${`${DUPLICATE_REASON}%`}`;
  const filed = {
    all: undefined, duplicate,
    ignored: sql`${e.status} = 'ignored' and not (${duplicate})`,
    investment: eq(e.status, "reviewed"),
    posted: eq(e.status, "posted"), transfer: eq(e.status, "transfer"), pending: eq(e.status, "pending"),
  }[filter];
  const base = and(provider === "all" ? inArray(e.provider, [...BANK_PROVIDERS]) : eq(e.provider, provider),
    q ? ilike(e.description, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`) : undefined);
  const where = and(base, filed);
  const [entries, [totals], counts] = await Promise.all([
    db.select({ entry: e, category: categories.name, partner: { id: partner.id, provider: partner.provider, description: partner.description, occurredOn: partner.occurredOn } })
      .from(e).leftJoin(categories, eq(categories.id, e.categoryId))
      .leftJoin(partner, and(eq(partner.transferId, e.transferId), ne(partner.id, e.id)))
      .where(where).orderBy(desc(e.occurredOn), desc(e.createdAt), asc(e.id)).limit(BANK_ACTIVITY_PAGE).offset(page * BANK_ACTIVITY_PAGE),
    db.select({ total: count() }).from(e).where(where),
    db.select({ status: e.status, duplicate: sql<boolean>`coalesce(${duplicate}, false)`, total: count() }).from(e).where(base).groupBy(e.status, sql`2`),
  ]);
  const byFiling = new Map<BankFiling, number>();
  for (const c of counts) {
    const key = bankFiling({ status: c.status, aiReason: c.duplicate ? DUPLICATE_REASON : null });
    byFiling.set(key, (byFiling.get(key) ?? 0) + c.total);
  }
  return { entries: entries.map((r) => ({ ...r.entry, category: r.category, partner: r.partner?.id ? r.partner : null })), total: totals.total, counts: byFiling };
}

export async function getInvestmentHistory(provider: "binance" | "ibkr" | "hyperliquid" | "all", page: number, q = "", kinds: readonly EntryKind[] = []) {
  await requireAdmin();
  const db = getDb();
  const source = provider === "all" ? sql`${importedEntries.provider} in ('binance','ibkr','hyperliquid')` : eq(importedEntries.provider, provider);
  const filter = and(
    source,
    q ? ilike(importedEntries.description, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`) : undefined,
    kinds.length ? inArray(importedEntries.kind, [...kinds]) : undefined,
  );
  const [jobs, reports, entries, totals, coverage] = await Promise.all([
    db.select().from(investmentSyncs).orderBy(asc(investmentSyncs.scope)),
    db.select().from(investmentReports).orderBy(desc(investmentReports.createdAt)).limit(100),
    db.select().from(importedEntries).where(filter).orderBy(desc(importedEntries.occurredOn), desc(importedEntries.createdAt), asc(importedEntries.id)).limit(50).offset(page * 50),
    db.select({ total: count() }).from(importedEntries).where(filter),
    db.select({ provider: importedEntries.provider, total: count(), from: sql<string>`min(${importedEntries.occurredOn})`, to: sql<string>`max(${importedEntries.occurredOn})` })
      .from(importedEntries).where(sql`${importedEntries.provider} in ('binance','ibkr','hyperliquid')`).groupBy(importedEntries.provider),
  ]);
  return { jobs, reports, entries, total: totals[0].total, coverage, fifo: provider === "ibkr" || provider === "hyperliquid" ? [] : await readAllSpotFifo() };
}
