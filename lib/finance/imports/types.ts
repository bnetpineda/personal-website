import { z } from "zod";
import { providerSchema } from "../connections/types";

export const ENTRY_KINDS = ["payment", "transfer", "reward", "dividend", "interest", "fee", "tax", "trade", "other"] as const;
export type EntryKind = typeof ENTRY_KINDS[number];
export const ENTRY_STATUSES = ["pending", "posted", "ignored", "transfer", "reviewed"] as const;
export type EntryStatus = typeof ENTRY_STATUSES[number];
export const CATEGORIZED_BY = ["ai", "rule", "manual"] as const;
export type CategorizedBy = typeof CATEGORIZED_BY[number];
/** The AI decision behind a pending entry's prefilled review, kept separately from its human-readable reason. */
export type AiSuggestion = "post" | "transfer" | "investment" | "ignore";
export const spotTradeSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9_]{4,30}$/),
  baseAsset: z.string().regex(/^[A-Z0-9_]{2,30}$/), quoteAsset: z.string().regex(/^[A-Z0-9_]{2,30}$/),
  side: z.enum(["BUY", "SELL"]), quantity: z.number().finite().positive(), quoteQuantity: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative(), commission: z.number().finite().nonnegative(),
  commissionAsset: z.string().regex(/^[A-Z0-9_]{2,30}$/), executedAt: z.iso.datetime(),
});
export type SpotTrade = z.infer<typeof spotTradeSchema>;
export const importEntrySchema = z.object({
  provider: providerSchema,
  accountKey: z.string().min(1).max(100),
  externalId: z.string().min(1).max(250),
  occurredOn: z.iso.date(),
  kind: z.enum(ENTRY_KINDS),
  amount: z.number().finite().min(-999_999_999_999).max(999_999_999_999),
  currency: z.string().regex(/^[A-Z0-9_]{2,30}$/),
  description: z.string().min(1).max(200),
  realizedPnl: z.number().finite().nullable().default(null),
  trade: spotTradeSchema.nullable().optional(),
}).refine((r) => r.amount !== 0 || r.kind === "trade", "Empty transaction amount");
export type ImportEntry = z.output<typeof importEntrySchema>;
export interface HistoryCoverage { from: string; to: string; description: string }
export interface HistoryImport { entries: ImportEntry[]; coverage: HistoryCoverage; accounts?: string[] }
export class ImportError extends Error {}

export function sourceKey(r: Pick<ImportEntry, "provider" | "accountKey" | "externalId">) {
  return JSON.stringify([r.provider, r.accountKey, r.externalId]);
}

/** Fail changed source records rather than silently rewriting reviewed financial history. */
export function uniqueEntries(entries: ImportEntry[]): ImportEntry[] {
  const found = new Map<string, ImportEntry>();
  for (const entry of entries) {
    const row = importEntrySchema.parse(entry);
    const key = sourceKey(row);
    const previous = found.get(key);
    if (previous && !sameSource(previous, row)) throw new ImportError("Conflicting records share a transaction ID. Import a consistent statement.");
    found.set(key, row);
  }
  return [...found.values()];
}
export function sameSource(a: ImportEntry, b: ImportEntry) {
  const canonicalTrade = (trade: ImportEntry["trade"]) => trade ? JSON.stringify(spotTradeSchema.parse(trade)) : "null";
  return a.amount === b.amount && a.currency === b.currency && a.occurredOn === b.occurredOn && a.kind === b.kind && a.realizedPnl === b.realizedPnl && canonicalTrade(a.trade) === canonicalTrade(b.trade);
}
