import { payeeKey } from "./payee";

/*
 * What the Add form can work out from a description before the person picks anything: the category,
 * account and currency they used last time for it, and its usual amount. Past entries come first; a
 * category rule ("description contains Grab → Transport") answers for a payee typed for the first time.
 */

export interface EntryHint {
  description: string;
  categoryId: number;
  account: string | null;
  currency: string | null;
  /** The usual amount in `currency`, when past entries agree on one. */
  amount: number | null;
  /** A category rule's "contains" text, not a past description: never offered as a suggestion. */
  rule?: boolean;
}

/**
 * The amount of a fixed-price purchase: the median of the recent ones, but only when there are at
 * least two and they agree (all within 10% of it). Groceries vary, so they get no amount.
 */
export function typicalAmount(amounts: number[]): number | null {
  const sorted = amounts.filter((a) => Number.isFinite(a) && a > 0).sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted.every((a) => Math.abs(a - median) <= median * 0.1) ? Math.round(median * 100) / 100 : null;
}

/**
 * The best match for a typed description, newest hints first: the same description, then the same
 * payee ("Jollibee SM North" ~ "Jollibee"), then the one past description it starts (if every such
 * description is filed the same way), then the longest rule whose text it contains.
 */
export function guessEntry(text: string, hints: readonly EntryHint[]): EntryHint | null {
  const typed = text.trim().toLowerCase();
  if (typed.length < 2) return null;
  const past = hints.filter((h) => !h.rule);
  const exact = past.find((h) => h.description.trim().toLowerCase() === typed);
  if (exact) return exact;
  const key = payeeKey(text);
  const payee = key.length >= 3 ? past.find((h) => payeeKey(h.description) === key) : undefined;
  if (payee) return payee;
  if (typed.length >= 3) {
    const started = past.filter((h) => h.description.toLowerCase().startsWith(typed));
    if (started.length && started.every((h) => h.categoryId === started[0].categoryId)) return started[0];
  }
  const rule = hints.filter((h) => h.rule && h.description.trim().length >= 2 && typed.includes(h.description.trim().toLowerCase()))
    .sort((a, b) => b.description.length - a.description.length)[0];
  return rule ?? null;
}

/** The currency last used with an account ("Wise USD" → USD), so picking the account picks it too. */
export function accountCurrency(account: string, hints: readonly EntryHint[]): string | null {
  const name = account.trim().toLowerCase();
  if (!name) return null;
  return hints.find((h) => !h.rule && h.currency && h.account?.trim().toLowerCase() === name)?.currency ?? null;
}
