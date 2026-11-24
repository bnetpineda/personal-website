import { addMonths, daysBetween } from "./dates";

/*
 * Debts: when the next payment is due, and how fast a fixed monthly budget pays them all off.
 * Pure and in PHP; callers convert foreign-currency debts first.
 */

/** The next date a debt falls due on or after `today`, clamping the day to short months (31 → Feb 28). */
export function nextDueDate(dueDay: number, today: string): { date: string; inDays: number } {
  const on = (month: string) => {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${month}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
  };
  const month = today.slice(0, 7);
  const date = on(month) >= today ? on(month) : on(addMonths(month, 1));
  return { date, inDays: daysBetween(today, date) };
}

export interface PlanDebt {
  id: string;
  name: string;
  /** PHP owed today. */
  balance: number;
  /** Percent, per year or per month (see `PlanOptions.ratePer`). Null counts as interest-free. */
  rate: number | null;
  /** PHP; null uses `assumedMinimum`. */
  minPayment: number | null;
}

export type PayoffStrategy = "avalanche" | "snowball";

export interface PlanOptions {
  /** PHP paid on top of the minimums every month. */
  extra: number;
  /** Philippine cards usually quote a monthly rate (about 3%); loans often a yearly one. */
  ratePer: "year" | "month";
  /** "YYYY-MM": the month of the first payment. */
  startMonth: string;
}

export interface PayoffPlan {
  strategy: PayoffStrategy | "minimum";
  /** False when the payments never catch up with the interest (or it would take over 50 years). */
  feasible: boolean;
  months: number;
  /** "YYYY-MM" of the last payment; null when not feasible. */
  debtFreeMonth: string | null;
  totalInterest: number;
  totalPaid: number;
  /** Debts in the order they are cleared, with the month each one is. */
  order: { id: string; name: string; paidOffMonth: string | null }[];
}

const MAX_MONTHS = 600;

/** A debt with no saved minimum pays its interest plus 1% of the balance, at least ₱500 (or what is left). */
export function assumedMinimum(debt: Pick<PlanDebt, "balance" | "rate">, ratePer: PlanOptions["ratePer"]): number {
  const interest = debt.balance * monthlyRate(debt.rate, ratePer);
  return Math.min(debt.balance, Math.max(500, Math.ceil(interest + debt.balance * 0.01)));
}

function monthlyRate(rate: number | null, ratePer: PlanOptions["ratePer"]) {
  if (!rate || rate <= 0) return 0;
  return ratePer === "month" ? rate / 100 : rate / 100 / 12;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Month by month: interest is added, every debt gets its minimum, and whatever the budget has left
 * (the extra plus the minimums of debts already cleared) goes to one target debt: the highest rate
 * (avalanche, least interest) or the smallest balance (snowball, quickest wins). "minimum" pays only
 * the minimums and never rolls a cleared debt's payment over, the baseline "interest saved" compares to.
 */
export function payoffPlan(debts: readonly PlanDebt[], strategy: PayoffStrategy | "minimum", options: PlanOptions): PayoffPlan {
  const open = debts.filter((d) => d.balance > 0.005).map((d) => ({
    ...d,
    left: d.balance,
    monthly: monthlyRate(d.rate, options.ratePer),
    minimum: d.minPayment && d.minPayment > 0 ? d.minPayment : assumedMinimum(d, options.ratePer),
    paidOffMonth: null as string | null,
  }));
  const budget = open.reduce((sum, d) => sum + d.minimum, 0) + (strategy === "minimum" ? 0 : Math.max(0, options.extra));
  let totalInterest = 0, totalPaid = 0, months = 0;
  while (open.some((d) => d.left > 0.005) && months < MAX_MONTHS) {
    const month = addMonths(options.startMonth, months);
    months++;
    const active = open.filter((d) => d.left > 0.005);
    for (const d of active) {
      const interest = cents(d.left * d.monthly);
      d.left += interest;
      totalInterest += interest;
    }
    let pool = strategy === "minimum" ? 0 : budget;
    for (const d of active) {
      const pay = Math.min(d.minimum, d.left);
      d.left = cents(d.left - pay);
      totalPaid += pay;
      if (strategy !== "minimum") pool -= pay;
    }
    if (strategy !== "minimum") {
      const targets = active.filter((d) => d.left > 0.005).sort(strategy === "avalanche"
        ? (a, b) => b.monthly - a.monthly || a.left - b.left || a.id.localeCompare(b.id)
        : (a, b) => a.left - b.left || b.monthly - a.monthly || a.id.localeCompare(b.id));
      for (const d of targets) {
        if (pool <= 0.005) break;
        const pay = Math.min(pool, d.left);
        d.left = cents(d.left - pay);
        totalPaid += pay;
        pool -= pay;
      }
    }
    for (const d of active) if (d.left <= 0.005 && !d.paidOffMonth) d.paidOffMonth = month;
  }
  const feasible = open.every((d) => d.paidOffMonth);
  const order = [...open].sort((a, b) => (a.paidOffMonth ?? "9999").localeCompare(b.paidOffMonth ?? "9999") || a.name.localeCompare(b.name))
    .map((d) => ({ id: d.id, name: d.name, paidOffMonth: d.paidOffMonth }));
  return {
    strategy, feasible, months: feasible ? months : 0,
    debtFreeMonth: feasible && open.length ? addMonths(options.startMonth, months - 1) : null,
    totalInterest: cents(totalInterest), totalPaid: cents(totalPaid), order,
  };
}

/** Both strategies against paying only the minimums. `saved` is interest avoided; null when the baseline never finishes. */
export function comparePayoff(debts: readonly PlanDebt[], options: PlanOptions) {
  const minimum = payoffPlan(debts, "minimum", options);
  const plans = (["avalanche", "snowball"] as const).map((strategy) => {
    const plan = payoffPlan(debts, strategy, options);
    return { ...plan, saved: minimum.feasible && plan.feasible ? cents(minimum.totalInterest - plan.totalInterest) : null,
      monthsSooner: minimum.feasible && plan.feasible ? minimum.months - plan.months : null };
  });
  return { minimum, avalanche: plans[0], snowball: plans[1] };
}
