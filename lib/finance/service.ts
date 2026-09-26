import "server-only";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountConnections, cashFlows, fxRates, netWorthSnapshots, recurringCashFlows, statementBalances } from "@/lib/db/schema";
import { includedPositions } from "./connections/types";
import { statementPositions } from "./statement-balances";
import { computeNetWorth, fxToPhp, round2, type FxTable, type NetWorth } from "./calc";
import { BASE_CURRENCY } from "./constants";
import { addDays, todayManila } from "./dates";
import { nextOccurrence, occurrencesBetween, scheduleOf } from "./recurrence";
import { fetchFxRate } from "./prices";

/*
 * FX/snapshot operations. No auth check here: this is shared by the cron route
 * (CRON_SECRET) and by Server Actions (which call requireAdmin() before using it).
 */

export interface RefreshFailure {
  name: string;
  reason: string;
}

export interface RefreshSummary {
  fxUpdated: number;
  failed: RefreshFailure[];
  at: string;
}

const reason = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");

export async function loadFxTable(): Promise<FxTable> {
  const rows = await getDb().select().from(fxRates);
  return Object.fromEntries(rows.map((r) => [r.currency, r.rateToPhp]));
}

export async function refreshFxRates(currencies: Iterable<string>): Promise<{ updated: string[]; failed: RefreshFailure[] }> {
  const list = [...new Set(currencies)].filter((c) => c !== BASE_CURRENCY);
  const results = await Promise.allSettled(list.map((c) => fetchFxRate(c)));
  const updated: string[] = [];
  const failed: RefreshFailure[] = [];
  const db = getDb();

  await Promise.all(
    results.map(async (r, i) => {
      const currency = list[i];
      if (r.status === "rejected") {
        failed.push({ name: `FX ${currency}`, reason: reason(r.reason) });
        return;
      }
      await db
        .insert(fxRates)
        .values({ currency, rateToPhp: r.value.rate, asOf: r.value.asOf, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: fxRates.currency,
          set: { rateToPhp: r.value.rate, asOf: r.value.asOf, updatedAt: new Date() },
        });
      updated.push(currency);
    })
  );
  return { updated, failed };
}

/** FX table guaranteed to contain `currencies` (fetches only the missing ones). */
export async function ensureFx(currencies: string[]): Promise<FxTable> {
  const fx = await loadFxTable();
  const missing = currencies.filter((c) => c !== BASE_CURRENCY && fx[c] == null);
  if (missing.length === 0) return fx;
  await refreshFxRates(missing);
  return loadFxTable();
}

/** Refreshes FX for every currency the synced accounts and recurring items use, then records today's net worth. */
export async function refreshRates(): Promise<RefreshSummary> {
  const db = getDb();
  const [connections, recurring, balances] = await Promise.all([
    db.select({ snapshot: accountConnections.snapshot }).from(accountConnections),
    db.selectDistinct({ currency: recurringCashFlows.currency }).from(recurringCashFlows),
    db.selectDistinct({ currency: statementBalances.currency }).from(statementBalances),
  ]);
  const fx = await refreshFxRates([
    ...connections.flatMap((c) => c.snapshot?.positions.map((p) => p.currency) ?? []),
    ...recurring.map((r) => r.currency),
    ...balances.map((b) => b.currency),
  ]);
  await upsertTodaySnapshot();
  return { fxUpdated: fx.updated.length, failed: fx.failed, at: new Date().toISOString() };
}

/** Net worth is what the synced accounts hold (those included in net worth) plus bank statement balances. */
export async function currentNetWorth(): Promise<NetWorth & { empty: boolean }> {
  const db = getDb();
  const [fx, connections, balances] = await Promise.all([
    loadFxTable(),
    db.select({ provider: accountConnections.provider, includeInNetWorth: accountConnections.includeInNetWorth, snapshot: accountConnections.snapshot }).from(accountConnections),
    db.select().from(statementBalances),
  ]);
  return {
    ...computeNetWorth([], [], fx, [...includedPositions(connections), ...statementPositions(balances)]),
    empty: !connections.some((c) => c.includeInNetWorth && c.snapshot) && !balances.length,
  };
}

/** Upserts today's (Manila date) net-worth point. Safe to run repeatedly. */
export async function upsertTodaySnapshot(): Promise<void> {
  const nw = await currentNetWorth();
  if (nw.empty) return;
  const values = {
    assetsPhp: nw.assetsPhp,
    liabilitiesPhp: nw.liabilitiesPhp,
    netWorthPhp: nw.netWorthPhp,
    investedPhp: nw.investedPhp,
    byClass: nw.byClass,
    updatedAt: new Date(),
  };
  await getDb()
    .insert(netWorthSnapshots)
    .values({ snapshotDate: todayManila(), ...values })
    .onConflictDoUpdate({ target: netWorthSnapshots.snapshotDate, set: values });
}

/** Creates today's snapshot only if the daily cron hasn't yet. */
export async function ensureTodaySnapshot(): Promise<void> {
  const existing = await getDb()
    .select({ date: netWorthSnapshots.snapshotDate })
    .from(netWorthSnapshots)
    .where(eq(netWorthSnapshots.snapshotDate, todayManila()))
    .limit(1);
  if (existing.length === 0) await upsertTodaySnapshot();
}

/** For after(): snapshot failures must never break a request. */
export async function snapshotQuietly(): Promise<void> {
  try {
    await upsertTodaySnapshot();
  } catch (err) {
    console.error("[admin] net-worth snapshot failed", err);
  }
}

/* ---------- recurring income / expenses ---------- */

export interface RecurringRunSummary {
  posted: number;
  failed: RefreshFailure[];
}

/**
 * Posts every auto-post occurrence due up to `today` (Manila) and advances each item's
 * cursor. Idempotent: the (recurring_id, recurring_on) unique index swallows overlaps and
 * the cursor update only applies if nobody moved it first. Entries deleted later stay deleted.
 */
export async function postDueRecurring(today: string = todayManila()): Promise<RecurringRunSummary> {
  const db = getDb();
  const due = await db
    .select()
    .from(recurringCashFlows)
    .where(
      and(
        eq(recurringCashFlows.autoPost, true),
        eq(recurringCashFlows.paused, false),
        isNotNull(recurringCashFlows.nextOn),
        lte(recurringCashFlows.nextOn, today)
      )
    );
  if (due.length === 0) return { posted: 0, failed: [] };

  let fx: FxTable = {};
  try {
    fx = await ensureFx([...new Set(due.map((r) => r.currency))]);
  } catch {
    // Non-PHP items fail below and retry on the next run.
  }

  const failed: RefreshFailure[] = [];
  const entries: (typeof cashFlows.$inferInsert)[] = [];
  const cursors = [];
  for (const r of due) {
    const rate = fxToPhp(fx, r.currency);
    if (rate == null) {
      failed.push({ name: r.description, reason: `No ${r.currency}→PHP rate` });
      continue;
    }
    const s = scheduleOf(r);
    for (const day of occurrencesBetween(s, r.nextOn!, today)) {
      entries.push({
        kind: r.kind,
        occurredOn: day,
        amount: r.amount,
        currency: r.currency,
        amountPhp: round2(r.amount * rate),
        categoryId: r.categoryId,
        description: r.description,
        account: r.account,
        notes: r.notes,
        recurringId: r.id,
        recurringOn: day,
      });
    }
    cursors.push(
      db
        .update(recurringCashFlows)
        .set({ nextOn: nextOccurrence(s, addDays(today, 1)) })
        .where(and(eq(recurringCashFlows.id, r.id), eq(recurringCashFlows.nextOn, r.nextOn!)))
    );
  }
  if (cursors.length === 0) return { posted: 0, failed };

  if (entries.length === 0) {
    const [first, ...rest] = cursors;
    await db.batch([first, ...rest]);
    return { posted: 0, failed };
  }
  // One atomic batch: entries (duplicates skipped) + cursor moves.
  const insert = db.insert(cashFlows).values(entries).onConflictDoNothing().returning({ id: cashFlows.id });
  const [inserted] = await db.batch([insert, ...cursors]);
  return { posted: inserted.length, failed };
}

/** For after(): posting failures must never break a request. */
export async function postDueRecurringQuietly(): Promise<void> {
  try {
    const { failed } = await postDueRecurring();
    if (failed.length > 0) console.warn("[admin] recurring items not posted", failed);
  } catch (err) {
    console.error("[admin] posting recurring items failed", err);
  }
}
