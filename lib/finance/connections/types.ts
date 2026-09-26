import { z } from "zod";
import { ASSET_CLASSES } from "../constants";
import { removeBinanceEarnReceipts } from "./binance-positions";

/** Where imported activity comes from. Wise arrives only as statement CSVs. */
export const PROVIDERS = ["wise", "binance", "ibkr"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof providerSchema>;

/** Accounts that sync through an API. Wise personal tokens cannot, so Wise is not one of them. */
export const SYNC_PROVIDERS = ["binance", "ibkr"] as const;
export const syncProviderSchema = z.enum(SYNC_PROVIDERS);
export type SyncProvider = z.infer<typeof syncProviderSchema>;

export const PROVIDER_META = {
  wise: {
    name: "Wise",
    description: "Transactions from the balance statement CSVs you download from Wise.",
    scope: "Statement CSV import",
    docs: "https://wise.com/help/articles/2736049/how-do-i-get-a-statement",
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
} as const;

const secret = z.string().trim().min(8, "Enter a valid credential").max(4096);
const numericId = z.string().trim().regex(/^\d{1,30}$/, "Use the numeric ID from your account");
export const credentialsSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("binance"), apiKey: secret, apiSecret: secret }),
  z.object({ provider: z.literal("ibkr"), token: secret, queryId: numericId,
    historyQueryId: z.preprocess((v) => v === "" ? undefined : v, numericId.optional()) }),
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

export function isConnectionStale(connection: { provider: SyncProvider; snapshot: { asOf: string } | null; lastSyncedAt: Date | null }, now = new Date()): boolean {
  if (!connection.snapshot || !connection.lastSyncedAt) return true;
  const day = 86_400_000;
  // Daily jobs have a scheduling window; IBKR statements also span weekends/holidays.
  return now.getTime() - connection.lastSyncedAt.getTime() > 36 * 3_600_000 ||
    now.getTime() - Date.parse(connection.snapshot.asOf) > (connection.provider === "ibkr" ? 4 * day : 36 * 3_600_000);
}
