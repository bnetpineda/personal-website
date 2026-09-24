import "server-only";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { accountConnections, investmentSyncs } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { openCredentials } from "../connections/crypto";
import { binanceReader, defaultIO, type ProviderIO } from "../connections/providers";
import { ConnectionError, type ConnectionSnapshot, type Credentials } from "../connections/types";
import { identifier } from "./provider-parsers";
import { fetchHistory } from "./providers";
import { ingestQuery } from "./service";
import { pairSchema, parseSpotPage } from "./spot";
import { readSpotFifo } from "./spot-fifo";
import { ImportError } from "./types";
import { heldUsdtPairs } from "./holding-costs";

export const utcYesterday = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 1).toISOString().slice(0, 10);
export const addUtcDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
export const historySetupSchema = z.object({ from: z.iso.date(), pairs: z.string().max(600) }).transform((v) =>
  ({ ...v, pairs: [...new Set(v.pairs.toUpperCase().split(/[\s,]+/).filter(Boolean))] }))
  .refine((v) => v.from >= "2017-07-14" && v.from <= utcYesterday(), "Choose a start date from July 14, 2017 through yesterday (UTC).")
  .refine((v) => v.pairs.length <= 20 && v.pairs.every((p) => /^[A-Z0-9_]{4,30}$/.test(p)), "Use up to 20 Spot pairs, such as BTCUSDT, separated by commas.");

/** Exchange information is public; Binance rejects extra signed-request parameters here. */
export async function fetchSpotPair(symbol: string, signal: AbortSignal, io: ProviderIO = defaultIO) {
  const url = new URL("https://api.binance.com/api/v3/exchangeInfo");
  url.searchParams.set("symbol", symbol);
  const info = z.object({ symbols: z.array(pairSchema) }).parse(await io.json(url, {}, signal));
  if (info.symbols.length !== 1 || info.symbols[0].symbol !== symbol) throw new ImportError(`Binance could not identify ${symbol}. Check the pair or use an archive export for delisted markets.`);
  return info.symbols[0];
}

type HistoryConnection = { row: { encryptedCredentials: string; snapshot?: ConnectionSnapshot | null }; credentials: Extract<Credentials, { provider: "binance" }> };
async function connection(): Promise<HistoryConnection> {
  const [row] = await getDb().select().from(accountConnections).where(and(eq(accountConnections.provider, "binance"), eq(accountConnections.enabled, true)));
  if (!row) throw new ImportError("Connect and enable Binance in Connections first.");
  try {
    const credentials = openCredentials(row.encryptedCredentials, "binance", env.sessionSecret());
    if (credentials.provider !== "binance") throw new Error();
    return { row, credentials };
  } catch { throw new ImportError("Reconnect Binance to unlock its saved credential."); }
}

export async function startBinanceHistory(input: z.output<typeof historySetupSchema>, io: ProviderIO = defaultIO, loadConnection: () => Promise<HistoryConnection> = connection) {
  const { row, credentials } = await loadConnection();
  const signed = await binanceReader(credentials, AbortSignal.timeout(20_000), io);
  const { uid } = z.object({ uid: identifier }).parse(await signed("/api/v3/account", { omitZeroBalances: "true" }));
  const accountKey = `uid:${uid}`, toDate = utcYesterday();
  // Validate each pair before saving jobs; obsolete pairs fail explicitly, never disappear silently.
  for (const symbol of input.pairs) {
    await fetchSpotPair(symbol, AbortSignal.timeout(10_000), io);
  }
  const values = [{ accountKey, scope: "activity", fromDate: input.from, toDate, cursor: input.from },
    ...input.pairs.map((symbol) => ({ accountKey, scope: `spot:${symbol}`, fromDate: "2017-07-14", toDate, cursor: "0" }))];
  await saveHistoryStreams(values, row.encryptedCredentials);
}

/** Discover supported USDT markets for current coins; other pairs remain explicitly configurable. */
export async function startHeldSpotHistory(io: ProviderIO = defaultIO, loadConnection: () => Promise<HistoryConnection> = connection) {
  const { row, credentials } = await loadConnection();
  if (!row.snapshot?.accountKey) throw new ImportError("Sync Binance balances first to identify the account for trade costs.");
  const signed = await binanceReader(credentials, AbortSignal.timeout(20_000), io);
  const { uid } = z.object({ uid: identifier }).parse(await signed("/api/v3/account", { omitZeroBalances: "true" }));
  const accountKey = `uid:${uid}`;
  if (accountKey !== row.snapshot.accountKey) throw new ImportError("The Binance account changed. Sync balances before importing its trade costs.");
  const tickers = z.array(z.object({ symbol: z.string() })).parse(await io.json(new URL("https://api.binance.com/api/v3/ticker/price"), {}, AbortSignal.timeout(10_000)));
  const selection = heldUsdtPairs(row.snapshot.positions, tickers.map((t) => t.symbol));
  if (!selection.pairs.length) throw new ImportError("No supported USDT Spot pairs were found. Add the pairs you traded in Investment history.");
  const jobs = await saveHistoryStreams(selection.pairs.map((symbol) => ({ accountKey, scope: `spot:${symbol}`, fromDate: "2017-07-14", toDate: utcYesterday(), cursor: "0" })), row.encryptedCredentials);
  return { jobs, skipped: selection.skipped };
}

async function saveHistoryStreams(values: { accountKey: string; scope: string; fromDate: string; toDate: string; cursor: string }[], encryptedCredentials: string) {
  // Upserting an earlier activity start rewinds that stream safely; immutable source IDs deduplicate it.
  const saved = await getDb().execute(sql`with current_connection as materialized (
    select provider from account_connections where provider = 'binance' and enabled and encrypted_credentials = ${encryptedCredentials} for update
  ), incoming as (select * from jsonb_to_recordset(${JSON.stringify(values.map((v) => ({ account_key: v.accountKey, scope: v.scope, from_date: v.fromDate, to_date: v.toDate, cursor: v.cursor })))}::jsonb)
    as x(account_key text, scope text, from_date date, to_date date, cursor text))
    insert into investment_syncs (account_key, scope, from_date, to_date, cursor)
    select account_key, scope, from_date, to_date, cursor from incoming where exists(select 1 from current_connection)
    on conflict (account_key, scope) do update set
      cursor = case when excluded.from_date < investment_syncs.from_date then excluded.cursor else investment_syncs.cursor end,
      completed_at = case when excluded.from_date < investment_syncs.from_date or excluded.to_date > investment_syncs.to_date then null else investment_syncs.completed_at end,
      from_date = least(excluded.from_date, investment_syncs.from_date), to_date = greatest(excluded.to_date, investment_syncs.to_date),
      enabled = true, error = null, lease = null, lease_expires_at = null, updated_at = now() returning id, scope`);
  if (!saved.rows.length) throw new ImportError("The connection changed while configuring history. Retry with the current account.");
  return saved.rows.map((r) => ({ id: String(r.id), scope: String(r.scope), enabled: true }));
}

export async function advanceHistory(id: string, io: ProviderIO = defaultIO, loadConnection: () => Promise<HistoryConnection> = connection) {
  const db = getDb(), lease = crypto.randomUUID(), now = new Date();
  const [job] = await db.update(investmentSyncs).set({ lease, leaseExpiresAt: new Date(now.getTime() + 70_000) })
    .where(and(eq(investmentSyncs.id, id), eq(investmentSyncs.enabled, true), or(isNull(investmentSyncs.leaseExpiresAt), lt(investmentSyncs.leaseExpiresAt, now))))
    .returning();
  if (!job) return { ok: false, message: "This import is paused or already running.", more: false };
  const owns = and(eq(investmentSyncs.id, id), eq(investmentSyncs.lease, lease));
  try {
    const { row, credentials } = await loadConnection();
    let entries, cursor: string, complete: boolean;
    if (job.scope === "activity") {
      if (job.cursor > job.toDate) { await db.update(investmentSyncs).set({ completedAt: now, lease: null, leaseExpiresAt: null }).where(owns); return { ok: true, message: "Activity range already imported.", more: false }; }
      const end = [addUtcDays(job.cursor, 29), job.toDate].sort()[0];
      const result = await fetchHistory(credentials, io, now, { from: job.cursor, to: end }, job.accountKey);
      entries = result.entries; cursor = addUtcDays(end, 1); complete = cursor > job.toDate;
    } else {
      const signal = AbortSignal.timeout(45_000), signed = await binanceReader(credentials, signal, io);
      const { uid } = z.object({ uid: identifier }).parse(await signed("/api/v3/account", { omitZeroBalances: "true" }));
      if (`uid:${uid}` !== job.accountKey) throw new ImportError("The Binance account changed. Start a new history import for this account.");
      const symbol = job.scope.slice(5);
      const pair = await fetchSpotPair(symbol, signal, io);
      const result = parseSpotPage(await signed("/api/v3/myTrades", { symbol, fromId: job.cursor, limit: "1000" }), pair, job.accountKey, job.cursor);
      entries = result.entries; cursor = result.cursor; complete = result.complete;
    }
    const guard = sql`select j.id from investment_syncs j join account_connections c on c.provider = 'binance'
      where j.id = ${id}::uuid and j.lease = ${lease}::uuid and j.enabled and c.enabled and c.encrypted_credentials = ${row.encryptedCredentials} for update of j, c`;
    const [saved, updated] = await db.batch([
      db.execute(ingestQuery(entries, guard)),
      db.execute(sql`update investment_syncs set cursor = ${cursor}, completed_at = ${complete ? new Date().toISOString() : null}::timestamptz,
        last_synced_at = now(), error = null, lease = null, lease_expires_at = null, updated_at = now()
        where id = ${id}::uuid and lease = ${lease}::uuid and enabled and exists(select 1 from account_connections where provider = 'binance' and enabled and encrypted_credentials = ${row.encryptedCredentials}) returning id`),
    ]);
    if (!saved.rows[0]?.active || !updated.rows.length) throw new ImportError("The connection or import changed. Retry from the saved cursor.");
    try {
      await readSpotFifo(job.accountKey, null);
    } catch (error) {
      console.error("[admin] spot fifo refresh failed", error);
    }
    return { ok: true, message: `Saved ${Number(saved.rows[0].inserted)} new history entries.${complete ? " This stream is caught up to the available data." : " More history is ready to import."}`, more: !complete };
  } catch (error) {
    const message = error instanceof ImportError || error instanceof ConnectionError ? error.message : "History import failed. Check provider access and report data, then retry. Saved progress was kept.";
    await db.update(investmentSyncs).set({ error: message, lease: null, leaseExpiresAt: null }).where(owns);
    return { ok: false, message, more: false };
  }
}

/** Fair, bounded background progress; each configured pair gets an opportunity on daily runs. */
export async function syncInvestmentHistory() {
  const jobs = await getDb().select({ id: investmentSyncs.id }).from(investmentSyncs)
    .where(and(eq(investmentSyncs.enabled, true), or(isNull(investmentSyncs.completedAt), sql`${investmentSyncs.scope} like 'spot:%'`)))
    .orderBy(asc(investmentSyncs.updatedAt)).limit(21);
  const deadline = Date.now() + 180_000, results = [];
  for (let i = 0; i < jobs.length && Date.now() < deadline; i += 3) {
    results.push(...await Promise.allSettled(jobs.slice(i, i + 3).map((job) => advanceHistory(job.id))));
  }
  return results.map((r) => r.status === "fulfilled" ? r.value : { ok: false, message: "Background history import could not finish; saved progress was kept." });
}
