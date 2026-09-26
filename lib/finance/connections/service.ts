import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountConnections } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { openCredentials } from "./crypto";
import { fetchAccountSnapshot } from "./providers";
import { normalizeBinanceSnapshot } from "./binance-positions";
import { ConnectionError, type ConnectionView, type SyncProvider, type SyncResult } from "./types";
import { fetchHistory } from "../imports/providers";
import { ingestEntries } from "../imports/service";
import { ImportError, type HistoryCoverage } from "../imports/types";

/* Shared by authenticated Server Actions/DAL and the secret-protected daily cron. */
export async function loadConnectionViews(): Promise<ConnectionView[]> {
  const rows = await getDb().select({
    provider: accountConnections.provider, enabled: accountConnections.enabled,
    includeInNetWorth: accountConnections.includeInNetWorth, snapshot: accountConnections.snapshot,
    lastAttemptAt: accountConnections.lastAttemptAt, lastSyncedAt: accountConnections.lastSyncedAt,
    error: accountConnections.error, leaseExpiresAt: accountConnections.leaseExpiresAt,
    credentialsExpireOn: accountConnections.credentialsExpireOn, historySyncedAt: accountConnections.historySyncedAt,
    historyError: accountConnections.historyError, historyCoverage: accountConnections.historyCoverage,
  }).from(accountConnections).orderBy(accountConnections.provider);
  const now = Date.now();
  return rows.map(({ leaseExpiresAt, ...row }) => ({ ...row,
    snapshot: row.provider === "binance" && row.snapshot ? normalizeBinanceSnapshot(row.snapshot) : row.snapshot,
    syncing: leaseExpiresAt != null && leaseExpiresAt.getTime() > now,
  }));
}

export async function syncAccount(provider: SyncProvider): Promise<SyncResult> {
  const db = getDb();
  const lease = randomUUID();
  const now = new Date();
  // Atomic lease + cooldown: a cron run and repeated clicks cannot overwrite each other.
  const [connection] = await db.update(accountConnections).set({
    syncLease: lease, leaseExpiresAt: new Date(now.getTime() + 120_000), lastAttemptAt: now,
  }).where(and(
    eq(accountConnections.provider, provider), eq(accountConnections.enabled, true),
    or(isNull(accountConnections.leaseExpiresAt), lt(accountConnections.leaseExpiresAt, now)),
    or(isNull(accountConnections.lastAttemptAt), lt(accountConnections.lastAttemptAt, new Date(now.getTime() - 60_000))),
  )).returning({ encryptedCredentials: accountConnections.encryptedCredentials, snapshot: accountConnections.snapshot });

  if (!connection) return { provider, ok: false, message: "Sync unavailable: connect or resume this account, or wait a minute after the last attempt." };
  const ownsLease = and(eq(accountConnections.provider, provider), eq(accountConnections.syncLease, lease));
  try {
    let credentials;
    try {
      credentials = openCredentials(connection.encryptedCredentials, provider, env.sessionSecret());
    } catch {
      throw new ConnectionError("The saved credential could not be unlocked. Reconnect this account.");
    }
    const snapshot = await fetchAccountSnapshot(credentials);
    if (connection.snapshot && snapshot.asOf < connection.snapshot.asOf) {
      throw new ConnectionError("The provider returned an older report. The newer saved balances were kept.");
    }
    let historyError: string | null = null;
    let historyCoverage: HistoryCoverage | undefined;
    try {
      const history = await fetchHistory(credentials);
      await ingestEntries(history.entries, { provider, id: lease });
      historyCoverage = history.coverage;
    } catch (error) {
      historyError = error instanceof ImportError || error instanceof ConnectionError ? error.message : "Transaction history could not sync. Check report fields and retry; earlier imports were kept.";
    }
    const updated = await db.update(accountConnections).set({
      snapshot, lastSyncedAt: new Date(), error: null, syncLease: null, leaseExpiresAt: null,
      historyError, ...(historyCoverage ? { historyCoverage, historySyncedAt: new Date() } : {}),
    }).where(ownsLease).returning({ provider: accountConnections.provider });
    if (updated.length === 0) return { provider, ok: false, message: "The connection changed during sync. Run sync again." };
    return { provider, ok: !historyError, message: historyError ? `Balances updated. ${historyError}` : "Balances and available history updated." };
  } catch (error) {
    // Never return/log provider bodies, fetch errors, XML, credentials, or request URLs.
    const message = error instanceof ConnectionError ? error.message : "Sync failed. Check the account setup and report fields, then retry. Previous balances were kept.";
    await db.update(accountConnections).set({ error: message, syncLease: null, leaseExpiresAt: null }).where(ownsLease);
    return { provider, ok: false, message };
  }
}

export async function syncAllAccounts(): Promise<SyncResult[]> {
  const rows = await getDb().select({ provider: accountConnections.provider }).from(accountConnections).where(eq(accountConnections.enabled, true));
  const results = await Promise.allSettled(rows.map((row) => syncAccount(row.provider)));
  return results.map((result, index) => result.status === "fulfilled" ? result.value : {
    provider: rows[index].provider, ok: false, message: "Sync could not be saved. Try again later.",
  });
}
