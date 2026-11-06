import { z } from "zod";
import { ASSET_CLASSES, CASH_FLOW_KINDS, GOAL_MEASURES, LIABILITY_KINDS, PRICE_SOURCES, RECURRENCE_FREQUENCIES } from "./constants";
import { PROVIDERS, SYNC_PROVIDERS } from "./connections/types";
import { CATEGORIZED_BY, ENTRY_KINDS, ENTRY_STATUSES, spotTradeSchema } from "./imports/types";
import { PORTFOLIO_SOURCES } from "./performance";

/*
 * Restoring a JSON backup (app/admin/export) by merging: rows already in the database are left exactly
 * as they are, and nothing is deleted. Pure, for tests; lib/finance/backup-service.ts reads the existing
 * keys and writes the plan. Account connections are never restored: the export has no credentials.
 */

const uuid = z.guid();
const day = z.iso.date();
const time = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const amount = z.number().finite();
const currency = z.string().regex(/^[A-Z]{3}$/);
const categoryId = z.number().int().positive();
/** Columns added after a backup was made read as null. */
const maybe = <T extends z.ZodType>(schema: T) => schema.nullable().default(null);
const timestamps = { createdAt: time.optional(), updatedAt: time.optional() };

const categoryRow = z.object({
  id: categoryId, kind: z.enum(CASH_FLOW_KINDS), name: z.string().min(1), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  monthlyBudget: maybe(amount.nonnegative()), sortOrder: z.number().int().default(0), archived: z.boolean().default(false), ...timestamps,
});
const holdingRow = z.object({
  id: uuid, assetClass: z.enum(ASSET_CLASSES), name: z.string().min(1), symbol: maybe(z.string()), platform: maybe(z.string()),
  quantity: amount.nonnegative(), avgCost: amount.nonnegative(), currency, priceSource: z.enum(PRICE_SOURCES).default("manual"),
  priceRef: maybe(z.string()), lastPrice: maybe(amount.nonnegative()), priceUpdatedAt: maybe(time), archived: z.boolean().default(false),
  notes: maybe(z.string()), statementSource: maybe(z.string()), statementAsOf: maybe(day), ...timestamps,
});
const liabilityRow = z.object({
  id: uuid, kind: z.enum(LIABILITY_KINDS), name: z.string().min(1), lender: maybe(z.string()), balance: amount.nonnegative(), currency,
  creditLimit: maybe(amount), interestRate: maybe(amount), dueDay: maybe(z.number().int().min(1).max(31)), minPayment: maybe(amount),
  archived: z.boolean().default(false), notes: maybe(z.string()), ...timestamps,
});
const recurringRow = z.object({
  id: uuid, kind: z.enum(CASH_FLOW_KINDS), amount: amount.positive(), currency, categoryId, description: z.string(), account: maybe(z.string()),
  notes: maybe(z.string()), frequency: z.enum(RECURRENCE_FREQUENCIES), startOn: day, secondDay: maybe(z.number().int().min(1).max(31)),
  endOn: maybe(day), nextOn: maybe(day), autoPost: z.boolean().default(true), paused: z.boolean().default(false), ...timestamps,
});
const cashFlowRow = z.object({
  id: uuid, kind: z.enum(CASH_FLOW_KINDS), occurredOn: day, amount: amount.positive(), currency, amountPhp: amount, categoryId,
  description: z.string(), account: maybe(z.string()), notes: maybe(z.string()), recurringId: maybe(uuid), recurringOn: maybe(day),
  liabilityId: maybe(uuid), ...timestamps,
});
const importedEntryRow = z.object({
  id: uuid, provider: z.enum(PROVIDERS), accountKey: z.string().min(1), externalId: z.string().min(1), occurredOn: day, kind: z.enum(ENTRY_KINDS),
  amount, currency: z.string().min(1).max(30), description: z.string(), realizedPnl: maybe(amount), trade: maybe(spotTradeSchema),
  status: z.enum(ENTRY_STATUSES).default("pending"), categoryId: maybe(categoryId), transferId: maybe(uuid),
  categorizedBy: maybe(z.enum(CATEGORIZED_BY)), aiReason: maybe(z.string()), aiSuggestion: maybe(z.enum(["post", "transfer", "investment", "ignore"])),
  aiAttemptedAt: maybe(time), ...timestamps,
});
const categoryRuleRow = z.object({
  id: uuid, contains: z.string().min(1), provider: maybe(z.enum(PROVIDERS)), kind: z.enum(CASH_FLOW_KINDS), categoryId,
  autoPost: z.boolean().default(false), enabled: z.boolean().default(true), ...timestamps,
});
const categoryBudgetRow = z.object({ categoryId, month: z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/), amount: maybe(amount.nonnegative()), ...timestamps });
const goalRow = z.object({
  id: uuid, name: z.string().min(1), measure: z.enum(GOAL_MEASURES), target: amount.positive(), saved: maybe(amount.nonnegative()),
  targetOn: maybe(day), archived: z.boolean().default(false), sortOrder: z.number().int().default(0), ...timestamps,
});
const statementBalanceRow = z.object({ provider: z.enum(["wise", "maribank"]), account: z.string().min(1), currency, amount, asOf: day, ...timestamps });
const netWorthSnapshotRow = z.object({
  snapshotDate: day, assetsPhp: amount, liabilitiesPhp: amount, netWorthPhp: amount, investedPhp: amount,
  byClass: z.partialRecord(z.enum(ASSET_CLASSES), amount), updatedAt: time.optional(),
});
const portfolioSnapshotRow = z.object({
  provider: z.enum(SYNC_PROVIDERS), snapshotDate: day, valueUsd: amount, costUsd: maybe(amount), pnlUsd: maybe(amount),
  source: z.enum(PORTFOLIO_SOURCES), updatedAt: time.optional(),
});
const fxRateRow = z.object({ currency, rateToPhp: amount.positive(), asOf: day, updatedAt: time.optional() });
const investmentReportRow = z.object({
  id: uuid, provider: z.enum(PROVIDERS), fileHash: z.string().min(1), accounts: z.array(z.string()), fromDate: day, toDate: day,
  entries: z.number().int().nonnegative(), createdAt: time.optional(),
});
/** Leases are left out: a restored stream starts unlocked. */
const investmentSyncRow = z.object({
  id: uuid, accountKey: z.string().min(1), scope: z.string().min(1), fromDate: day, toDate: day, cursor: z.string(),
  completedAt: maybe(time), lastSyncedAt: maybe(time), enabled: z.boolean().default(true), error: maybe(z.string()), ...timestamps,
});
const notificationDismissalRow = z.object({ key: z.string().min(1), dismissedAt: time.optional() });

const backupSchema = z.object({
  exportedAt: z.iso.datetime({ offset: true }),
  categories: z.array(categoryRow).default([]),
  holdings: z.array(holdingRow).default([]),
  liabilities: z.array(liabilityRow).default([]),
  recurring: z.array(recurringRow).default([]),
  cashFlows: z.array(cashFlowRow).default([]),
  importedEntries: z.array(importedEntryRow).default([]),
  categoryRules: z.array(categoryRuleRow).default([]),
  categoryBudgets: z.array(categoryBudgetRow).default([]),
  goals: z.array(goalRow).default([]),
  statementBalances: z.array(statementBalanceRow).default([]),
  netWorthSnapshots: z.array(netWorthSnapshotRow).default([]),
  portfolioSnapshots: z.array(portfolioSnapshotRow).default([]),
  fxRates: z.array(fxRateRow).default([]),
  investmentReports: z.array(investmentReportRow).default([]),
  investmentSyncs: z.array(investmentSyncRow).default([]),
  notificationDismissals: z.array(notificationDismissalRow).default([]),
});

export type Backup = z.output<typeof backupSchema>;

/** Restore order: every table comes after the tables it refers to. */
export const BACKUP_TABLES = [
  { key: "categories", label: "Categories" },
  { key: "holdings", label: "Holdings" },
  { key: "liabilities", label: "Debts" },
  { key: "recurring", label: "Recurring items" },
  { key: "cashFlows", label: "Entries" },
  { key: "importedEntries", label: "Imported activity" },
  { key: "categoryRules", label: "Category rules" },
  { key: "categoryBudgets", label: "Monthly budgets" },
  { key: "goals", label: "Goals" },
  { key: "statementBalances", label: "Statement balances" },
  { key: "netWorthSnapshots", label: "Net worth history" },
  { key: "portfolioSnapshots", label: "Account value history" },
  { key: "fxRates", label: "Exchange rates" },
  { key: "investmentReports", label: "Imported reports" },
  { key: "investmentSyncs", label: "History sync progress" },
  { key: "notificationDismissals", label: "Dismissed alerts" },
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number]["key"];
export type BackupRows = { [T in BackupTable]: Backup[T][number][] };

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; message: string };

/** Validates a backup file's text, including that every row's references are in the file. */
export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn't a JSON backup from this admin." };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) return { ok: false, message: "That file isn't a complete backup from this admin, or it was edited." };
  const backup = parsed.data;
  const categoryIds = new Set(backup.categories.map((c) => c.id));
  const recurringIds = new Set(backup.recurring.map((r) => r.id));
  const liabilityIds = new Set(backup.liabilities.map((l) => l.id));
  const missingCategory = [...backup.cashFlows, ...backup.recurring, ...backup.categoryRules, ...backup.categoryBudgets, ...backup.importedEntries]
    .some((row) => row.categoryId != null && !categoryIds.has(row.categoryId));
  const missingLink = backup.cashFlows.some((f) => (f.recurringId != null && !recurringIds.has(f.recurringId)) || (f.liabilityId != null && !liabilityIds.has(f.liabilityId)));
  if (missingCategory || missingLink) return { ok: false, message: "This backup refers to records it doesn't contain, so it can't be restored safely." };
  return { ok: true, backup };
}

/** Maps a backup's category id to the database's, once that category exists there. */
export type CategoryIds = (id: number) => number | undefined;

const join = (...parts: (string | number | null | undefined)[]) => (parts.some((p) => p == null) ? null : parts.join("|"));

/**
 * Every unique key of a row (primary key and other unique indexes), as the database would compare
 * them. A row is already present when any of its keys is. Typed to the columns read back from the database.
 */
export const ROW_KEYS: {
  categories: (row: { kind: string; name: string }) => (string | null)[];
  holdings: (row: { id: string; statementSource: string | null; currency: string }) => (string | null)[];
  liabilities: (row: { id: string }) => (string | null)[];
  recurring: (row: { id: string }) => (string | null)[];
  cashFlows: (row: { id: string; recurringId: string | null; recurringOn: string | null }) => (string | null)[];
  importedEntries: (row: { id: string; provider: string; accountKey: string; externalId: string }) => (string | null)[];
  categoryRules: (row: { id: string }) => (string | null)[];
  categoryBudgets: (row: { categoryId: number; month: string }, category: CategoryIds) => (string | null)[];
  goals: (row: { id: string }) => (string | null)[];
  statementBalances: (row: { provider: string; account: string; currency: string }) => (string | null)[];
  netWorthSnapshots: (row: { snapshotDate: string }) => (string | null)[];
  portfolioSnapshots: (row: { provider: string; snapshotDate: string }) => (string | null)[];
  fxRates: (row: { currency: string }) => (string | null)[];
  investmentReports: (row: { id: string; provider: string; fileHash: string }) => (string | null)[];
  investmentSyncs: (row: { id: string; accountKey: string; scope: string }) => (string | null)[];
  notificationDismissals: (row: { key: string }) => (string | null)[];
} = {
  categories: (r) => [join(r.kind, r.name)],
  holdings: (r) => [r.id, join("statement", r.statementSource, r.currency)],
  liabilities: (r) => [r.id],
  recurring: (r) => [r.id],
  cashFlows: (r) => [r.id, join("occurrence", r.recurringId, r.recurringOn)],
  importedEntries: (r) => [r.id, join("source", r.provider, r.accountKey, r.externalId)],
  categoryRules: (r) => [r.id],
  categoryBudgets: (r, category) => [join(category(r.categoryId), r.month)],
  goals: (r) => [r.id],
  statementBalances: (r) => [join(r.provider, r.account, r.currency)],
  netWorthSnapshots: (r) => [r.snapshotDate],
  portfolioSnapshots: (r) => [join(r.provider, r.snapshotDate)],
  fxRates: (r) => [r.currency],
  investmentReports: (r) => [r.id, join("file", r.provider, r.fileHash)],
  investmentSyncs: (r) => [r.id, join("stream", r.accountKey, r.scope)],
  notificationDismissals: (r) => [r.key],
};

type KeyFn = (row: unknown, category: CategoryIds) => (string | null)[];

/** The key set of rows already in the database (whose category ids need no mapping). */
export function keySet<T extends BackupTable>(table: T, rows: Parameters<(typeof ROW_KEYS)[T]>[0][]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) for (const key of (ROW_KEYS[table] as KeyFn)(row, (id) => id)) if (key) keys.add(key);
  return keys;
}

export interface ExistingRows {
  categories: { id: number; kind: string; name: string }[];
  keys: { [T in BackupTable]?: Set<string> };
}

export interface TableCount {
  table: BackupTable;
  label: string;
  fresh: number;
  present: number;
}

export interface RestorePlan {
  counts: TableCount[];
  /** Rows to insert, still with the backup's category ids (see `withCategoryIds`). */
  rows: BackupRows;
}

/** Which rows are new. Also drops duplicates within the file, so each key is inserted once. */
export function planRestore(backup: Backup, existing: ExistingRows): RestorePlan {
  const known = categoryIdMap(backup, existing.categories);
  const category: CategoryIds = (id) => known.get(id);
  const counts: TableCount[] = [];
  const rows = {} as Record<BackupTable, unknown[]>;
  for (const { key: table, label } of BACKUP_TABLES) {
    const seen = new Set(table === "categories" ? keySet("categories", existing.categories) : existing.keys[table]);
    const fresh: unknown[] = [];
    for (const row of backup[table]) {
      const keys = (ROW_KEYS[table] as KeyFn)(row, category);
      if (keys.some((key) => key != null && seen.has(key))) continue;
      for (const key of keys) if (key) seen.add(key);
      fresh.push(row);
    }
    rows[table] = fresh;
    if (backup[table].length) counts.push({ table, label, fresh: fresh.length, present: backup[table].length - fresh.length });
  }
  return { counts, rows: rows as BackupRows };
}

/**
 * Swaps the backup's category ids for the database's in every row that refers to one (categories are
 * serial, so ids differ between databases; they're matched by kind and name). Every category must exist by now.
 */
export function withCategoryIds(rows: BackupRows, ids: Map<number, number>) {
  const id = (backupId: number) => {
    const mapped = ids.get(backupId);
    if (mapped == null) throw new Error("A backup category is missing from the database.");
    return mapped;
  };
  return {
    ...rows,
    recurring: rows.recurring.map((r) => ({ ...r, categoryId: id(r.categoryId) })),
    cashFlows: rows.cashFlows.map((r) => ({ ...r, categoryId: id(r.categoryId) })),
    importedEntries: rows.importedEntries.map((r) => ({ ...r, categoryId: r.categoryId == null ? null : id(r.categoryId) })),
    categoryRules: rows.categoryRules.map((r) => ({ ...r, categoryId: id(r.categoryId) })),
    categoryBudgets: rows.categoryBudgets.map((r) => ({ ...r, categoryId: id(r.categoryId) })),
  };
}

/** Backup category id -> database id, by kind and name. */
export function categoryIdMap(backup: Pick<Backup, "categories">, database: ExistingRows["categories"]): Map<number, number> {
  const byName = new Map(database.map((c) => [join(c.kind, c.name), c.id]));
  return new Map(backup.categories.flatMap((c) => {
    const id = byName.get(join(c.kind, c.name));
    return id == null ? [] : [[c.id, id] as const];
  }));
}
