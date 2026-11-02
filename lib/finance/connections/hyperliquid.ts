import { z } from "zod";
import { number } from "./parsers";
import { snapshotSchema, type ConnectedPosition, type ConnectionSnapshot } from "./types";

/* Hyperliquid responses to positions. Pure (no I/O): lib/finance/connections/providers.ts does the reading. */

const USDC = "USDC";
/** Only the 10,000 most recent fills are available, so a wallet at the limit may be missing older buys. */
export const HYPERLIQUID_FILL_LIMIT = 10_000;

/** Everything one sync reads from the info endpoint, before any of it is trusted. */
export interface HyperliquidState {
  address: string;
  abstraction: unknown;
  markets: unknown;
  spot: unknown;
  /** One clearinghouse state per perp DEX. */
  perps: unknown[];
  lending: unknown;
  staking: unknown;
  vaults: unknown;
  rewards: unknown;
  portfolio: unknown;
  fills: unknown;
}

const marketsSchema = z.tuple([
  z.object({
    tokens: z.array(z.object({ name: z.string().min(1), index: z.number().int() })),
    universe: z.array(z.object({ name: z.string().min(1), index: z.number().int(), tokens: z.tuple([z.number().int(), z.number().int()]) })),
  }),
  z.array(z.object({ midPx: number.nullish(), markPx: number.nullish(), dayNtlVlm: number.nullish() })),
]);

export interface SpotMarkets {
  tokens: Map<number, string>;
  /** Spot fills name a market ("@107", "PURR/USDC"), not the token. */
  pairs: Map<string, { base: string; quote: string }>;
  /** USDC per token. A token without a USDC market is crossed through its other quote token. */
  prices: Map<string, number>;
}

export function spotMarkets(body: unknown): SpotMarkets {
  const [meta, contexts] = marketsSchema.parse(body);
  const tokens = new Map(meta.tokens.map((t) => [t.index, t.name]));
  const pairs = new Map<string, { base: string; quote: string }>();
  const quotes = meta.universe.flatMap((pair) => {
    const base = tokens.get(pair.tokens[0]), quote = tokens.get(pair.tokens[1]);
    if (!base || !quote) return [];
    pairs.set(pair.name, { base, quote });
    const context = contexts[pair.index];
    const price = context?.midPx ?? context?.markPx;
    return price && price > 0 ? [{ base, quote, price, volume: context.dayNtlVlm ?? 0 }] : [];
  }).sort((a, b) => b.volume - a.volume);
  const prices = new Map([[USDC, 1]]);
  for (const q of quotes) if (q.quote === USDC && !prices.has(q.base)) prices.set(q.base, q.price);
  for (const q of quotes) {
    const quote = prices.get(q.quote);
    if (quote && !prices.has(q.base)) prices.set(q.base, q.price * quote);
  }
  return { tokens, pairs, prices };
}

const fillSchema = z.object({
  coin: z.string().min(1), px: number, sz: number, side: z.enum(["A", "B"]), time: z.number().int().positive(),
  dir: z.string().min(1), closedPnl: number, fee: number, feeToken: z.string(), tid: z.union([z.string().min(1), z.number().int().safe()]).transform(String),
});
export type HyperliquidFill = z.output<typeof fillSchema>;
export const parseFills = (body: unknown): HyperliquidFill[] => z.array(fillSchema).parse(body);

const rewardSchema = z.object({ time: z.number().int().positive(), source: z.string().min(1), totalAmount: number });
export const parseStakingRewards = (body: unknown) => z.array(rewardSchema).parse(body);

/**
 * Units and USDC cost left from this wallet's spot buys, averaged; staking rewards are units that cost nothing.
 * A coin traded in a non-USDC market, or sold beyond what was bought, has no reliable cost and is left out.
 */
export function recordedCosts(fills: readonly HyperliquidFill[], markets: SpotMarkets, rewards: number) {
  const lots = new Map<string, { quantity: number; cost: number }>();
  const unknown = new Set<string>();
  for (const fill of [...fills].sort((a, b) => a.time - b.time)) {
    const pair = markets.pairs.get(fill.coin);
    if (!pair) continue;
    if (pair.quote !== USDC) {
      unknown.add(pair.base);
      continue;
    }
    const lot = lots.get(pair.base) ?? { quantity: 0, cost: 0 };
    if (fill.side === "B") {
      lot.quantity += fill.sz - (fill.feeToken === pair.base ? fill.fee : 0);
      lot.cost += fill.sz * fill.px + (fill.feeToken === USDC ? fill.fee : 0);
    } else {
      if (fill.sz > lot.quantity * 1.001) unknown.add(pair.base);
      const left = Math.max(lot.quantity - fill.sz, 0);
      lot.cost = lot.quantity > 0 ? lot.cost * (left / lot.quantity) : 0;
      lot.quantity = left;
    }
    lots.set(pair.base, lot);
  }
  if (rewards > 0) {
    const hype = lots.get("HYPE") ?? { quantity: 0, cost: 0 };
    lots.set("HYPE", { quantity: hype.quantity + rewards, cost: hype.cost });
  }
  for (const coin of unknown) lots.delete(coin);
  return lots;
}

const perpSchema = z.object({
  marginSummary: z.object({ accountValue: number }),
  assetPositions: z.array(z.object({ position: z.object({
    coin: z.string().min(1), szi: number, entryPx: number, unrealizedPnl: number,
    leverage: z.object({ value: number.pipe(z.number().positive()) }),
  }) })),
});
const lendingSchema = z.object({ tokenToState: z.array(z.tuple([z.number().int(), z.object({
  borrow: z.object({ value: number }), supply: z.object({ value: number }),
})])) });
const stakingSchema = z.object({ delegated: number, undelegated: number, totalPendingWithdrawal: number });
const spotSchema = z.object({ balances: z.array(z.object({ coin: z.string().min(1), total: number })) });
const vaultsSchema = z.array(z.object({ vaultAddress: z.string().min(1), equity: number }));
const portfolioSchema = z.array(z.tuple([z.string(), z.object({ accountValueHistory: z.array(z.tuple([z.number().int(), number])) })]));

/** Hyperliquid's own account value over time, oldest first, from every period it reports. */
export function accountValueHistory(body: unknown): { time: number; value: number }[] {
  const byTime = new Map<number, number>();
  for (const [period, data] of portfolioSchema.parse(body)) {
    if (period.startsWith("perp")) continue;
    for (const [time, value] of data.accountValueHistory) byTime.set(time, value);
  }
  return [...byTime].map(([time, value]) => ({ time, value })).sort((a, b) => a.time - b.time);
}

export function hyperliquidSnapshot(state: HyperliquidState, now = new Date()): ConnectionSnapshot {
  const markets = spotMarkets(state.markets);
  const coinRow = (id: string, label: string, coin: string, quantity: number): ConnectedPosition => {
    const price = markets.prices.get(coin);
    const cash = coin === USDC;
    return { id, name: `${coin} · ${label}`, symbol: coin, assetClass: cash ? "cash" : "crypto", currency: "USD", quantity,
      marketValue: price == null ? null : quantity * price, costBasis: cash ? quantity : null };
  };

  // A perp counts as the margin behind it plus its unrealized P/L, never its full size, so P/L % reads as return on margin.
  const dexes = state.perps.map((perp) => perpSchema.parse(perp));
  const perps = dexes.flatMap((dex) => dex.assetPositions.map(({ position: p }): ConnectedPosition => {
    const margin = Math.abs(p.szi) * p.entryPx / p.leverage.value;
    return { id: `perp:${p.coin}`, name: `${p.coin} ${p.szi > 0 ? "long" : "short"} · ${p.leverage.value}x perp`, symbol: p.coin,
      // Builder-deployed DEXs ("xyz:TSLA") also list stocks and indexes.
      assetClass: p.coin.includes(":") ? "other" : "crypto", currency: "USD", quantity: p.szi, marketValue: margin + p.unrealizedPnl, costBasis: margin };
  }));
  const marginTotal = perps.reduce((sum, p) => sum + p.costBasis!, 0);
  const perpValue = perps.reduce((sum, p) => sum + p.marketValue!, 0);

  // A unified account keeps all its USDC in the spot balance, margin included; otherwise each perp DEX holds its own.
  const unified = ["unifiedAccount", "portfolioMargin"].includes(z.string().parse(state.abstraction));
  const spot = spotSchema.parse(state.spot).balances.map((b) => ({ coin: b.coin, total: b.total }));
  if (unified && marginTotal > 0 && !spot.some((b) => b.coin === USDC)) spot.push({ coin: USDC, total: 0 });
  const spotRows = spot.map((b) => coinRow(`spot:${b.coin}`, "Spot", b.coin, unified && b.coin === USDC ? b.total - marginTotal : b.total));
  const perpCash = dexes.reduce((sum, dex) => sum + dex.marginSummary.accountValue, 0) - perpValue;
  const marginRows = !unified && Math.abs(perpCash) > 1e-9 ? [coinRow("perp-margin", "Perp margin", USDC, perpCash)] : [];

  const lendingRows = lendingSchema.parse(state.lending).tokenToState.flatMap(([index, position]) => {
    const coin = markets.tokens.get(index) ?? `Token ${index}`;
    return [coinRow(`lending:${index}`, "Lending", coin, position.supply.value), coinRow(`borrow:${index}`, "Borrowed", coin, -position.borrow.value)];
  });
  const staking = stakingSchema.parse(state.staking);
  const stakingRow = coinRow("staking", "Staked", "HYPE", staking.delegated + staking.undelegated + staking.totalPendingWithdrawal);
  const vaultRows = vaultsSchema.parse(state.vaults).map((v): ConnectedPosition => ({ id: `vault:${v.vaultAddress}`, name: `Vault ${v.vaultAddress.slice(0, 8)}…`,
    symbol: "VAULT", assetClass: "fund", currency: "USD", quantity: v.equity, marketValue: v.equity, costBasis: null }));

  const holdings = [...spotRows, ...marginRows, ...lendingRows, stakingRow, ...vaultRows].filter((p) => p.quantity !== 0);

  // One coin can sit in several places (spot, staked, lent): its cost follows the units across them.
  const fills = parseFills(state.fills);
  const complete = fills.length < HYPERLIQUID_FILL_LIMIT;
  if (complete) {
    const rewards = parseStakingRewards(state.rewards).reduce((sum, r) => sum + r.totalAmount, 0);
    const costs = recordedCosts(fills, markets, rewards);
    const coins = holdings.filter((p) => p.assetClass === "crypto" && p.quantity > 0);
    for (const row of coins) {
      const lot = costs.get(row.symbol);
      const held = coins.filter((p) => p.symbol === row.symbol).reduce((sum, p) => sum + p.quantity, 0);
      // More than the wallet ever bought means coins arrived from elsewhere; pretending they were free would show them as profit.
      if (!lot || lot.cost <= 0 || held > lot.quantity * 1.01) continue;
      row.costBasis = (row.quantity / held) * (lot.cost / lot.quantity) * Math.min(held, lot.quantity);
    }
  }

  const positions = [...holdings, ...perps];
  const unpriced = positions.some((p) => p.marketValue == null);
  const total = positions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
  const reported = accountValueHistory(state.portfolio).at(-1)?.value;
  const differs = !unpriced && reported != null && Math.abs(total - reported) > Math.max(1, Math.abs(reported) * 0.01);
  return snapshotSchema.parse({ asOf: now.toISOString(), accountKey: `address:${state.address}`, positions, warnings: [
    "Your Hyperliquid account only: spot, perps, staking, lending and vaults. Tokens on HyperEVM or other chains are not included.",
    "USD values use Hyperliquid's USDC markets and count 1 USDC as US$1. A perp counts as its margin plus unrealized P/L, not its full size.",
    "Cost is estimated from this wallet's USDC spot buys and staking rewards. Coins that arrived from elsewhere have no cost and stay out of P/L.",
    ...(unpriced ? ["Some assets have no Hyperliquid market and are excluded from totals."] : []),
    ...(complete ? [] : ["This wallet has more fills than Hyperliquid keeps, so cost estimates are unavailable."]),
    ...(differs ? ["These balances differ by more than 1% from Hyperliquid's own account value, so something may be missing here."] : []),
  ] });
}
