/*
 * Connection constants, view types and display helpers. Free of zod and server code, so client components
 * import from here; the validation schemas live in ./types (server side), which re-exports all of this.
 */
import { removeBinanceEarnReceipts } from "./binance-positions";
import type { ConnectedPosition, ConnectionSnapshot } from "./types";

/** Where imported activity comes from. Wise, MariBank and GoTyme arrive only as uploaded statements. */
export const PROVIDERS = ["wise", "binance", "ibkr", "maribank", "hyperliquid", "gotyme"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** Bank accounts: their activity is everyday income and spending, never investment bookkeeping. */
export const BANK_PROVIDERS: readonly Provider[] = ["wise", "maribank", "gotyme"];
export const isBank = (provider: Provider) => BANK_PROVIDERS.includes(provider);

/** Accounts that sync through an API. Wise personal tokens cannot, so Wise is not one of them. */
export const SYNC_PROVIDERS = ["binance", "ibkr", "hyperliquid"] as const;
export type SyncProvider = (typeof SYNC_PROVIDERS)[number];

export const PROVIDER_META = {
  wise: {
    name: "Wise",
    description: "Transactions from the balance statement CSVs you download from Wise.",
    scope: "Statement CSV import",
    docs: "https://wise.com/help/articles/2736049/how-do-i-get-a-statement",
  },
  maribank: {
    name: "MariBank",
    description: "Transactions from the monthly statement PDFs in the MariBank app.",
    scope: "Statement PDF import",
  },
  gotyme: {
    name: "GoTyme",
    description: "Transactions from the statement PDFs you request in the GoTyme app.",
    scope: "Statement PDF import",
  },
  binance: {
    name: "Binance",
    description: "Spot wallet plus Simple Earn Flexible and Locked positions.",
    scope: "Spot + Simple Earn",
    docs: "https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/account",
  },
  ibkr: {
    name: "IBKR",
    description: "Holdings and cash from your latest daily Flex statement.",
    scope: "Daily statement · not live quotes",
    docs: "https://www.interactivebrokers.com/docs/web-api/flex-web-service/client-portal-configuration/create-a-flex-query",
  },
  hyperliquid: {
    name: "Hyperliquid",
    description: "Spot, perps, staking, lending and vaults for one wallet address.",
    scope: "Wallet address · read only",
    docs: "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint",
  },
} as const;

/** How long new credentials stay valid, like IBKR's "Should Expire After" list (6 hours to 1 year). */
export const CREDENTIAL_LIFETIMES = [
  { days: 7, label: "1 week" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
] as const;
/** Safe page/export representation. Credentials and sync leases never leave the server. */
export interface ConnectionView {
  provider: SyncProvider;
  enabled: boolean;
  includeInNetWorth: boolean;
  snapshot: ConnectionSnapshot | null;
  lastAttemptAt: Date | null;
  lastSyncedAt: Date | null;
  error: string | null;
  syncing: boolean;
  credentialsExpireOn: string | null;
  historySyncedAt: Date | null;
  historyError: string | null;
  historyCoverage: import("../imports/types").HistoryCoverage | null;
}

export interface SyncResult {
  provider: SyncProvider;
  ok: boolean;
  message: string;
}

/** Only these errors may be shown to the user; raw errors can contain credentials. */
export class ConnectionError extends Error {}

export function includedPositions(connections: readonly (Pick<ConnectionView, "includeInNetWorth" | "snapshot"> & Partial<Pick<ConnectionView, "provider">>)[]): ConnectedPosition[] {
  return connections.filter((c) => c.includeInNetWorth).flatMap((c) => {
    const positions = c.snapshot?.positions ?? [];
    return c.provider === "binance" ? removeBinanceEarnReceipts(positions) : positions;
  });
}

/** A saved sync error in everyday words: what happened and what to do, without status codes. */
export function plainSyncError(name: string, error: string): string {
  const status = error.match(/returned HTTP (\d{3})/)?.[1];
  if (status) {
    return status.startsWith("5")
      ? `${name} is having trouble right now. Try again later.`
      : `${name} rejected the last sync, usually because its key expired or changed. Reconnect with a new key to fix it.`;
  }
  return error.replace(/\b(the account provider|the provider|this provider)\b/gi, name);
}

/** Syncing again can't fix these: the account needs new credentials. */
export function needsNewCredentials(error: string) {
  return /returned HTTP 4\d\d|access was denied/i.test(error);
}

/** Days without so much as an attempt before the daily job counts as stuck, not just late. */
const DAILY_SYNC_GRACE_DAYS = 2;

/** The daily job tries every enabled account, so one left untried for days means the job isn't running. */
export function untriedAccounts<T extends { enabled: boolean; lastAttemptAt: Date | null; lastSyncedAt: Date | null }>(connections: T[], now = new Date()): T[] {
  const cutoff = now.getTime() - DAILY_SYNC_GRACE_DAYS * 86_400_000;
  return connections.filter((c) => {
    const tried = c.lastAttemptAt ?? c.lastSyncedAt;
    return c.enabled && tried != null && tried.getTime() < cutoff;
  });
}

/** An account's state, in the same words on every page. Only "Up to date" and "Paused" need no action. */
export function connectionStatus(connection: { enabled: boolean; syncing?: boolean; error: string | null; historyError: string | null; provider: SyncProvider; snapshot: { asOf: string } | null; lastSyncedAt: Date | null }, now = new Date()) {
  if (connection.syncing) return { label: "Syncing", attention: false };
  if (!connection.enabled) return { label: "Paused", attention: false };
  if (connection.error) return { label: "Sync failed", attention: true };
  if (connection.historyError) return { label: "History failed", attention: true };
  if (isConnectionStale(connection, now)) return { label: "Out of date", attention: true };
  return { label: "Up to date", attention: false };
}

export function isConnectionStale(connection: { provider: SyncProvider; snapshot: { asOf: string } | null; lastSyncedAt: Date | null }, now = new Date()): boolean {
  if (!connection.snapshot || !connection.lastSyncedAt) return true;
  const day = 86_400_000;
  // Daily jobs have a scheduling window; IBKR statements also span weekends/holidays.
  return now.getTime() - connection.lastSyncedAt.getTime() > 36 * 3_600_000 ||
    now.getTime() - Date.parse(connection.snapshot.asOf) > (connection.provider === "ibkr" ? 4 * day : 36 * 3_600_000);
}
