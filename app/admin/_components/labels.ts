/*
 * The admin's words for things that show on more than one page, so the same state never has two
 * names (a stale manual value was "Value due" on the Overview and "worth checking" on Accounts).
 */

export const TERMS = {
  income: "Income",
  /** Money out, actual or scheduled. Never "Expenses" on one page and "Spending" on another. */
  spending: "Spending",
  net: "Net",
  /** An amount nobody knows yet. Compact spots (tiles, cells) show "—" with this as its accessible name. */
  noData: "No data",
  /** A value entered by hand more than STALE_MANUAL_DAYS ago. */
  valueDue: "Value due",
  /** A debt balance entered by hand more than STALE_MANUAL_DAYS ago. */
  balanceDue: "Balance due",
} as const;

/** The marker beside a hand-entered account that hasn't been updated in a while. */
export function staleLabel(kind: "holding" | "debt"): string {
  return kind === "debt" ? TERMS.balanceDue : TERMS.valueDue;
}

const ENTRY_KIND_LABELS: Record<string, string> = {
  // Imported entries (lib/finance/imports/types.ts ENTRY_KINDS)
  payment: "Payment",
  transfer: "Transfer",
  reward: "Reward",
  dividend: "Dividend",
  interest: "Interest",
  fee: "Fee",
  tax: "Tax",
  trade: "Trade",
  other: "Other",
  // Cash flows and category rules
  income: TERMS.income,
  expense: TERMS.spending,
};

/** A stored kind (`expense`, `dividend`, …) in plain words. Unknown kinds are capitalised, never shown raw. */
export function entryKindLabel(kind: string): string {
  return ENTRY_KIND_LABELS[kind] ?? humanize(kind);
}

// ENTRY_STATUSES; the History page's Statuses note uses these same words.
const ENTRY_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  posted: "Posted",
  reviewed: "Reviewed",
  ignored: "Ignored",
  transfer: "Transfer",
};

/** A stored import status in plain words, matching the History page's explanation. */
export function entryStatusLabel(status: string): string {
  return ENTRY_STATUS_LABELS[status] ?? humanize(status);
}

function humanize(value: string): string {
  const words = value.replace(/[_-]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}
