import "server-only";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountConnections, importedEntries, investmentSyncs, portfolioSnapshots } from "@/lib/db/schema";
import { round2, type FxTable } from "./calc";
import { normalizeBinanceSnapshot } from "./connections/binance-positions";
import type { ConnectionSnapshot, SyncProvider } from "./connections/types";
import { holdingCosts, type HoldingCost } from "./imports/holding-costs";
import { readSpotFifo } from "./imports/spot-fifo";
import { accountTotals, navTotals, snapshotDay, type NavPoint } from "./performance";
import { loadFxTable } from "./service";

/*
 * Portfolio history. No auth check here: shared by the cron route (CRON_SECRET) and by pages and
 * Server Actions, which call requireAdmin() first.
 */

/** Purchase cost estimates for the coins in a Binance snapshot, from imported Spot fills. */
export async function loadBinanceHoldingCosts(snapshot: ConnectionSnapshot | null): Promise<HoldingCost[]> {
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

type PortfolioRow = typeof portfolioSnapshots.$inferInsert;

/**
 * One row per connected account for the day its saved balances describe. An account holding a currency
 * without an exchange rate is skipped rather than recorded short.
 */
export function portfolioRows(
  connections: readonly { provider: SyncProvider; snapshot: ConnectionSnapshot | null }[],
  fx: FxTable,
  binanceCosts: readonly HoldingCost[]
): PortfolioRow[] {
  return connections.flatMap(({ provider, snapshot }) => {
    if (!snapshot) return [];
    const totals = accountTotals(provider, snapshot.positions, fx, provider === "binance" ? binanceCosts : []);
    if (totals.missingFx.length) return [];
    const usd = (n: number | null) => (n == null ? null : round2(n));
    return [{ provider, snapshotDate: snapshotDay(provider, snapshot.asOf), valueUsd: round2(totals.valueUsd),
      costUsd: usd(totals.costUsd), pnlUsd: usd(totals.pnlUsd), source: "balances" as const, updatedAt: new Date() }];
  });
}

/** Balance rows replace whatever their day held before, an IBKR NAV fill included. */
export async function savePortfolioRows(rows: PortfolioRow[]): Promise<void> {
  if (!rows.length) return;
  await getDb().insert(portfolioSnapshots).values(rows).onConflictDoUpdate({
    target: [portfolioSnapshots.provider, portfolioSnapshots.snapshotDate],
    set: {
      valueUsd: sql`excluded.value_usd`,
      costUsd: sql`excluded.cost_usd`,
      pnlUsd: sql`excluded.pnl_usd`,
      source: sql`excluded.source`,
      updatedAt: sql`excluded.updated_at`,
    },
  });
}

/** Records every connected account's saved balances (not only those counted in net worth). */
export async function recordPortfolio(): Promise<void> {
  const [fx, rows] = await Promise.all([
    loadFxTable(),
    getDb().select({ provider: accountConnections.provider, snapshot: accountConnections.snapshot }).from(accountConnections),
  ]);
  const connections = rows.map((r) => ({ provider: r.provider, snapshot: r.provider === "binance" && r.snapshot ? normalizeBinanceSnapshot(r.snapshot) : r.snapshot }));
  const binance = connections.find((c) => c.provider === "binance")?.snapshot ?? null;
  await savePortfolioRows(portfolioRows(connections, fx, binance ? await loadBinanceHoldingCosts(binance) : []));
}

/** For after() and the cron: a history failure must never break the request that triggered it. */
export async function recordPortfolioQuietly(): Promise<void> {
  try {
    await recordPortfolio();
  } catch (err) {
    console.error("[admin] portfolio snapshot failed", err);
  }
}

/**
 * IBKR's reported daily NAV fills the days before balances were recorded. It never replaces a recorded day,
 * so the chart keeps one way of valuing each day. Returns how many days were added.
 */
export async function saveIbkrNav(points: readonly NavPoint[]): Promise<number> {
  if (!points.length) return 0;
  const days = navTotals(points, await loadFxTable());
  if (!days.length) return 0;
  const added = await getDb().insert(portfolioSnapshots)
    .values(days.map((d) => ({ provider: "ibkr" as const, snapshotDate: d.date, valueUsd: round2(d.valueUsd), source: "nav" as const })))
    .onConflictDoNothing()
    .returning({ date: portfolioSnapshots.snapshotDate });
  return added.length;
}
