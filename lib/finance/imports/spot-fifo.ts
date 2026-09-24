import "server-only";
import { and, count, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { importedEntries, spotFifo as spotFifoCache, spotFifoMeta } from "@/lib/db/schema";
import { summarizeSpotTrades } from "./spot";
import type { PreparedSpotCosts } from "./holding-costs";
import type { SpotTrade } from "./types";

const tradeRows = {
  accountKey: importedEntries.accountKey,
  externalId: importedEntries.externalId,
  status: importedEntries.status,
  trade: importedEntries.trade,
};

const FIFO_COLUMNS = ["base_asset", "quote_asset", "bought", "sold", "remaining", "cost", "realized", "unmatched", "external_fees"] as const;

/**
 * Fingerprint of everything FIFO reads: which fills exist, their status and their data.
 * Timestamps are not enough: drizzle stamps `updated_at` with the app's clock and inserts use the
 * database's, so a status change can land "earlier" than the newest row and go unnoticed.
 */
const sourceHash = sql<string>`coalesce(md5(string_agg(${importedEntries.externalId} || ':' || ${importedEntries.status} || ':' || ${importedEntries.trade}::text, ',' order by ${importedEntries.externalId})), '')`;

/** Full history when `asOf` is null. A snapshot time limits fills to those already in that balance. */
export async function readSpotFifo(accountKey: string, asOf: string | null): Promise<PreparedSpotCosts> {
  const db = getDb();
  const asOfKey = asOf ?? "";
  const [saved, [signature]] = await Promise.all([
    db.select().from(spotFifoMeta).where(and(eq(spotFifoMeta.accountKey, accountKey), eq(spotFifoMeta.asOf, asOfKey))).limit(1),
    db.select({ n: count(), hash: sourceHash }).from(importedEntries).where(and(
      eq(importedEntries.provider, "binance"), eq(importedEntries.accountKey, accountKey), isNotNull(importedEntries.trade))),
  ]);
  const sourceCount = signature?.n ?? 0;
  const hash = signature?.hash ?? "";
  const meta = saved[0];
  if (meta && meta.sourceCount === sourceCount && meta.sourceHash === hash) {
    const rows = await db.select().from(spotFifoCache).where(and(eq(spotFifoCache.accountKey, accountKey), eq(spotFifoCache.asOf, asOfKey)));
    return {
      fifo: rows.map((row) => ({ accountKey: row.accountKey, symbol: row.symbol, baseAsset: row.baseAsset, quoteAsset: row.quoteAsset,
        bought: row.bought, sold: row.sold, remaining: row.remaining, cost: row.cost, realized: row.realized, unmatched: row.unmatched, externalFees: row.externalFees })),
      ignoredBases: new Set(meta.ignoredBases),
      paymentAssets: new Set(meta.paymentAssets),
    };
  }

  const stored = await db.select(tradeRows).from(importedEntries).where(and(
    eq(importedEntries.provider, "binance"), eq(importedEntries.accountKey, accountKey), isNotNull(importedEntries.trade)));
  const summary = summarizeSpotTrades(stored.map((row) => ({ accountKey: row.accountKey, externalId: row.externalId, status: row.status, trade: row.trade as SpotTrade | null })), asOf);
  // Saved with the fingerprint read before these rows. If fills changed in between, the next read sees a
  // different fingerprint and rebuilds, so the cache can be rebuilt more often than needed but is never stale.
  // Only the full history and the latest snapshot are read; older snapshot keys would pile up after every sync.
  const prune = [spotFifoCache, spotFifoMeta].map((table) => db.delete(table).where(and(eq(table.accountKey, accountKey), notInArray(table.asOf, ["", asOfKey]))));
  const replace = db.delete(spotFifoCache).where(and(eq(spotFifoCache.accountKey, accountKey), eq(spotFifoCache.asOf, asOfKey)));
  // A concurrent rebuild of the same key can insert first; overwrite instead of failing on the primary key.
  const insertGroups = summary.fifo.length ? [db.insert(spotFifoCache).values(summary.fifo.map((group) => ({
    accountKey: group.accountKey, asOf: asOfKey, symbol: group.symbol, baseAsset: group.baseAsset, quoteAsset: group.quoteAsset,
    bought: group.bought, sold: group.sold, remaining: group.remaining, cost: group.cost, realized: group.realized,
    unmatched: group.unmatched, externalFees: group.externalFees,
  }))).onConflictDoUpdate({
    target: [spotFifoCache.accountKey, spotFifoCache.asOf, spotFifoCache.symbol],
    set: Object.fromEntries(FIFO_COLUMNS.map((column) => [column, sql.raw(`excluded.${column}`)])),
  })] : [];
  const saveMeta = db.insert(spotFifoMeta).values({
    accountKey, asOf: asOfKey, sourceCount, sourceHash: hash, ignoredBases: summary.ignoredBases, paymentAssets: summary.paymentAssets,
  }).onConflictDoUpdate({
    target: [spotFifoMeta.accountKey, spotFifoMeta.asOf],
    set: { sourceCount, sourceHash: hash, ignoredBases: summary.ignoredBases, paymentAssets: summary.paymentAssets },
  });
  try {
    await db.batch([replace, ...prune, ...insertGroups, saveMeta]);
  } catch (error) {
    // The cache is an optimization. A failed save must never break the page that asked for the numbers.
    console.error("[admin] spot fifo cache save failed", error);
  }
  return { fifo: summary.fifo, ignoredBases: new Set(summary.ignoredBases), paymentAssets: new Set(summary.paymentAssets) };
}

/** Every cached Binance account, rebuilt when its fills have changed. */
export async function readAllSpotFifo() {
  const accounts = await getDb().selectDistinct({ accountKey: importedEntries.accountKey }).from(importedEntries).where(and(
    eq(importedEntries.provider, "binance"), isNotNull(importedEntries.trade)));
  const prepared = await Promise.all(accounts.map((account) => readSpotFifo(account.accountKey, null)));
  return prepared.flatMap((account) => account.fifo);
}
