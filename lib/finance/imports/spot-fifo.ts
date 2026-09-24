import "server-only";
import { and, count, eq, isNotNull, max } from "drizzle-orm";
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
  updatedAt: importedEntries.updatedAt,
};

function sameSignature(saved: { sourceCount: number; sourceUpdatedAt: Date | null } | undefined, countValue: number, updatedAt: Date | null) {
  if (!saved) return false;
  return saved.sourceCount === countValue && (saved.sourceUpdatedAt?.getTime() ?? null) === (updatedAt?.getTime() ?? null);
}

/** Full history when `asOf` is null. A snapshot time limits fills to those already in that balance. */
export async function readSpotFifo(accountKey: string, asOf: string | null): Promise<PreparedSpotCosts> {
  const db = getDb();
  const asOfKey = asOf ?? "";
  const [saved, [signature]] = await Promise.all([
    db.select().from(spotFifoMeta).where(and(eq(spotFifoMeta.accountKey, accountKey), eq(spotFifoMeta.asOf, asOfKey))).limit(1),
    db.select({ n: count(), updated: max(importedEntries.updatedAt) }).from(importedEntries).where(and(
      eq(importedEntries.provider, "binance"), eq(importedEntries.accountKey, accountKey), isNotNull(importedEntries.trade))),
  ]);
  const sourceCount = signature?.n ?? 0;
  const sourceUpdatedAt = signature?.updated ?? null;
  const meta = saved[0];
  if (meta && sameSignature(meta, sourceCount, sourceUpdatedAt)) {
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
  const counted = stored.length;
  const latest = stored.reduce<Date | null>((latestAt, row) => (!latestAt || row.updatedAt > latestAt ? row.updatedAt : latestAt), null);
  const replace = db.delete(spotFifoCache).where(and(eq(spotFifoCache.accountKey, accountKey), eq(spotFifoCache.asOf, asOfKey)));
  const insertGroups = summary.fifo.length ? [db.insert(spotFifoCache).values(summary.fifo.map((group) => ({
    accountKey: group.accountKey, asOf: asOfKey, symbol: group.symbol, baseAsset: group.baseAsset, quoteAsset: group.quoteAsset,
    bought: group.bought, sold: group.sold, remaining: group.remaining, cost: group.cost, realized: group.realized,
    unmatched: group.unmatched, externalFees: group.externalFees,
  })))] : [];
  const saveMeta = db.insert(spotFifoMeta).values({
    accountKey, asOf: asOfKey, sourceCount: counted, sourceUpdatedAt: latest, ignoredBases: summary.ignoredBases, paymentAssets: summary.paymentAssets,
  }).onConflictDoUpdate({
    target: [spotFifoMeta.accountKey, spotFifoMeta.asOf],
    set: { sourceCount: counted, sourceUpdatedAt: latest, ignoredBases: summary.ignoredBases, paymentAssets: summary.paymentAssets },
  });
  await db.batch([replace, ...insertGroups, saveMeta]);
  return { fifo: summary.fifo, ignoredBases: new Set(summary.ignoredBases), paymentAssets: new Set(summary.paymentAssets) };
}

/** Every cached Binance account, rebuilt when its fills have changed. */
export async function readAllSpotFifo() {
  const accounts = await getDb().selectDistinct({ accountKey: importedEntries.accountKey }).from(importedEntries).where(and(
    eq(importedEntries.provider, "binance"), isNotNull(importedEntries.trade)));
  const groups = [];
  for (const account of accounts) groups.push(...(await readSpotFifo(account.accountKey, null)).fifo);
  return groups;
}
