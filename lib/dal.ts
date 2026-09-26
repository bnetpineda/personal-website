import "server-only";
import { and, asc, count, desc, eq, getTableColumns, gte, ilike, isNotNull, lt, max, or, sql, sum, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  cashFlows,
  categories,
  fxRates,
  holdings,
  liabilities,
  netWorthSnapshots,
  recurringCashFlows,
  importedEntries,
  categoryRules,
  notificationDismissals,
  investmentReports,
  investmentSyncs,
} from "@/lib/db/schema";
import type { FxTable, MonthTotal } from "@/lib/finance/calc";
import type { CashFlowKind } from "@/lib/finance/constants";
import { addMonths, monthRange } from "@/lib/finance/dates";
import { loadFxTable } from "@/lib/finance/service";
import { loadConnectionViews } from "@/lib/finance/connections/service";

/*
 * Data access for admin pages. Every read starts with requireAdmin() — layouts don't
 * re-render on client navigation, so the check has to live next to the data.
 */

export async function getFx(): Promise<FxTable> {
  await requireAdmin();
  return loadFxTable();
}

export async function getConnections() {
  await requireAdmin();
  return loadConnectionViews();
}

export async function getFxRows() {
  await requireAdmin();
  return getDb().select().from(fxRates).orderBy(asc(fxRates.currency));
}

export async function getHoldings({ archived = false }: { archived?: boolean } = {}) {
  await requireAdmin();
  return getDb()
    .select()
    .from(holdings)
    .where(eq(holdings.archived, archived))
    .orderBy(asc(holdings.assetClass), asc(holdings.name));
}

export async function countArchivedHoldings(): Promise<number> {
  await requireAdmin();
  const [row] = await getDb().select({ n: count() }).from(holdings).where(eq(holdings.archived, true));
  return row.n;
}

export async function getLiabilities() {
  await requireAdmin();
  return getDb()
    .select()
    .from(liabilities)
    .orderBy(asc(liabilities.archived), desc(liabilities.balance), asc(liabilities.name));
}

export async function getCategories(kind?: CashFlowKind) {
  await requireAdmin();
  return getDb()
    .select()
    .from(categories)
    .where(kind ? eq(categories.kind, kind) : undefined)
    .orderBy(asc(categories.kind), asc(categories.archived), asc(categories.sortOrder), asc(categories.name));
}

export async function getCategoryUsage(): Promise<Map<number, number>> {
  await requireAdmin();
  const rows = await getDb()
    .select({ categoryId: cashFlows.categoryId, n: count() })
    .from(cashFlows)
    .groupBy(cashFlows.categoryId);
  return new Map(rows.map((r) => [r.categoryId, r.n]));
}

const cashFlowWithCategory = {
  ...getTableColumns(cashFlows),
  categoryName: categories.name,
  categoryColor: categories.color,
};

export type CashFlowRow = Awaited<ReturnType<typeof getCashFlows>>[number];

/** Escapes LIKE wildcards so a search for "50%" matches literally. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const SEARCH_LIMIT = 200;
/** Safety cap for one month's list (far above real use). */
const MONTH_LIMIT = 5000;

/**
 * Entries for the Transactions page: one month, or — with a search term — all time
 * (newest first, capped at SEARCH_LIMIT), optionally of one kind.
 */
export async function getCashFlows({ kind, month, q }: { kind?: CashFlowKind; month?: string; q?: string }) {
  await requireAdmin();
  const where: (SQL | undefined)[] = [kind ? eq(cashFlows.kind, kind) : undefined];
  if (q) {
    const term = likeTerm(q);
    where.push(or(ilike(cashFlows.description, term), ilike(cashFlows.notes, term), ilike(cashFlows.account, term), ilike(categories.name, term)));
  } else if (month) {
    const { start, end } = monthRange(month);
    where.push(gte(cashFlows.occurredOn, start), lt(cashFlows.occurredOn, end));
  }
  return getDb()
    .select(cashFlowWithCategory)
    .from(cashFlows)
    .innerJoin(categories, eq(cashFlows.categoryId, categories.id))
    .where(and(...where))
    .orderBy(desc(cashFlows.occurredOn), desc(cashFlows.createdAt))
    .limit(q ? SEARCH_LIMIT : MONTH_LIMIT);
}

export interface EntrySuggestion {
  kind: CashFlowKind;
  description: string;
  categoryId: number;
  account: string | null;
}

/**
 * Descriptions used before (latest spelling, category and account of each), most recent
 * first — the quick-add form suggests them and fills in the rest when one is picked.
 */
export async function getEntrySuggestions(limit = 150): Promise<EntrySuggestion[]> {
  await requireAdmin();
  const key = sql`lower(${cashFlows.description})`;
  const distinct = getDb()
    .selectDistinctOn([cashFlows.kind, key], {
      kind: cashFlows.kind,
      description: cashFlows.description,
      categoryId: cashFlows.categoryId,
      account: cashFlows.account,
      lastUsed: cashFlows.createdAt,
    })
    .from(cashFlows)
    .innerJoin(categories, eq(cashFlows.categoryId, categories.id))
    .where(eq(categories.archived, false))
    .orderBy(cashFlows.kind, key, desc(cashFlows.createdAt))
    .as("distinct_entries");
  return getDb()
    .select({
      kind: distinct.kind,
      description: distinct.description,
      categoryId: distinct.categoryId,
      account: distinct.account,
    })
    .from(distinct)
    .orderBy(desc(distinct.lastUsed))
    .limit(limit);
}

export interface LastPayment {
  occurredOn: string;
  amount: number;
  currency: string;
  categoryId: number;
  account: string | null;
}

/** Latest payment logged against each debt (from "Pay"), keyed by liability id. */
export async function getLastPayments(): Promise<Map<string, LastPayment>> {
  await requireAdmin();
  const rows = await getDb()
    .selectDistinctOn([cashFlows.liabilityId], {
      liabilityId: cashFlows.liabilityId,
      occurredOn: cashFlows.occurredOn,
      amount: cashFlows.amount,
      currency: cashFlows.currency,
      categoryId: cashFlows.categoryId,
      account: cashFlows.account,
    })
    .from(cashFlows)
    .where(isNotNull(cashFlows.liabilityId))
    .orderBy(cashFlows.liabilityId, desc(cashFlows.occurredOn), desc(cashFlows.createdAt));
  return new Map(rows.map(({ liabilityId, ...r }) => [liabilityId!, r]));
}

export async function getRecentCashFlows(limit = 8) {
  await requireAdmin();
  return getDb()
    .select(cashFlowWithCategory)
    .from(cashFlows)
    .innerJoin(categories, eq(cashFlows.categoryId, categories.id))
    .orderBy(desc(cashFlows.occurredOn), desc(cashFlows.createdAt))
    .limit(limit);
}

/** PHP totals per category for one month. */
export async function getCategoryTotals(kind: CashFlowKind, month: string): Promise<Map<number, number>> {
  await requireAdmin();
  const { start, end } = monthRange(month);
  const rows = await getDb()
    .select({ categoryId: cashFlows.categoryId, total: sum(cashFlows.amountPhp).mapWith(Number) })
    .from(cashFlows)
    .where(and(eq(cashFlows.kind, kind), gte(cashFlows.occurredOn, start), lt(cashFlows.occurredOn, end)))
    .groupBy(cashFlows.categoryId);
  return new Map(rows.map((r) => [r.categoryId, r.total ?? 0]));
}

/** PHP totals per (month, kind) for `months` months ending at `endMonth`. */
export async function getMonthlyTotals(endMonth: string, months: number): Promise<MonthTotal[]> {
  await requireAdmin();
  const start = monthRange(addMonths(endMonth, -(months - 1))).start;
  const end = monthRange(endMonth).end;
  const month = sql<string>`to_char(${cashFlows.occurredOn}, 'YYYY-MM')`;
  const rows = await getDb()
    .select({ month, kind: cashFlows.kind, total: sum(cashFlows.amountPhp).mapWith(Number) })
    .from(cashFlows)
    .where(and(gte(cashFlows.occurredOn, start), lt(cashFlows.occurredOn, end)))
    .groupBy(month, cashFlows.kind);
  return rows.map((r) => ({ month: r.month, kind: r.kind, total: r.total ?? 0 }));
}

/** Accounts used before, most recent first — powers the account <datalist>. */
export async function getAccounts(limit = 25): Promise<string[]> {
  await requireAdmin();
  const rows = await getDb()
    .select({ account: cashFlows.account, lastUsed: max(cashFlows.createdAt) })
    .from(cashFlows)
    .where(isNotNull(cashFlows.account))
    .groupBy(cashFlows.account)
    .orderBy(desc(max(cashFlows.createdAt)))
    .limit(limit);
  return rows.map((r) => r.account!).filter(Boolean);
}

/** Category/account/currency of the latest entry, used to prefill quick-add. */
export async function getLastEntryDefaults(kind: CashFlowKind) {
  await requireAdmin();
  const [row] = await getDb()
    .select({ categoryId: cashFlows.categoryId, account: cashFlows.account, currency: cashFlows.currency })
    .from(cashFlows)
    .where(eq(cashFlows.kind, kind))
    .orderBy(desc(cashFlows.createdAt))
    .limit(1);
  return row ?? null;
}

export type RecurringRow = Awaited<ReturnType<typeof getRecurring>>[number];

/** Recurring items with their category, active first, then by next date. */
export async function getRecurring(kind?: CashFlowKind) {
  await requireAdmin();
  return getDb()
    .select({ ...getTableColumns(recurringCashFlows), categoryName: categories.name, categoryColor: categories.color })
    .from(recurringCashFlows)
    .innerJoin(categories, eq(recurringCashFlows.categoryId, categories.id))
    .where(kind ? eq(recurringCashFlows.kind, kind) : undefined)
    .orderBy(asc(recurringCashFlows.paused), sql`${recurringCashFlows.nextOn} asc nulls last`, asc(recurringCashFlows.description));
}

/** Imported income posted to Transactions since `since`, for spotting payers that repeat. */
export async function getImportedIncome(since: string) {
  await requireAdmin();
  return getDb()
    .select({ description: importedEntries.description, occurredOn: cashFlows.occurredOn, amount: cashFlows.amount, currency: cashFlows.currency,
      categoryName: categories.name, categoryColor: categories.color })
    .from(cashFlows)
    .innerJoin(importedEntries, eq(importedEntries.id, cashFlows.id))
    .innerJoin(categories, eq(cashFlows.categoryId, categories.id))
    .where(and(eq(cashFlows.kind, "income"), gte(cashFlows.occurredOn, since)));
}

export async function getSnapshots() {
  await requireAdmin();
  return getDb().select().from(netWorthSnapshots).orderBy(asc(netWorthSnapshots.snapshotDate));
}

/** Everything, for the JSON backup download. */
export async function getExportData() {
  await requireAdmin();
  const db = getDb();
  const [h, l, c, f, s, x, r, connections, imports, rules, dismissals, reports, historyStreams] = await Promise.all([
    db.select().from(holdings).orderBy(asc(holdings.createdAt)),
    db.select().from(liabilities).orderBy(asc(liabilities.createdAt)),
    db.select().from(categories).orderBy(asc(categories.id)),
    db.select().from(cashFlows).orderBy(asc(cashFlows.occurredOn), asc(cashFlows.createdAt)),
    db.select().from(netWorthSnapshots).orderBy(asc(netWorthSnapshots.snapshotDate)),
    db.select().from(fxRates).orderBy(asc(fxRates.currency)),
    db.select().from(recurringCashFlows).orderBy(asc(recurringCashFlows.createdAt)),
    loadConnectionViews(),
    db.select().from(importedEntries).orderBy(asc(importedEntries.occurredOn)),
    db.select().from(categoryRules).orderBy(asc(categoryRules.createdAt)),
    db.select().from(notificationDismissals),
    db.select().from(investmentReports).orderBy(asc(investmentReports.createdAt)),
    db.select().from(investmentSyncs).orderBy(asc(investmentSyncs.createdAt)),
  ]);
  return { holdings: h, liabilities: l, categories: c, cashFlows: f, recurring: r, netWorthSnapshots: s, fxRates: x, connections, importedEntries: imports, categoryRules: rules, notificationDismissals: dismissals, investmentReports: reports, investmentSyncs: historyStreams };
}
