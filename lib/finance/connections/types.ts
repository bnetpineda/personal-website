import { z } from "zod";
import { ASSET_CLASSES } from "../constants";
import { PROVIDERS, SYNC_PROVIDERS } from "./meta";

/* Validation schemas for connections. Client components import ./meta instead, which keeps zod out of the browser. */
export * from "./meta";

export const providerSchema = z.enum(PROVIDERS);
export const syncProviderSchema = z.enum(SYNC_PROVIDERS);

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

