import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountConnections, cashFlows, fxRateHistory, fxRates, holdings, liabilities, netWorthSnapshots, recurringCashFlows, statementBalances } from "@/lib/db/schema";
import { includedPositions } from "./connections/types";
import { statementPositions } from "./statement-balances";
import { computeNetWorth, fxToPhp, round2, type FxTable, type NetWorth } from "./calc";
import { BASE_CURRENCY } from "./constants";
import { addDays, todayManila } from "./dates";
import { datedPairs, LOOKBACK_DAYS, missingRanges, rateKey, rateOn, ratesToFetch, type WantedRate } from "./fx-history";
import { dueThrough, scheduleOf } from "./recurrence";
import { fetchFxRate, fetchFxRates } from "./prices";

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

/** FX table guaranteed to contain `currencies`: fetches missing rates and refreshes stale ones (a failed refresh keeps the old rate). */
export async function ensureFx(currencies: string[], now: Date = new Date()): Promise<FxTable> {
  const rows = await getDb().select().from(fxRates);
  const fetch = ratesToFetch(currencies, rows, now);
  if (fetch.length === 0) return Object.fromEntries(rows.map((r) => [r.currency, r.rateToPhp]));
  await refreshFxRates(fetch);
  return loadFxTable();
}

/**
 * PHP per unit for each (currency, day): entries convert at their own date's rate. Recent days use the
 * current rate; older days use the provider's rate for that day (saved for next time). When a dated rate
 * can't be had, the current rate stands in, so posting never waits on history.
 */
export async function phpRatesOn(wanted: readonly WantedRate[], today: string = todayManila()): Promise<(currency: string, on: string) => number | null> {
  let fx: FxTable = {};
  try {
    fx = await ensureFx([...new Set(wanted.map((w) => w.currency))]);
  } catch {
    // Callers report the currencies left without a rate.
  }
  const dated = new Map<string, number>();
  const pairs = datedPairs(wanted, today);
  if (pairs.length) {
    try {
      const db = getDb();
      const currencies = [...new Set(pairs.map((p) => p.currency))];
      const days = pairs.map((p) => p.on).sort();
      const load = () => db.select({ currency: fxRateHistory.currency, on: fxRateHistory.on, rate: fxRateHistory.rateToPhp }).from(fxRateHistory).where(and(inArray(fxRateHistory.currency, currencies),
        gte(fxRateHistory.on, addDays(days[0], -LOOKBACK_DAYS)), lte(fxRateHistory.on, days[days.length - 1])));
      let history = await load();
      const ranges = missingRanges(pairs, history);
      if (ranges.size) {
        const fetched = await Promise.allSettled([...ranges].map(async ([currency, { from, to }]) =>
          (await fetchFxRates(currency, from, to)).map((r) => ({ currency, on: r.on, rateToPhp: r.rate }))));
        const rows = fetched.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
        for (let i = 0; i < rows.length; i += 1000) {
          await db.insert(fxRateHistory).values(rows.slice(i, i + 1000)).onConflictDoUpdate({
            target: [fxRateHistory.currency, fxRateHistory.on], set: { rateToPhp: sql`excluded.rate_to_php` } });
        }
        if (rows.length) history = await load();
      }
      for (const p of pairs) {
        const rate = rateOn(history, p.currency, p.on);
        if (rate != null) dated.set(rateKey(p.currency, p.on), rate);
      }
    } catch (err) {
      console.error("[admin] dated FX lookup failed; using current rates", err);
    }
  }
  return (currency, on) => dated.get(rateKey(currency, on)) ?? fxToPhp(fx, currency);
}

/** Refreshes every saved FX rate plus every currency the accounts and recurring items use, then records today's net worth. */
export async function refreshRates(): Promise<RefreshSummary> {
  const db = getDb();
  const [connections, recurring, balances, manual, debts, saved] = await Promise.all([
    db.select({ snapshot: accountConnections.snapshot }).from(accountConnections),
    db.selectDistinct({ currency: recurringCashFlows.currency }).from(recurringCashFlows),
    db.selectDistinct({ currency: statementBalances.currency }).from(statementBalances),
    db.selectDistinct({ currency: holdings.currency }).from(holdings),
    db.selectDistinct({ currency: liabilities.currency }).from(liabilities),
    // Rates fetched once for a one-off entry (a JPY expense) must not freeze at that day's value.
    db.select({ currency: fxRates.currency }).from(fxRates),
  ]);
  const fx = await refreshFxRates([
    ...connections.flatMap((c) => c.snapshot?.positions.map((p) => p.currency) ?? []),
    ...recurring.map((r) => r.currency),
    ...balances.map((b) => b.currency),
    ...manual.map((h) => h.currency),
    ...debts.map((l) => l.currency),
    ...saved.map((r) => r.currency),
  ]);
  await upsertTodaySnapshot();
  return { fxUpdated: fx.updated.length, failed: fx.failed, at: new Date().toISOString() };
}

/**
 * Net worth is what the synced accounts hold (those included in net worth), bank statement balances and
 * manual accounts, minus debts. Archived manual accounts and debts are left out.
 */
export async function currentNetWorth(): Promise<NetWorth & { empty: boolean }> {
  const db = getDb();
  const [fx, connections, balances, manual, debts] = await Promise.all([
    loadFxTable(),
    db.select({ provider: accountConnections.provider, includeInNetWorth: accountConnections.includeInNetWorth, snapshot: accountConnections.snapshot }).from(accountConnections),
    db.select().from(statementBalances),
    db.select().from(holdings).where(eq(holdings.archived, false)),
    db.select().from(liabilities).where(eq(liabilities.archived, false)),
  ]);
  return {
    ...computeNetWorth(manual, debts, fx, [...includedPositions(connections), ...statementPositions(balances)]),
    empty: !connections.some((c) => c.includeInNetWorth && c.snapshot) && !balances.length && !manual.length && !debts.length,
  };
}

/** Upserts today's (Manila date) net-worth point. Safe to run repeatedly. */
export async function upsertTodaySnapshot(): Promise<void> {
  const nw = await currentNetWorth();
  // A currency without a rate would be left out of the total and show as a fake drop; keep the last good point.
  if (nw.empty || nw.missingFx.length > 0) return;
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
  const total: RecurringRunSummary = { posted: 0, failed: [] };
  // A very old schedule can owe more than one capped batch; each pass resumes where the last stopped.
  for (let pass = 0; pass < 20; pass++) {
    const run = await postDueRecurringOnce(today);
    total.posted += run.posted;
    if (!run.more) return { posted: total.posted, failed: run.failed };
  }
  return total;
}

/** The guarded cursor move for a recurring item: applies only if nobody moved the cursor first. */
export function moveRecurringCursor(row: { id: string; nextOn: string | null; handledOn: readonly string[] }, next: { nextOn: string | null; handledOn: string[] }) {
  const t = recurringCashFlows;
  return getDb().update(t).set(next).where(and(eq(t.id, row.id),
    row.nextOn == null ? isNull(t.nextOn) : eq(t.nextOn, row.nextOn),
    sql`array_to_string(${t.handledOn}, ',') = ${row.handledOn.join(",")}`));
}

async function postDueRecurringOnce(today: string): Promise<RecurringRunSummary & { more: boolean }> {
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
  if (due.length === 0) return { posted: 0, failed: [], more: false };

  const plans = due.map((r) => ({ r, ...dueThrough(scheduleOf(r), r, today) }));
  // Each occurrence converts at its own date's rate (the current one for recent days).
  const rateOf = await phpRatesOn(plans.flatMap((p) => p.days.map((on) => ({ currency: p.r.currency, on }))), today);

  const failed: RefreshFailure[] = [];
  const entries: (typeof cashFlows.$inferInsert)[] = [];
  const cursors = [];
  let more = false;
  for (const { r, days, nextOn, more: capped } of plans) {
    const rates = days.map((day) => rateOf(r.currency, day));
    if (rates.some((rate) => rate == null)) {
      failed.push({ name: r.description, reason: `No ${r.currency}→PHP rate` });
      continue;
    }
    days.forEach((day, i) => entries.push({
      kind: r.kind,
      occurredOn: day,
      amount: r.amount,
      currency: r.currency,
      amountPhp: round2(r.amount * rates[i]!),
      categoryId: r.categoryId,
      description: r.description,
      account: r.account,
      notes: r.notes,
      recurringId: r.id,
      recurringOn: day,
    }));
    more ||= capped;
    cursors.push(moveRecurringCursor(r, { nextOn, handledOn: [] }));
  }
  if (cursors.length === 0) return { posted: 0, failed, more: false };

  if (entries.length === 0) {
    const [first, ...rest] = cursors;
    await db.batch([first, ...rest]);
    return { posted: 0, failed, more };
  }
  // One atomic batch: entries (duplicates skipped) + cursor moves.
  const insert = db.insert(cashFlows).values(entries).onConflictDoNothing().returning({ id: cashFlows.id });
  const [inserted] = await db.batch([insert, ...cursors]);
  return { posted: inserted.length, failed, more };
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
