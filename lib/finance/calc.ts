import { BASE_CURRENCY, type AssetClass, type CashFlowKind } from "./constants";
import { addMonths } from "./dates";
import { formatQty } from "./format";

/* Pure portfolio math. No I/O, no server-only imports — unit-tested with `bun test`. */

/** PHP per 1 unit of each currency. PHP itself is implicit (1). */
export type FxTable = Readonly<Record<string, number>>;

export function fxToPhp(fx: FxTable, currency: string): number | null {
  if (currency === BASE_CURRENCY) return 1;
  return fx[currency] ?? null;
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

export type Adjustment =
  | { type: "buy"; quantity: number; price: number; fee?: number }
  | { type: "sell"; quantity: number };

export type AdjustmentResult = { ok: true; quantity: number; avgCost: number } | { ok: false; error: string };

/**
 * Simple-position bookkeeping.
 * Buy: weighted-average cost, fee folded into the cost basis.
 * Sell: quantity goes down, average cost is unchanged; can't sell more than held.
 */
export function applyAdjustment(position: { quantity: number; avgCost: number }, adj: Adjustment): AdjustmentResult {
  if (!Number.isFinite(adj.quantity) || adj.quantity <= 0) {
    return { ok: false, error: "Quantity must be greater than 0." };
  }

  if (adj.type === "buy") {
    const fee = adj.fee ?? 0;
    if (!Number.isFinite(adj.price) || adj.price < 0) return { ok: false, error: "Price can't be negative." };
    if (!Number.isFinite(fee) || fee < 0) return { ok: false, error: "Fee can't be negative." };
    const quantity = position.quantity + adj.quantity;
    const avgCost = (position.quantity * position.avgCost + adj.quantity * adj.price + fee) / quantity;
    return { ok: true, quantity: clean(quantity), avgCost: clean(avgCost) };
  }

  const tolerance = Math.max(1e-12, position.quantity * 1e-9);
  if (adj.quantity > position.quantity + tolerance) {
    return { ok: false, error: `You only hold ${formatQty(position.quantity)}.` };
  }
  const remaining = position.quantity - adj.quantity;
  return { ok: true, quantity: remaining <= tolerance ? 0 : clean(remaining), avgCost: position.avgCost };
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
}

export function computeNetWorth(
  holdings: readonly (Position & { archived?: boolean })[],
  liabilities: readonly { balance: number; currency: string; archived?: boolean }[],
  fx: FxTable
): NetWorth {
  let assets = 0;
  let invested = 0;
  let unrealized = 0;
  let nonCashCost = 0;
  const byClass: Partial<Record<AssetClass, number>> = {};
  const missing = new Set<string>();

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

  let debts = 0;
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
