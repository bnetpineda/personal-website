import { fxToPhp, isSmallHolding, knownCost, type FxTable } from "./calc";
import { removeBinanceEarnReceipts } from "./connections/binance-positions";
import type { ConnectedPosition, SyncProvider } from "./connections/types";
import { todayManila } from "./dates";
import { binanceHoldingRows, type HoldingCost } from "./imports/holding-costs";

/*
 * Portfolio performance math. Pure (no I/O) and safe for client components — unit-tested with `bun test`.
 * Accounts are tracked in US dollars: Binance values coins in USD and IBKR reports in its base currency,
 * so a dollar history shows how the investments moved; pages convert it with today's rate.
 */

/** `balances`: totalled from the synced positions; `nav`: IBKR's own daily net asset value, used to fill earlier days. */
export const PORTFOLIO_SOURCES = ["balances", "nav"] as const;
export type PortfolioSource = (typeof PORTFOLIO_SOURCES)[number];

/** US dollars per 1 unit of `currency`, crossed through the PHP rates. */
export function fxToUsd(fx: FxTable, currency: string): number | null {
  if (currency === "USD") return 1;
  const rate = fxToPhp(fx, currency);
  const usd = fxToPhp(fx, "USD");
  return rate == null || usd == null || usd <= 0 ? null : rate / usd;
}

export interface AccountTotals {
  /** Net value of everything the account holds, cash included. */
  valueUsd: number;
  /** Cost and unrealized P/L of the holdings whose cost is known; null when none is. */
  costUsd: number | null;
  pnlUsd: number | null;
  /** Currencies without an exchange rate; their positions are left out. */
  missingFx: string[];
}

/** Cost coverage for material investments. Cash and dust do not require a purchase basis. */
export function profitLossCoverage(provider: SyncProvider, positions: readonly ConnectedPosition[], fx: FxTable, costs: readonly HoldingCost[] = []) {
  const investments = (provider === "binance" ? binanceHoldingRows(positions) : positions)
    .filter((p) => p.assetClass !== "cash" && p.marketValue !== 0 && !isSmallHolding(p.marketValue, p.currency, fx));
  const missing = investments.filter((p) => provider === "binance"
    ? !costs.some((c) => c.symbol === p.symbol && c.pnlEstimate != null)
    : knownCost(p) == null).length;
  return { known: investments.length - missing, missing };
}

/**
 * An account in dollars. IBKR reports each position's cost. Binance reports none, so its cost and P/L come
 * from the coins with a Spot purchase estimate — the figure Holdings shows on each coin. Simple Earn rewards
 * flag nearly every coin's estimate as partial, so requiring a gap-free estimate would leave crypto without P/L.
 */
export function accountTotals(
  provider: SyncProvider,
  positions: readonly ConnectedPosition[],
  fx: FxTable,
  binanceCosts: readonly HoldingCost[] = []
): AccountTotals {
  let value = 0;
  let cost = 0;
  let pnl = 0;
  let costed = false;
  const missing = new Set<string>();
  for (const p of provider === "binance" ? removeBinanceEarnReceipts(positions) : positions) {
    if (p.marketValue == null) continue;
    const rate = fxToUsd(fx, p.currency);
    if (rate == null) {
      missing.add(p.currency);
      continue;
    }
    value += p.marketValue * rate;
    const basis = knownCost(p);
    if (provider === "binance" || p.assetClass === "cash" || basis == null) continue;
    costed = true;
    cost += Math.abs(basis * rate);
    pnl += (p.marketValue - basis) * rate;
  }
  if (provider === "binance") {
    for (const c of binanceCosts) {
      if (!c.pnlEstimate) continue;
      costed = true;
      cost += c.pnlEstimate.costUsd;
      pnl += c.pnlEstimate.pnlUsd;
    }
  }
  return { valueUsd: value, costUsd: costed ? cost : null, pnlUsd: costed ? pnl : null, missingFx: [...missing].sort() };
}

/** The day a balance snapshot describes: IBKR's statement date, or the Manila day Binance was read. */
export function snapshotDay(provider: SyncProvider, asOf: string): string {
  return provider === "ibkr" ? asOf.slice(0, 10) : todayManila(new Date(asOf));
}

export interface PortfolioPoint {
  date: string;
  valueUsd: number;
  pnlUsd: number | null;
}

/** Saved history ending in the live balances, which stand in for a saved row of the same day. */
export function withCurrent(history: readonly PortfolioPoint[], current: PortfolioPoint): PortfolioPoint[] {
  return [...history.filter((p) => p.date < current.date), current];
}

export interface Change {
  change: number;
  /** The starting value. */
  base: number;
  /** Relative to the starting value; null when that was zero or less. */
  pct: number | null;
  /** Date of the starting point. */
  from: string;
}

/**
 * Change from the last point on or before `since` to the latest point. While the history is younger than
 * that, it starts at the first point instead (`from` says which day).
 */
export function changeSince(points: readonly { date: string; value: number }[], since: string): Change | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const base = points.findLast((p) => p.date <= since) ?? points[0];
  if (base === last) return null;
  const change = last.value - base.value;
  return { change, base: base.value, pct: base.value > 0 ? change / base.value : null, from: base.date };
}

/** Adds up several accounts' changes; the percentage is of their combined starting value. */
export function combineChanges(changes: readonly (Change | null)[]): Change | null {
  const known = changes.filter((c): c is Change => c != null);
  if (!known.length) return null;
  const change = known.reduce((sum, c) => sum + c.change, 0);
  const base = known.reduce((sum, c) => sum + c.base, 0);
  return { change, base, pct: base > 0 ? change / base : null, from: known.map((c) => c.from).sort()[0] };
}

export interface Mover {
  symbol: string;
  pnlUsd: number;
  pnlPct: number | null;
}

/**
 * Holdings with a known P/L, for best/worst lists. IBKR uses its reported cost; Binance uses each coin's
 * Spot purchase estimate. Balances under US$1 are left out, as on Holdings.
 */
export function moverRows(
  provider: SyncProvider,
  positions: readonly ConnectedPosition[],
  fx: FxTable,
  binanceCosts: readonly HoldingCost[] = []
): Mover[] {
  if (provider === "binance") {
    return binanceCosts.flatMap((c) =>
      c.pnlEstimate && !isSmallHolding(c.pnlEstimate.marketValue, "USD", fx)
        ? [{ symbol: c.symbol, pnlUsd: c.pnlEstimate.pnlUsd, pnlPct: c.pnlEstimate.pnlPct }]
        : []
    );
  }
  return positions.flatMap((p) => {
    const rate = fxToUsd(fx, p.currency);
    const basis = knownCost(p);
    if (p.assetClass === "cash" || p.marketValue == null || basis == null || rate == null || isSmallHolding(p.marketValue, p.currency, fx)) return [];
    const pnl = p.marketValue - basis;
    return [{ symbol: p.symbol, pnlUsd: pnl * rate, pnlPct: pnl / Math.abs(basis) }];
  });
}

/** Biggest gains and losses by amount, at most `count` of each. */
export function topMovers(rows: readonly Mover[], count = 3): { winners: Mover[]; losers: Mover[] } {
  return {
    winners: rows.filter((r) => r.pnlUsd > 0).sort((a, b) => b.pnlUsd - a.pnlUsd).slice(0, count),
    losers: rows.filter((r) => r.pnlUsd < 0).sort((a, b) => a.pnlUsd - b.pnlUsd).slice(0, count),
  };
}

/** One account's daily IBKR NAV, as reported in its base currency. */
export interface NavPoint {
  accountKey: string;
  date: string;
  value: number;
  currency: string;
}

/**
 * Daily NAV in dollars across the report's accounts. A day counts only when every account reported it,
 * and only when each currency has a rate, so a partial total never looks like a loss.
 */
export function navTotals(points: readonly NavPoint[], fx: FxTable): { date: string; valueUsd: number }[] {
  const accounts = new Set(points.map((p) => p.accountKey));
  const days = new Map<string, { accounts: Set<string>; value: number; complete: boolean }>();
  for (const p of points) {
    const day = days.get(p.date) ?? { accounts: new Set<string>(), value: 0, complete: true };
    const rate = fxToUsd(fx, p.currency);
    if (rate == null || day.accounts.has(p.accountKey)) day.complete = false;
    else day.value += p.value * rate;
    day.accounts.add(p.accountKey);
    days.set(p.date, day);
  }
  return [...days]
    .filter(([, d]) => d.complete && d.accounts.size === accounts.size)
    .map(([date, d]) => ({ date, valueUsd: d.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
