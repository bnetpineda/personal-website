import "server-only";
import { gunzipSync } from "node:zlib";
import type { PgTable } from "drizzle-orm/pg-core";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "@/lib/db";
import {
  cashFlows, categories, categoryBudgets, categoryRules, fxRates, goals, holdings, importedEntries, investmentReports, investmentSyncs,
  liabilities, netWorthSnapshots, notificationDismissals, portfolioSnapshots, recurringCashFlows, statementBalances,
} from "@/lib/db/schema";
import { MAX_BACKUP_BYTES, MAX_UPLOAD_BYTES } from "./backup-limits";
import { categoryIdMap, keySet, parseBackup, planRestore, withCategoryIds, type Backup, type ExistingRows, type ParsedBackup, type RestorePlan } from "./backup";

/* Restoring a backup: callers check requireAdmin first. Rows that exist are never touched. */

/** Reads an uploaded backup, plain JSON or gzipped by the browser. */
export async function readBackupFile(file: FormDataEntryValue | null): Promise<ParsedBackup> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a backup file." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: "That file is too large to upload. Backups compress automatically in current browsers; try one." };
  const bytes = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: MAX_BACKUP_BYTES }) : bytes).toString("utf8");
  } catch {
    return { ok: false, message: "That backup couldn't be read, or it's too large to restore here." };
  }
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, message: "That backup is too large to restore here." };
  return parseBackup(text);
}

async function loadExisting(): Promise<ExistingRows> {
  const db = getDb();
  const [c, h, l, r, f, ie, cr, cb, g, sb, nw, ps, fx, rep, sync, nd] = await Promise.all([
    db.select({ id: categories.id, kind: categories.kind, name: categories.name }).from(categories),
    db.select({ id: holdings.id, statementSource: holdings.statementSource, currency: holdings.currency }).from(holdings),
    db.select({ id: liabilities.id }).from(liabilities),
    db.select({ id: recurringCashFlows.id }).from(recurringCashFlows),
    db.select({ id: cashFlows.id, recurringId: cashFlows.recurringId, recurringOn: cashFlows.recurringOn }).from(cashFlows),
    db.select({ id: importedEntries.id, provider: importedEntries.provider, accountKey: importedEntries.accountKey, externalId: importedEntries.externalId }).from(importedEntries),
    db.select({ id: categoryRules.id }).from(categoryRules),
    db.select({ categoryId: categoryBudgets.categoryId, month: categoryBudgets.month }).from(categoryBudgets),
    db.select({ id: goals.id }).from(goals),
    db.select({ provider: statementBalances.provider, account: statementBalances.account, currency: statementBalances.currency }).from(statementBalances),
    db.select({ snapshotDate: netWorthSnapshots.snapshotDate }).from(netWorthSnapshots),
    db.select({ provider: portfolioSnapshots.provider, snapshotDate: portfolioSnapshots.snapshotDate }).from(portfolioSnapshots),
    db.select({ currency: fxRates.currency }).from(fxRates),
    db.select({ id: investmentReports.id, provider: investmentReports.provider, fileHash: investmentReports.fileHash }).from(investmentReports),
    db.select({ id: investmentSyncs.id, accountKey: investmentSyncs.accountKey, scope: investmentSyncs.scope }).from(investmentSyncs),
    db.select({ key: notificationDismissals.key }).from(notificationDismissals),
  ]);
  return {
    categories: c,
    keys: {
      holdings: keySet("holdings", h), liabilities: keySet("liabilities", l), recurring: keySet("recurring", r), cashFlows: keySet("cashFlows", f),
      importedEntries: keySet("importedEntries", ie), categoryRules: keySet("categoryRules", cr), categoryBudgets: keySet("categoryBudgets", cb),
      goals: keySet("goals", g), statementBalances: keySet("statementBalances", sb), netWorthSnapshots: keySet("netWorthSnapshots", nw),
      portfolioSnapshots: keySet("portfolioSnapshots", ps), fxRates: keySet("fxRates", fx), investmentReports: keySet("investmentReports", rep),
      investmentSyncs: keySet("investmentSyncs", sync), notificationDismissals: keySet("notificationDismissals", nd),
    },
  };
}

/** What a restore would add, per table. */
export async function previewBackup(backup: Backup): Promise<RestorePlan["counts"]> {
  return planRestore(backup, await loadExisting()).counts;
}

const ROWS_PER_INSERT = 500;
/** Each batch is one transaction over HTTP; a very large restore runs as a few, in order (re-running finishes a partial one). */
const ROWS_PER_BATCH = 4000;

/** Inserts the backup's new rows and returns how many were added per table. */
export async function restoreBackup(backup: Backup): Promise<RestorePlan["counts"]> {
  const db = getDb();
  const plan = planRestore(backup, await loadExisting());
  if (plan.rows.categories.length) {
    // Serial ids: new categories get fresh ones, then every reference is remapped by kind and name.
    await db.insert(categories).values(plan.rows.categories.map((c) => ({
      kind: c.kind, name: c.name, color: c.color, monthlyBudget: c.monthlyBudget, sortOrder: c.sortOrder, archived: c.archived, createdAt: c.createdAt, updatedAt: c.updatedAt,
    }))).onConflictDoNothing();
  }
  const ids = categoryIdMap(backup, await db.select({ id: categories.id, kind: categories.kind, name: categories.name }).from(categories));
  const rows = withCategoryIds(plan.rows, ids);

  const items: { statement: BatchItem<"pg">; size: number }[] = [];
  const add = <T extends PgTable>(table: T, values: T["$inferInsert"][]) => {
    for (let i = 0; i < values.length; i += ROWS_PER_INSERT) {
      const part = values.slice(i, i + ROWS_PER_INSERT);
      items.push({ statement: db.insert(table).values(part as never).onConflictDoNothing(), size: part.length });
    }
  };
  // Order matters: each table after the ones it refers to.
  add(holdings, rows.holdings);
  add(liabilities, rows.liabilities);
  add(recurringCashFlows, rows.recurring);
  add(cashFlows, rows.cashFlows);
  add(importedEntries, rows.importedEntries);
  add(categoryRules, rows.categoryRules);
  add(categoryBudgets, rows.categoryBudgets);
  add(goals, rows.goals);
  add(statementBalances, rows.statementBalances);
  add(netWorthSnapshots, rows.netWorthSnapshots);
  add(portfolioSnapshots, rows.portfolioSnapshots);
  add(fxRates, rows.fxRates);
  add(investmentReports, rows.investmentReports);
  add(investmentSyncs, rows.investmentSyncs);
  add(notificationDismissals, rows.notificationDismissals);

  for (let start = 0; start < items.length;) {
    let end = start, size = 0;
    while (end < items.length && (end === start || size + items[end].size <= ROWS_PER_BATCH)) size += items[end++].size;
    const [first, ...rest] = items.slice(start, end).map((item) => item.statement);
    await db.batch([first, ...rest]);
    start = end;
  }
  return plan.counts;
}
