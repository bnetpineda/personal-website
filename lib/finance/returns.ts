import type { FxTable } from "./calc";
import { CURRENCIES } from "./constants";
import type { ConnectedPosition } from "./connections/types";
import { daysBetween } from "./dates";
import { fxToUsd } from "./performance";

/*
 * Investment return without the money moved in and out. Pure (no I/O) and safe for client components.
 * A balance moves with deposits and withdrawals as well as with prices; these take the transfers back
 * out, so what's left is what the investments themselves did.
 */

/** Dollar-pegged coins are worth a dollar even when no account holds one to price them by. */
const STABLECOINS = new Set(["USDT", "USDC", "USDE", "FDUSD", "DAI", "USDH", "USD0", "PYUSD"]);

const isFiat = (currency: string) => (CURRENCIES as readonly string[]).includes(currency);

/**
 * Today's dollar price of every coin or ticker the accounts hold, read from their own balances (value
 * over quantity). An estimate for anything not held any more, which has no price here.
 */
export function unitPricesUsd(positions: readonly ConnectedPosition[], fx: FxTable): Map<string, number> {
  const best = new Map<string, { price: number; value: number }>();
  for (const p of positions) {
    const rate = fxToUsd(fx, p.currency);
    if (p.marketValue == null || rate == null || p.quantity <= 0 || p.marketValue <= 0 || p.assetClass === "cash") continue;
    const symbol = p.symbol.toUpperCase();
    const value = p.marketValue * rate;
    // The largest holding of a symbol sets its price, so dust doesn't skew it.
    if ((best.get(symbol)?.value ?? -1) < value) best.set(symbol, { price: value / p.quantity, value });
  }
  return new Map([...best].map(([symbol, { price }]) => [symbol, price]));
}

/** An amount in dollars at today's rates and prices, or null when there's no price for it. */
export function amountInUsd(amount: number, currency: string, prices: ReadonlyMap<string, number>, fx: FxTable): number | null {
  const code = currency.toUpperCase();
  if (isFiat(code)) {
    const rate = fxToUsd(fx, code);
    return rate == null ? null : amount * rate;
  }
  const price = prices.get(code) ?? (STABLECOINS.has(code) ? 1 : null);
  return price == null ? null : amount * price;
}

export interface Flow {
  date: string;
  /** In the page's currency; deposits are positive, withdrawals negative. */
  value: number;
}

export interface MarketReturn {
  /** The whole balance change. */
  change: number;
  /** Money moved in (positive) or out (negative) over the same days. */
  flows: number;
  /** The change the investments made by themselves: `change` minus `flows`. */
  market: number;
  /**
   * Modified Dietz return: `market` over the starting value plus each transfer weighted by how long it
   * was invested. Null when there was nothing invested to measure against.
   */
  pct: number | null;
}

/**
 * The return between two points, leaving out transfers dated after `from` up to and including `to`.
 * A transfer on the starting day is already in the starting balance.
 */
export function marketReturn(start: { date: string; value: number }, end: { date: string; value: number }, flows: readonly Flow[]): MarketReturn {
  const span = Math.max(daysBetween(start.date, end.date), 1);
  const inWindow = flows.filter((f) => f.date > start.date && f.date <= end.date);
  const moved = inWindow.reduce((sum, f) => sum + f.value, 0);
  const weighted = inWindow.reduce((sum, f) => sum + f.value * (daysBetween(f.date, end.date) / span), 0);
  const change = end.value - start.value;
  const market = change - moved;
  const base = start.value + weighted;
  return { change, flows: moved, market, pct: base > 0 ? market / base : null };
}

/** Several accounts' returns added up; the percentage is of their combined base. */
export function combineReturns(returns: readonly { result: MarketReturn; base: number }[]): MarketReturn | null {
  if (!returns.length) return null;
  const sum = (pick: (r: MarketReturn) => number) => returns.reduce((total, r) => total + pick(r.result), 0);
  const base = returns.reduce((total, r) => total + r.base, 0);
  const market = sum((r) => r.market);
  return { change: sum((r) => r.change), flows: sum((r) => r.flows), market, pct: base > 0 ? market / base : null };
}

/** The Modified Dietz base `marketReturn` used, so returns can be combined. */
export function returnBase(start: { date: string; value: number }, end: { date: string }, flows: readonly Flow[]): number {
  const span = Math.max(daysBetween(start.date, end.date), 1);
  return start.value + flows.filter((f) => f.date > start.date && f.date <= end.date).reduce((sum, f) => sum + f.value * (daysBetween(f.date, end.date) / span), 0);
}
