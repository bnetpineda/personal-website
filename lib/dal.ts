import "server-only";
import { and, asc, count, desc, eq, getTableColumns, gte, ilike, inArray, isNotNull, isNull, lt, lte, max, or, sql, sum, type AnyColumn, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  cashFlows,
  categories,
  categoryBudgets,
  fxRates,
  goals,
  holdings,
  liabilities,
  netWorthSnapshots,
  portfolioSnapshots,
  recurringCashFlows,
  importedEntries,
  categoryRules,
  notificationDismissals,
  investmentReports,
  investmentSyncs,
  statementBalances,
} from "@/lib/db/schema";
import type { FxTable, MonthTotal } from "@/lib/finance/calc";
import type { CashFlowKind } from "@/lib/finance/constants";
import { addMonths, monthRange } from "@/lib/finance/dates";
import { typicalAmount, type EntryHint } from "@/lib/finance/entry-guess";
import { IMPORTER_NOTE_PATTERNS } from "@/lib/finance/notes";
import { loadStatementMonths } from "@/lib/finance/imports/statement-months";
import { MAX_SEARCH_PAGES, SEARCH_PAGE_SIZE, isSearching, type EntryFilters } from "@/lib/finance/entry-filters";
import type { EntryKind } from "@/lib/finance/imports/types";
import { statementCoverage } from "@/lib/finance/imports/coverage";
import { teachGroups } from "@/lib/finance/imports/teach";
import { loadUnsureEntries, recentAutoTaught } from "@/lib/finance/imports/teach-service";
import { currentNetWorth, loadFxTable } from "@/lib/finance/service";
import { latestAiSummary } from "@/lib/finance/ai-summary-service";
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

/** Payees the model filed under Other (it was not sure), grouped so each is taught once. */
export async function getTeachGroups() {
  await requireAdmin();
  return teachGroups(await loadUnsureEntries());
}

/** Payees the daily job sorted on its own lately, each with Undo. */
export async function getAutoTaught() {
  await requireAdmin();
  return recentAutoTaught();
}

/** Closing balances from uploaded bank statements, by bank and currency. */
export async function getStatementBalances() {
  await requireAdmin();
  return getDb().select().from(statementBalances).orderBy(statementBalances.provider, statementBalances.currency);
}

/** What uploaded statements have brought in so far, per bank: the months with activity and when the last upload was. */
export async function getStatementImports() {
  await requireAdmin();
  return statementCoverage(await loadStatementMonths());
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

/** Entries per page of an all-time search (see lib/finance/entry-filters.ts). */
export const SEARCH_LIMIT = SEARCH_PAGE_SIZE;
/** Safety cap for one month's list, an export, or a search grown page by page (far above real use). */
export const MONTH_LIMIT = SEARCH_PAGE_SIZE * MAX_SEARCH_PAGES;

/**
 * Entries for the Activity panel: one month, or — with a search term or any filter — all time
 * (newest first, `limit` of them), optionally of one kind or category.
 */
export async function getCashFlows({ kind, category, month, q, filters, limit }: {
  kind?: CashFlowKind;
  category?: number;
  month?: string;
  q?: string;
  filters?: EntryFilters;
  limit?: number;
}) {
  await requireAdmin();
  const f: EntryFilters = filters ?? { q: q ?? "", from: null, to: null, min: null, max: null, account: null };
  const where: (SQL | undefined)[] = [kind ? eq(cashFlows.kind, kind) : undefined, category ? eq(cashFlows.categoryId, category) : undefined];
  const searching = isSearching(f);
  if (searching) {
    if (f.q) {
      const term = likeTerm(f.q);
      where.push(or(ilike(cashFlows.description, term), ilike(cashFlows.notes, term), ilike(cashFlows.account, term), ilike(categories.name, term)));
    }
    if (f.from) where.push(gte(cashFlows.occurredOn, f.from));
    if (f.to) where.push(lte(cashFlows.occurredOn, f.to));
    if (f.min != null) where.push(gte(cashFlows.amountPhp, f.min));
    if (f.max != null) where.push(lte(cashFlows.amountPhp, f.max));
    if (f.account) where.push(eq(sql`lower(${cashFlows.account})`, f.account.toLowerCase()));
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
    .limit(Math.min(limit ?? (searching ? SEARCH_LIMIT : MONTH_LIMIT), MONTH_LIMIT));
}

export type EntrySuggestion = EntryHint & { kind: CashFlowKind };

/**
 * Descriptions used before (latest spelling, category, account and currency of each, and the usual
 * amount when recent ones agree), most recent first, then the category rules. The add form suggests
 * the descriptions and fills in the rest from whichever matches what is typed (entry-guess.ts).
 */
export async function getEntrySuggestions(limit = 150): Promise<EntrySuggestion[]> {
  await requireAdmin();
  const f = cashFlows;
  const latest = <T>(column: AnyColumn) => sql<T>`(array_agg(${column} order by ${f.createdAt} desc))[1]`;
  const [past, rules] = await Promise.all([
    getDb()
      .select({
        kind: f.kind,
        description: latest<string>(f.description),
        categoryId: latest<number>(f.categoryId),
        account: latest<string | null>(f.account),
        currency: latest<string>(f.currency),
        // The last five amounts in the latest currency; typicalAmount keeps one only when they agree.
        recent: sql<string[]>`(array_agg(${f.amount}::text order by ${f.createdAt} desc))[1:5]`,
        currencies: sql<string[]>`(array_agg(${f.currency}::text order by ${f.createdAt} desc))[1:5]`,
      })
      .from(f)
      .innerJoin(categories, eq(f.categoryId, categories.id))
      .where(eq(categories.archived, false))
      .groupBy(f.kind, sql`lower(${f.description})`)
      .orderBy(desc(max(f.createdAt)))
      .limit(limit),
    getDb()
      .select({ kind: categoryRules.kind, contains: categoryRules.contains, categoryId: categoryRules.categoryId })
      .from(categoryRules)
      .innerJoin(categories, eq(categoryRules.categoryId, categories.id))
      .where(and(eq(categoryRules.enabled, true), eq(categories.archived, false))),
  ]);
  return [
    ...past.map(({ recent, currencies, ...row }) => ({
      ...row,
      amount: typicalAmount(recent.filter((_, i) => currencies[i] === row.currency).map(Number)),
    })),
    ...rules.map((r) => ({ kind: r.kind, description: r.contains, categoryId: r.categoryId, account: null, currency: null, amount: null, rule: true })),
  ];
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

/** Recorded PHP cash flow in a half-open date range, used for equal-day comparisons. */
export async function getPeriodTotals(start: string, end: string) {
  await requireAdmin();
  const rows = await getDb()
    .select({ kind: cashFlows.kind, total: sum(cashFlows.amountPhp).mapWith(Number) })
    .from(cashFlows)
    .where(and(gte(cashFlows.occurredOn, start), lt(cashFlows.occurredOn, end)))
    .groupBy(cashFlows.kind);
  return {
    income: rows.find((r) => r.kind === "income")?.total ?? 0,
    expense: rows.find((r) => r.kind === "expense")?.total ?? 0,
  };
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

/** Every month with entries and which kinds it has, newest first: where the Overview opens and what the month picker marks. */
export async function getRecordedMonths(): Promise<{ month: string; kind: CashFlowKind }[]> {
  await requireAdmin();
  const month = sql<string>`to_char(${cashFlows.occurredOn}, 'YYYY-MM')`;
  return getDb().selectDistinct({ month, kind: cashFlows.kind }).from(cashFlows).orderBy(desc(month));
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

/** Category/account/currency of the latest entry typed by hand, used to prefill the add form: a filed import says nothing about the next cash expense. */
export async function getLastEntryDefaults(kind: CashFlowKind) {
  await requireAdmin();
  const [row] = await getDb()
    .select({ categoryId: cashFlows.categoryId, account: cashFlows.account, currency: cashFlows.currency })
    .from(cashFlows)
    .where(and(eq(cashFlows.kind, kind), isNull(cashFlows.recurringId), ...IMPORTER_NOTE_PATTERNS.map((pattern) => sql`coalesce(${cashFlows.notes}, '') not like ${pattern}`)))
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

/** Imported entries of one kind posted to Transactions since `since`, for spotting payers and charges that repeat. */
export async function getImportedFlows(kind: CashFlowKind, since: string, importKinds?: readonly EntryKind[]) {
  await requireAdmin();
  return getDb()
    .select({ description: importedEntries.description, occurredOn: cashFlows.occurredOn, amount: cashFlows.amount, currency: cashFlows.currency,
      categoryId: cashFlows.categoryId, categoryName: categories.name, categoryColor: categories.color, account: cashFlows.account })
    .from(cashFlows)
    .innerJoin(importedEntries, eq(importedEntries.id, cashFlows.id))
    .innerJoin(categories, eq(cashFlows.categoryId, categories.id))
    .where(and(eq(cashFlows.kind, kind), gte(cashFlows.occurredOn, since), importKinds?.length ? inArray(importedEntries.kind, [...importKinds]) : undefined));
}

/** A calendar year's income entries in PHP, with their category: what the tax estimate adds up. */
export async function getIncomeForYear(year: number) {
  await requireAdmin();
  return getDb()
    .select({ occurredOn: cashFlows.occurredOn, amountPhp: cashFlows.amountPhp, categoryId: cashFlows.categoryId })
    .from(cashFlows)
    .where(and(eq(cashFlows.kind, "income"), gte(cashFlows.occurredOn, `${year}-01-01`), lt(cashFlows.occurredOn, `${year + 1}-01-01`)));
}

/** The years with any recorded income, newest first. */
export async function getIncomeYears(): Promise<number[]> {
  await requireAdmin();
  const year = sql<number>`extract(year from ${cashFlows.occurredOn})::int`;
  const rows = await getDb().selectDistinct({ year }).from(cashFlows).where(eq(cashFlows.kind, "income")).orderBy(desc(year));
  return rows.map((r) => Number(r.year));
}

/** Tax already taken at source in a year (bank interest, dividends), per currency, as imports report it. */
export async function getTaxWithheld(year: number) {
  await requireAdmin();
  const e = importedEntries;
  const rows = await getDb()
    .select({ provider: e.provider, currency: e.currency, total: sql<string>`sum(abs(${e.amount}))` })
    .from(e)
    .where(and(eq(e.kind, "tax"), gte(e.occurredOn, `${year}-01-01`), lt(e.occurredOn, `${year + 1}-01-01`)))
    .groupBy(e.provider, e.currency);
  return rows.map((r) => ({ provider: r.provider, currency: r.currency, total: Number(r.total) }));
}

/** Imported income posted to Transactions since `since`, for spotting payers that repeat. */
export async function getImportedIncome(since: string) {
  return getImportedFlows("income", since);
}

/** Things you own that no account syncs, archived ones last. Only unarchived ones count in net worth. */
export async function getManualAccounts() {
  await requireAdmin();
  return getDb().select().from(holdings).orderBy(asc(holdings.archived), asc(holdings.name));
}

/** Credit cards, loans and other debts, archived ones last. Only unarchived ones count in net worth. */
export async function getDebts() {
  await requireAdmin();
  return getDb().select().from(liabilities).orderBy(asc(liabilities.archived), desc(liabilities.balance));
}

/** A month's own budgets by category; null means "no budget this month". Categories missing from it use their default. */
export async function getMonthBudgets(month: string): Promise<Map<number, number | null>> {
  await requireAdmin();
  const rows = await getDb().select({ categoryId: categoryBudgets.categoryId, amount: categoryBudgets.amount }).from(categoryBudgets).where(eq(categoryBudgets.month, month));
  return new Map(rows.map((r) => [r.categoryId, r.amount]));
}

/** The Overview's latest AI feedback, or null before the first one. */
export async function getAiSummary() {
  await requireAdmin();
  return latestAiSummary();
}

export async function getGoals() {
  await requireAdmin();
  return getDb().select().from(goals).orderBy(asc(goals.archived), asc(goals.sortOrder), asc(goals.createdAt));
}

/** Net worth right now, the same total the Overview shows (debts and manual accounts included). */
export async function getNetWorthNow() {
  await requireAdmin();
  return currentNetWorth();
}

export async function getSnapshots() {
  await requireAdmin();
  return getDb().select().from(netWorthSnapshots).orderBy(asc(netWorthSnapshots.snapshotDate));
}

/**
 * Net-worth points from the last one on or before `anchor` onwards, oldest first: what the Overview's
 * "vs a month ago" and its trend line read, without loading the whole history.
 */
export async function getSnapshotsSince(anchor: string) {
  await requireAdmin();
  const s = netWorthSnapshots;
  return getDb().select().from(s)
    .where(gte(s.snapshotDate, sql`coalesce((select max(${s.snapshotDate}) from ${s} where ${s.snapshotDate} <= ${anchor}), ${anchor}::date)`))
    .orderBy(asc(s.snapshotDate));
}

/** Each investment account's daily value, oldest first. */
export async function getPortfolioSnapshots() {
  await requireAdmin();
  return getDb().select().from(portfolioSnapshots).orderBy(asc(portfolioSnapshots.snapshotDate));
}

/** Each investment account's latest saved balances (value, known cost and P/L), one row per account. */
export async function getLatestPortfolioSnapshots() {
  await requireAdmin();
  return getDb()
    .selectDistinctOn([portfolioSnapshots.provider])
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.source, "balances"))
    .orderBy(portfolioSnapshots.provider, desc(portfolioSnapshots.snapshotDate));
}

/** Everything, for the JSON backup download. */
export async function getExportData() {
  await requireAdmin();
  const db = getDb();
  const [h, l, c, f, s, p, x, r, connections, imports, rules, dismissals, reports, historyStreams, g, b] = await Promise.all([
    db.select().from(holdings).orderBy(asc(holdings.createdAt)),
    db.select().from(liabilities).orderBy(asc(liabilities.createdAt)),
    db.select().from(categories).orderBy(asc(categories.id)),
    db.select().from(cashFlows).orderBy(asc(cashFlows.occurredOn), asc(cashFlows.createdAt)),
    db.select().from(netWorthSnapshots).orderBy(asc(netWorthSnapshots.snapshotDate)),
    db.select().from(portfolioSnapshots).orderBy(asc(portfolioSnapshots.snapshotDate), asc(portfolioSnapshots.provider)),
    db.select().from(fxRates).orderBy(asc(fxRates.currency)),
    db.select().from(recurringCashFlows).orderBy(asc(recurringCashFlows.createdAt)),
    loadConnectionViews(),
    db.select().from(importedEntries).orderBy(asc(importedEntries.occurredOn)),
    db.select().from(categoryRules).orderBy(asc(categoryRules.createdAt)),
    db.select().from(notificationDismissals),
    db.select().from(investmentReports).orderBy(asc(investmentReports.createdAt)),
    db.select().from(investmentSyncs).orderBy(asc(investmentSyncs.createdAt)),
    db.select().from(goals).orderBy(asc(goals.sortOrder), asc(goals.createdAt)),
    db.select().from(categoryBudgets).orderBy(asc(categoryBudgets.month), asc(categoryBudgets.categoryId)),
  ]);
  return { holdings: h, liabilities: l, categories: c, cashFlows: f, recurring: r, netWorthSnapshots: s, portfolioSnapshots: p, fxRates: x, connections, importedEntries: imports, categoryRules: rules, notificationDismissals: dismissals, investmentReports: reports, investmentSyncs: historyStreams, goals: g, categoryBudgets: b };
}
