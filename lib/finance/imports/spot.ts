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

export type SpotTradeRow = { accountKey: string; externalId: string; status: string; trade: SpotTrade | null };
export type SpotFifoGroup = ReturnType<typeof spotFifo>[number];

/** Per-pair estimate only. Unknown acquisition costs never become zero-cost lots. */
export function spotFifo(rows: SpotTradeRow[]): { accountKey: string; symbol: string; baseAsset: string; quoteAsset: string; bought: number; sold: number; remaining: number; cost: number; realized: number; unmatched: number; externalFees: number }[] {
  const groups = new Map<string, { accountKey: string; symbol: string; baseAsset: string; quoteAsset: string;
    bought: number; sold: number; remaining: number; cost: number; realized: number; unmatched: number; externalFees: number; lots: { qty: number; cost: number }[] }>();
  for (const e of [...rows].filter((e) => e.trade && e.status !== "ignored").sort((a, b) =>
    a.trade!.executedAt.localeCompare(b.trade!.executedAt) || (BigInt(a.externalId.split(":").at(-1)!) < BigInt(b.externalId.split(":").at(-1)!) ? -1 : 1))) {
    const t = e.trade!, key = JSON.stringify([e.accountKey, t.symbol]);
    const g = groups.get(key) ?? { accountKey: e.accountKey, symbol: t.symbol, baseAsset: t.baseAsset, quoteAsset: t.quoteAsset,
      bought: 0, sold: 0, remaining: 0, cost: 0, realized: 0, unmatched: 0, externalFees: 0, lots: [] };
    const baseFee = t.commissionAsset === t.baseAsset ? t.commission : 0;
    const quoteFee = t.commissionAsset === t.quoteAsset ? t.commission : 0;
    if (t.commission && t.commissionAsset !== t.baseAsset && t.commissionAsset !== t.quoteAsset) g.externalFees++;
    if (t.side === "BUY") {
      const qty = t.quantity - baseFee;
      if (qty <= 0) { g.unmatched++; groups.set(key, g); continue; }
      g.bought += qty;
      g.lots.push({ qty, cost: t.quoteQuantity + quoteFee });
    } else {
      g.sold += t.quantity + baseFee;
      let needed = t.quantity + baseFee, cost = 0;
      while (needed > 1e-14 && g.lots.length) {
        const lot = g.lots[0], qty = Math.min(lot.qty, needed), spent = lot.cost * qty / lot.qty;
        cost += spent; needed -= qty; lot.qty -= qty; lot.cost -= spent;
        if (lot.qty <= 1e-14) g.lots.shift();
      }
      if (needed > 1e-12) g.unmatched++;
      else g.realized += t.quoteQuantity - quoteFee - cost;
    }
    groups.set(key, g);
  }
  return [...groups.values()].map(({ lots, ...g }) => ({ ...g, remaining: lots.reduce((sum, l) => sum + l.qty, 0), cost: lots.reduce((sum, l) => sum + l.cost, 0) }));
}

/** FIFO for one window, plus the coins whose ignored or cross-pair activity the estimate must mention. */
export function summarizeSpotTrades(rows: readonly SpotTradeRow[], asOf: string | null) {
  const inWindow = rows.filter((entry) => entry.trade && (asOf == null || entry.trade.executedAt <= asOf));
  const ignoredBases = new Set<string>();
  const paymentAssets = new Set<string>();
  for (const entry of inWindow) {
    const trade = entry.trade!;
    if (entry.status === "ignored") ignoredBases.add(trade.baseAsset);
    else {
      paymentAssets.add(trade.quoteAsset);
      if (trade.commission > 0 && trade.commissionAsset !== trade.baseAsset && trade.commissionAsset !== trade.quoteAsset) paymentAssets.add(trade.commissionAsset);
    }
  }
  return { fifo: spotFifo(inWindow), ignoredBases: [...ignoredBases].sort(), paymentAssets: [...paymentAssets].sort() };
}
