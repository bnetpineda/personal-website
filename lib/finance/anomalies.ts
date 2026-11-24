import { PROVIDER_META, type Provider } from "./connections/types";
import { addDays, dayLabel } from "./dates";
import { nextDueDate } from "./debt";
import type { FinanceNotification } from "./notifications";
import { payeeKey, payeeOf } from "./payee";

/*
 * Alerts that come from the money itself rather than from an account: a category running well above
 * its usual month, a big payment to someone new, the same charge from two banks, a subscription
 * that went up, and a debt payment coming due. Each key names one episode, so a dismissal sticks
 * until something new happens. Details never carry amounts: alerts aren't blurred by privacy mode.
 */

/** A category this many times its usual month is worth a look… */
export const SPIKE_RATIO = 1.5;
/** …once it's at least this much above usual, in PHP, so small categories don't cry wolf. */
export const SPIKE_MIN_EXCESS_PHP = 1_000;
/** A first payment to a payee at least this large, in PHP. */
export const LARGE_NEW_PAYEE_PHP = 5_000;
/** How far back the payment-level checks look, in days. */
export const NEW_PAYEE_DAYS = 14;
export const DOUBLE_CHARGE_DAYS = 30;
export const PRICE_RISE_DAYS = 45;

export interface CategorySpending {
  id: number;
  name: string;
  /** PHP spent so far this month. */
  spent: number;
  /** PHP spent in each of the last three complete months, oldest first. */
  previous: [number, number, number];
  /** A budget alert already covers it. */
  budgeted: boolean;
}

export interface RecentExpense {
  id: string;
  description: string;
  amount: number;
  currency: string;
  amountPhp: number;
  occurredOn: string;
}

export interface BankCharge {
  id: string;
  provider: Provider;
  occurredOn: string;
  /** Negative: money out. */
  amount: number;
  currency: string;
  description: string;
}

export interface Subscription {
  id: string;
  description: string;
  amount: number;
  currency: string;
}

export interface DebtDue {
  id: string;
  name: string;
  dueDay: number | null;
  /** The latest payment recorded with Pay, if any. */
  lastPaidOn: string | null;
}

export function categorySpikes(categories: readonly CategorySpending[], month: string): FinanceNotification[] {
  return categories.flatMap((c) => {
    if (c.budgeted) return [];
    const usualMonths = c.previous.filter((v) => v > 0).length;
    const average = c.previous.reduce((sum, v) => sum + v, 0) / 3;
    // Two of three months with spending, or it isn't a habit to compare against.
    if (usualMonths < 2 || average <= 0 || c.spent < average * SPIKE_RATIO || c.spent - average < SPIKE_MIN_EXCESS_PHP) return [];
    const ratio = Math.floor((c.spent / average) * 10) / 10;
    const title = `${c.name} spending is up`;
    return [{ key: `spike:${month}:${c.id}`, type: "spending" as const, title, label: title, severity: "warning" as const,
      detail: `This month is already ${ratio}× your average month over the last three. Check for one-off or doubled charges.`,
      href: `/admin?kind=expense&month=${month}&category=${c.id}` }];
  });
}

const usable = (key: string) => key.replace(/\s/g, "").length >= 3;

/**
 * Large payments in the last two weeks to a payee with no earlier entry. `known` holds the payee keys of
 * older expenses that look like these payees; `history` counts all older expenses. With too little history
 * every payee looks new, so the check waits for some.
 */
export function newPayees(expenses: readonly RecentExpense[], known: ReadonlySet<string>, history: number, today: string): FinanceNotification[] {
  if (history < 20) return [];
  const since = addDays(today, -NEW_PAYEE_DAYS), seen = new Set<string>();
  return [...expenses].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id.localeCompare(b.id)).flatMap((e) => {
    const key = payeeKey(e.description);
    if (e.occurredOn < since || e.amountPhp < LARGE_NEW_PAYEE_PHP || !usable(key) || known.has(key) || seen.has(key)) return [];
    seen.add(key);
    const payee = payeeOf(e.description);
    return [{ key: `new-payee:${e.id}`, type: "spending" as const, title: `First large payment to ${payee}`, label: `First large payment to ${payee}`,
      severity: "warning" as const, detail: `On ${dayLabel(e.occurredOn)}, and nothing earlier went to this payee. Make sure you recognize it.`,
      href: `/admin?q=${encodeURIComponent(payee)}` }];
  });
}

/** The same payee and amount on the same day from two different banks: paid twice, or one statement imported under two banks. */
export function doubleCharges(charges: readonly BankCharge[], today: string): FinanceNotification[] {
  const since = addDays(today, -DOUBLE_CHARGE_DAYS);
  const groups = new Map<string, BankCharge[]>();
  for (const c of charges) {
    const payee = payeeKey(c.description);
    if (c.amount >= 0 || c.occurredOn < since || !usable(payee)) continue;
    const key = [c.occurredOn, c.currency, Math.round(Math.abs(c.amount) * 100), payee].join("|");
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.values()].flatMap((group) => {
    const banks = [...new Set(group.map((c) => c.provider))];
    if (banks.length < 2) return [];
    const [first] = group, payee = payeeOf(first.description);
    const ids = group.map((c) => c.id).sort();
    return [{ key: `double:${ids.join(":")}`, type: "spending" as const, title: `Possible double charge: ${payee}`, label: `Possible double charge: ${payee}`,
      severity: "warning" as const,
      detail: `The same amount is in ${banks.map((b) => PROVIDER_META[b].name).join(" and ")} on ${dayLabel(first.occurredOn)}. If it's one payment, ignore the extra one in Bank activity.`,
      href: `/admin/connections/activity?q=${encodeURIComponent(payee)}` }];
  });
}

/** Does this charge come from that subscription? Same payee, or the subscription's name as whole words in it. */
export function sameSubscription(subscription: string, charge: string) {
  const sub = payeeKey(subscription), paid = payeeKey(charge);
  if (!usable(sub) || !usable(paid)) return false;
  return sub === paid || (sub.length >= 4 && ` ${paid} `.includes(` ${sub} `));
}

/** A charge from a recurring expense's payee, in its currency, above the amount the schedule expects. */
export function priceRises(subscriptions: readonly Subscription[], expenses: readonly RecentExpense[], today: string): FinanceNotification[] {
  const since = addDays(today, -PRICE_RISE_DAYS);
  return subscriptions.flatMap((s) => {
    const higher = expenses.filter((e) => e.occurredOn >= since && e.currency === s.currency && e.amount > s.amount * 1.01 + 0.5 && sameSubscription(s.description, e.description))
      .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id));
    const latest = higher[0];
    if (!latest) return [];
    return [{ key: `price-up:${s.id}:${latest.id}`, type: "spending" as const, title: `${s.description} charged more than usual`, label: `${s.description} charged more than usual`,
      severity: "warning" as const, detail: `The charge on ${dayLabel(latest.occurredOn)} is higher than the amount in Recurring. Update the schedule if the price went up.`,
      href: "/admin/recurring" }];
  });
}

/** A debt's payment due within three days, unless one was recorded in the 20 days before it. */
export function debtReminders(debts: readonly DebtDue[], today: string): FinanceNotification[] {
  return debts.flatMap((d) => {
    if (!d.dueDay) return [];
    const due = nextDueDate(d.dueDay, today);
    if (due.inDays > 3 || (d.lastPaidOn && d.lastPaidOn >= addDays(due.date, -20))) return [];
    const title = `${d.name} payment ${due.inDays === 0 ? "is due today" : "is coming up"}`;
    return [{ key: `debt:${d.id}:${due.date}`, type: "debt" as const, title, label: title, severity: "warning" as const,
      detail: `Due ${due.inDays === 0 ? "today" : dayLabel(due.date)}. Record it with Pay under Debts once it's paid.`, href: "/admin/connections#debts" }];
  });
}
