import { z } from "zod";
import { todayManila } from "../dates";
import { identifier, numeric } from "./provider-parsers";
import { ImportError, uniqueEntries, type ImportEntry, type SpotTrade } from "./types";

const token = z.string().regex(/^[A-Z0-9_]{2,30}$/);
export const pairSchema = z.object({ symbol: z.string().regex(/^[A-Z0-9_]{4,30}$/), baseAsset: token, quoteAsset: token });
export type SpotPair = z.infer<typeof pairSchema>;
const rowSchema = z.object({ symbol: z.string(), id: identifier.pipe(z.string().regex(/^\d+$/)),
  qty: numeric.pipe(z.number().positive()), quoteQty: numeric.pipe(z.number().nonnegative()),
  price: numeric.pipe(z.number().nonnegative()), commission: numeric.pipe(z.number().nonnegative()),
  commissionAsset: token, time: z.number().int().safe().positive(), isBuyer: z.boolean() });

export function parseSpotPage(body: unknown, pair: SpotPair, accountKey: string, fromId: string) {
  const rows = z.array(rowSchema).max(1000).parse(body);
  const entries: ImportEntry[] = [];
  let previous = BigInt(fromId) - BigInt(1);
  for (const r of rows) {
    if (r.symbol !== pair.symbol || BigInt(r.id) < BigInt(fromId) || BigInt(r.id) <= previous) throw new ImportError("Binance returned unordered or repeated trades. The cursor was kept for a safe retry.");
    previous = BigInt(r.id);
    const trade: SpotTrade = { ...pair, side: r.isBuyer ? "BUY" : "SELL", quantity: r.qty, quoteQuantity: r.quoteQty,
      price: r.price, commission: r.commission, commissionAsset: r.commissionAsset, executedAt: new Date(r.time).toISOString() };
    const base = { provider: "binance" as const, accountKey, occurredOn: todayManila(new Date(r.time)), realizedPnl: null };
    const externalId = `spot:${pair.symbol}:${r.id}`;
    entries.push({ ...base, externalId, kind: "trade", amount: r.isBuyer ? -r.quoteQty : r.quoteQty, currency: pair.quoteAsset,
      description: `${trade.side} ${pair.symbol}`, trade });
    if (r.commission) entries.push({ ...base, externalId: `${externalId}:fee`, kind: "fee", amount: -r.commission,
      currency: r.commissionAsset, description: `Spot commission · ${pair.symbol}` });
  }
  return { entries: uniqueEntries(entries), cursor: rows.length ? String(previous + BigInt(1)) : fromId, complete: rows.length < 1000 };
}

export { spotFifo, summarizeSpotTrades, type SpotFifoGroup, type SpotTradeRow } from "./spot-lots";
