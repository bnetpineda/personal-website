import { z } from "zod";
import { ASSET_CLASSES } from "../constants";
import { removeBinanceEarnReceipts } from "./binance-positions";

/** Where imported activity comes from. Wise and MariBank arrive only as uploaded statements. */
export const PROVIDERS = ["wise", "binance", "ibkr", "maribank", "hyperliquid"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof providerSchema>;

/** Bank accounts: their activity is everyday income and spending, never investment bookkeeping. */
export const BANK_PROVIDERS: readonly Provider[] = ["wise", "maribank"];
export const isBank = (provider: Provider) => BANK_PROVIDERS.includes(provider);

/** Accounts that sync through an API. Wise personal tokens cannot, so Wise is not one of them. */
export const SYNC_PROVIDERS = ["binance", "ibkr", "hyperliquid"] as const;
export const syncProviderSchema = z.enum(SYNC_PROVIDERS);
export type SyncProvider = z.infer<typeof syncProviderSchema>;

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
/** The connect form's expiry choice: "none", or days from today until the credentials expire. */
export const expireAfterSchema = z.union([z.literal("none"), z.coerce.number().int().min(1).max(365)]);

const secret = z.string().trim().min(8, "Enter a valid credential").max(4096);
const numericId = z.string().trim().regex(/^\d{1,30}$/, "Use the numeric ID from your account");
export const credentialsSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("binance"), apiKey: secret, apiSecret: secret }),
  // One query serves balances and history; an older saved history query ID is dropped.
  z.object({ provider: z.literal("ibkr"), token: secret, queryId: numericId }),
  // An address only reads public account data and never expires. It can't move funds.
  z.object({ provider: z.literal("hyperliquid"), address: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, "Enter a wallet address: 0x and 40 letters or numbers").toLowerCase() }),
]);
export type Credentials = z.infer<typeof credentialsSchema>;

export const connectedPositionSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
  symbol: z.string().max(100),
  assetClass: z.enum(ASSET_CLASSES),
  currency: z.string().regex(/^[A-Z]{3}$/),
  quantity: z.number().finite(),
  /** Signed market value, including the contract multiplier when applicable. */
  marketValue: z.number().finite().nullable(),
  /** null means the provider did not supply a reliable cost basis. */
  costBasis: z.number().finite().nullable(),
});
export type ConnectedPosition = z.infer<typeof connectedPositionSchema>;

export const snapshotSchema = z.object({
  asOf: z.iso.datetime(),
  /** Provider identity binds imported trade costs to this account, including after reconnecting. */
  accountKey: z.string().min(1).max(100).optional(),
  /** USD per USDT used for this snapshot, so trade P/L uses the same valuation rate. */
  usdtUsd: z.number().finite().positive().optional(),
  positions: z.array(connectedPositionSchema).max(10000),
  warnings: z.array(z.string().max(300)).max(20),
}).superRefine(({ positions }, ctx) => {
  if (new Set(positions.map((p) => p.id)).size !== positions.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate positions in account response" });
  }
});
export type ConnectionSnapshot = z.infer<typeof snapshotSchema>;

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
