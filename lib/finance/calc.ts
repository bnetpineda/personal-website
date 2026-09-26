import { BASE_CURRENCY, type AssetClass, type CashFlowKind } from "./constants";
import { addMonths } from "./dates";
import type { ConnectedPosition } from "./connections/types";

/* Pure portfolio math. No I/O, no server-only imports — unit-tested with `bun test`. */

/** PHP per 1 unit of each currency. PHP itself is implicit (1). */
export type FxTable = Readonly<Record<string, number>>;

export function fxToPhp(fx: FxTable, currency: string): number | null {
  if (currency === BASE_CURRENCY) return 1;
  return fx[currency] ?? null;
}

/** PHP sum that skips currencies with no rate, instead of treating them as zero. */
export function sumInPhp(fx: FxTable, parts: { amount: number; currency: string }[]): { total: number; missing: string[] } {
  const missing = new Set<string>();
  let total = 0;
  for (const part of parts) {
    const rate = fxToPhp(fx, part.currency);
    if (rate == null) missing.add(part.currency);
    else total += part.amount * rate;
  }
  return { total, missing: [...missing].sort() };
}

/** Strips float noise (0.1 + 0.2) while keeping magnitude — safe for tiny token prices. */
export function clean(n: number): number {
  return Number(n.toPrecision(15));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface Position {
  assetClass: AssetClass;
  quantity: number;
  avgCost: number;
  currency: string;
  lastPrice: number | null;
}

export interface HoldingMetrics {
  /** Price used for valuation: last known price, else average cost. */
  unitPrice: number;
  hasPrice: boolean;
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number | null;
  /** PHP per unit of the holding's currency; null when no FX rate is known yet. */
  rate: number | null;
  valuePhp: number | null;
  costPhp: number | null;
  pnlPhp: number | null;
}

export function holdingMetrics(h: Position, fx: FxTable): HoldingMetrics {
  const unitPrice = h.lastPrice ?? h.avgCost;
  const value = h.quantity * unitPrice;
  const cost = h.quantity * h.avgCost;
  const pnl = value - cost;
  const rate = fxToPhp(fx, h.currency);
  return {
    unitPrice,
    hasPrice: h.lastPrice != null,
    value,
    cost,
    pnl,
    pnlPct: cost > 0 ? pnl / cost : null,
    rate,
    valuePhp: rate == null ? null : value * rate,
    costPhp: rate == null ? null : cost * rate,
    pnlPhp: rate == null ? null : pnl * rate,
  };
}

/** Provider values already include contract multipliers. Missing cost is never zero cost. */
export function connectedHoldingMetrics(position: Pick<ConnectedPosition, "marketValue" | "costBasis" | "currency">, fx: FxTable) {
  const rate = fxToPhp(fx, position.currency);
  const pnl = position.marketValue == null || position.costBasis == null ? null : position.marketValue - position.costBasis;
  return {
    valuePhp: position.marketValue == null || rate == null ? null : position.marketValue * rate,
    pnl,
    pnlPhp: pnl == null || rate == null ? null : pnl * rate,
    pnlPct: pnl == null || position.costBasis == null || position.costBasis === 0 ? null : pnl / Math.abs(position.costBasis),
  };
}

/** Display-only US$1 minimum. Keep unknown values/rates visible and compare signed positions by magnitude. */
export function isSmallHolding(value: number | null, currency: string, fx: FxTable): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  if (value === 0) return true;
  if (currency === "USD") return Math.abs(value) < 1;
  const rate = fxToPhp(fx, currency);
  const usdRate = fxToPhp(fx, "USD");
  if (rate == null || usdRate == null || rate <= 0 || usdRate <= 0) return false;
  return clean(Math.abs(value) * rate / usdRate) < 1;
}

export interface NetWorth {
  assetsPhp: number;
  liabilitiesPhp: number;
  netWorthPhp: number;
  /** Cost basis of all holdings (cash included). */
  investedPhp: number;
  unrealizedPhp: number;
  /** Unrealized P/L relative to non-cash cost basis. */
  unrealizedPct: number | null;
  byClass: Partial<Record<AssetClass, number>>;
  /** Currencies that couldn't be converted (no FX rate yet) and were left out. */
  missingFx: string[];
  /** Synced positions omitted from valuation or P/L because the provider lacks data. */
  missingPrices: string[];
  missingCostBasis: string[];
}

export function computeNetWorth(
  holdings: readonly (Position & { archived?: boolean })[],
  liabilities: readonly { balance: number; currency: string; archived?: boolean }[],
  fx: FxTable,
  connected: readonly ConnectedPosition[] = []
): NetWorth {
  let assets = 0;
  let invested = 0;
  let unrealized = 0;
  let nonCashCost = 0;
  const byClass: Partial<Record<AssetClass, number>> = {};
  const missing = new Set<string>();
  const missingPrices: string[] = [];
  const missingCostBasis: string[] = [];
  let connectedDebts = 0;

  for (const h of holdings) {
    if (h.archived) continue;
    const m = holdingMetrics(h, fx);
    if (m.valuePhp == null || m.costPhp == null || m.pnlPhp == null) {
      missing.add(h.currency);
      continue;
    }
    assets += m.valuePhp;
    invested += m.costPhp;
    unrealized += m.pnlPhp;
    if (h.assetClass !== "cash") nonCashCost += m.costPhp;
    byClass[h.assetClass] = (byClass[h.assetClass] ?? 0) + m.valuePhp;
  }

  for (const p of connected) {
    if (p.quantity === 0 && p.marketValue === 0) continue;
    const rate = fxToPhp(fx, p.currency);
    if (rate == null) missing.add(p.currency);
    if (p.marketValue == null) missingPrices.push(p.name);
    if (p.costBasis == null) missingCostBasis.push(p.name);
    if (rate == null || p.marketValue == null) continue;
    const value = p.marketValue * rate;
    // Short positions and negative cash are obligations, not negative asset tiles.
    if (value < 0) connectedDebts -= value;
    else {
      assets += value;
      byClass[p.assetClass] = (byClass[p.assetClass] ?? 0) + value;
    }
    if (p.costBasis != null) {
      invested += p.costBasis * rate;
      unrealized += (p.marketValue - p.costBasis) * rate;
      if (p.assetClass !== "cash") nonCashCost += Math.abs(p.costBasis * rate);
    }
  }

  let debts = connectedDebts;
  for (const l of liabilities) {
    if (l.archived) continue;
    const rate = fxToPhp(fx, l.currency);
    if (rate == null) {
      missing.add(l.currency);
      continue;
    }
    debts += l.balance * rate;
  }

  for (const key of Object.keys(byClass) as AssetClass[]) byClass[key] = round2(byClass[key]!);

  return {
    assetsPhp: round2(assets),
    liabilitiesPhp: round2(debts),
    netWorthPhp: round2(assets - debts),
    investedPhp: round2(invested),
    unrealizedPhp: round2(unrealized),
    unrealizedPct: nonCashCost > 0 ? unrealized / nonCashCost : null,
    byClass,
    missingFx: [...missing].sort(),
    missingPrices,
    missingCostBasis,
  };
}

/** Allocation shares, largest first. */
export function allocation(byClass: Partial<Record<AssetClass, number>>): { assetClass: AssetClass; value: number; share: number }[] {
  const entries = (Object.entries(byClass) as [AssetClass, number][]).filter(([, v]) => v > 0);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  return entries
    .map(([assetClass, value]) => ({ assetClass, value, share: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function budgetProgress(
  spent: number,
  budget: number | null | undefined
): { ratio: number; over: boolean; remaining: number } | null {
  if (budget == null || budget <= 0) return null;
  return { ratio: spent / budget, over: spent > budget, remaining: round2(budget - spent) };
}

/** Stacked-bar segments for spend against an optional budget: within it, budget left, overspend. */
export function budgetSegments(
  spent: number,
  budget: number | null | undefined
): { within: number; left: number; over: number } {
  if (budget == null || budget <= 0) return { within: spent, left: 0, over: 0 };
  return {
    within: Math.min(spent, budget),
    left: round2(Math.max(budget - spent, 0)),
    over: round2(Math.max(spent - budget, 0)),
  };
}

/** Share of income kept: (income − expense) / income. */
export function savingsRate(income: number, expense: number): number | null {
  return income > 0 ? (income - expense) / income : null;
}

export interface MonthTotal {
  month: string;
  kind: CashFlowKind;
  total: number;
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

/** `count` consecutive months ending at `endMonth`, zero-filled. */
export function monthlySeries(endMonth: string, count: number, rows: readonly MonthTotal[]): MonthPoint[] {
  const totals = new Map(rows.map((r) => [`${r.month}|${r.kind}`, r.total]));
  const series: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = addMonths(endMonth, -i);
    const income = totals.get(`${month}|income`) ?? 0;
    const expense = totals.get(`${month}|expense`) ?? 0;
    series.push({ month, income, expense, net: round2(income - expense) });
  }
  return series;
}
