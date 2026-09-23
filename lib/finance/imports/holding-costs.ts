import { removeBinanceEarnReceipts } from "../connections/binance-positions";
import type { ConnectedPosition, ConnectionSnapshot } from "../connections/types";
import { spotFifo } from "./spot";
import type { SpotTrade } from "./types";

type CostEntry = { accountKey: string; externalId: string; occurredOn: string; status: string; kind: string; currency: string; trade: SpotTrade | null };
type CostJob = { accountKey: string; scope: string; completedAt: Date | null; lastSyncedAt: Date | null; error: string | null };
export interface HoldingCost {
  symbol: string;
  heldQuantity: number;
  trackedQuantity: number;
  positionCount: number;
  status: "estimate" | "partial" | "unavailable";
  lines: { pair: string; currency: string; quantity: number; cost: number; averageCost: number }[];
  reasons: string[];
}

/** Query only real supported markets, prioritizing the largest current holdings. */
export function heldUsdtPairs(positions: readonly ConnectedPosition[], symbols: readonly string[]) {
  const available = new Set(symbols), assets = new Map<string, number>();
  for (const p of removeBinanceEarnReceipts(positions)) {
    if (p.quantity > 0 && p.symbol !== "USDT") assets.set(p.symbol, (assets.get(p.symbol) ?? 0) + (p.marketValue ?? 0));
  }
  const pairs = [...assets].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([asset]) => `${asset}USDT`).filter((pair) => available.has(pair)).slice(0, 20);
  return { pairs, skipped: [...assets.keys()].filter((asset) => !pairs.includes(`${asset}USDT`)) };
}

/** Trade-only evidence, never a zero basis for rewards, transfers or unrecorded purchases. */
export function holdingCosts(snapshot: ConnectionSnapshot | null, entries: readonly CostEntry[], jobs: readonly CostJob[]): HoldingCost[] {
  if (!snapshot) return [];
  const positions = removeBinanceEarnReceipts(snapshot.positions);
  const assets = [...new Set(positions.filter((p) => p.quantity > 0).map((p) => p.symbol))];
  // Legacy snapshots have no identity. Do not guess which historical account they belong to.
  const rows = snapshot.accountKey ? entries.filter((e) => e.accountKey === snapshot.accountKey &&
    (e.trade ? e.trade.executedAt <= snapshot.asOf : e.occurredOn <= snapshot.asOf.slice(0, 10))) : [];
  const fifo = spotFifo([...rows]);
  return assets.map((symbol): HoldingCost => {
    const wallets = positions.filter((p) => p.symbol === symbol);
    const heldQuantity = wallets.reduce((sum, p) => sum + p.quantity, 0);
    const groups = fifo.filter((g) => g.baseAsset === symbol);
    const lines = groups.filter((g) => g.remaining > 0).map((g) => ({ pair: g.symbol, currency: g.quoteAsset,
      quantity: g.remaining, cost: g.cost, averageCost: g.cost / g.remaining }));
    const trackedQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
    const reasons: string[] = [];
    if (!snapshot.accountKey) reasons.push("Sync Binance balances to link costs to the current account.");
    else if (!groups.length) reasons.push("No Spot purchase lots have been imported for this coin. Import its trading pairs; rewards, Convert and transfers need their original acquisition records.");
    else if (!lines.length) reasons.push("Imported Spot purchase lots have been used up. The current balance needs additional acquisition records.");
    const relevantJobs = jobs.filter((j) => j.accountKey === snapshot.accountKey && groups.some((g) => j.scope === `spot:${g.symbol}`));
    if (groups.length && (relevantJobs.length !== groups.length || relevantJobs.some((j) => !j.completedAt || j.error))) {
      reasons.push("At least one trading pair has an unfinished or failed history import.");
    } else if (groups.length && relevantJobs.some((j) => !j.lastSyncedAt || j.lastSyncedAt.toISOString() < snapshot.asOf)) {
      reasons.push("Trade history was last checked before these balances. Sync new trades in Investment history.");
    }
    const tolerance = Math.max(1e-12, Math.abs(heldQuantity) * 1e-8);
    if (lines.length && Math.abs(heldQuantity - trackedQuantity) > tolerance) {
      reasons.push("Remaining Spot lots do not match the current coin balance. Rewards, transfers or missing trades may explain the difference.");
    }
    if (groups.some((g) => g.unmatched)) reasons.push("Some sells have no earlier imported purchase to establish their cost.");
    if (groups.some((g) => g.externalFees)) reasons.push("Fees paid in another coin are excluded from these trade costs.");
    if (groups.length > 1) reasons.push("FIFO is calculated separately per trading pair. A combined coin cost requires matching lots across every pair.");
    if (rows.some((e) => e.status !== "ignored" && !e.trade && e.currency === symbol && (e.kind !== "fee" || !e.externalId.startsWith("spot:")))) {
      reasons.push("Imported rewards or transfers also affect this coin. Their original cost is not established by Spot fills.");
    }
    if (rows.some((e) => e.status !== "ignored" && e.trade && (e.trade.quoteAsset === symbol ||
      (e.trade.commission > 0 && e.trade.commissionAsset === symbol && e.trade.baseAsset !== symbol)))) {
      reasons.push("This coin was also used as payment or fees in another trading pair.");
    }
    if (rows.some((e) => e.status === "ignored" && e.trade?.baseAsset === symbol)) reasons.push("Ignored trades are excluded from this estimate.");
    return { symbol, heldQuantity, trackedQuantity, positionCount: wallets.length, lines, reasons,
      status: !lines.length ? "unavailable" : reasons.length ? "partial" : "estimate" };
  });
}
