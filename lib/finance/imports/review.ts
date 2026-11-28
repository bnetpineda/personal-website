import { SITE } from "@/lib/constants";
import type { CategoryRule, ImportedEntry } from "@/lib/db/schema";
import { isBank } from "../connections/types";
import { CURRENCIES } from "../constants";
import { daysBetween } from "../dates";
import { counterpartyOf, paysAccountHolder } from "../payee";
import type { ImportEntry } from "./types";

export function canPost(entry: Pick<ImportEntry, "provider" | "currency" | "kind" | "amount">) {
  return entry.provider !== "binance" && entry.provider !== "hyperliquid" && entry.kind !== "trade" && entry.amount !== 0 &&
    (CURRENCIES as readonly string[]).includes(entry.currency) && Math.abs(entry.amount) >= 0.005;
}

/** Outgoing Wise transfers to another person carry kind = "transfer"; let explicit rules match them without touching self-transfers or conversions. */
function isThirdPartyBankTransfer(entry: Pick<ImportEntry, "provider" | "kind" | "amount" | "description">, accountHolder: string): boolean {
  if (!isBank(entry.provider) || entry.kind !== "transfer" || entry.amount >= 0) return false;
  const counterparty = counterpartyOf(entry.description);
  return Boolean(counterparty && !paysAccountHolder(counterparty, accountHolder));
}

export function matchingRule(entry: ImportEntry, rules: CategoryRule[], accountHolder = SITE.name): CategoryRule | null {
  if (!canPost(entry) || entry.kind === "other") return null;
  if (entry.kind === "transfer" && !isThirdPartyBankTransfer(entry, accountHolder)) return null;
  const candidates = rules.filter((r) => r.enabled && (!r.provider || r.provider === entry.provider) &&
    r.kind === (entry.amount > 0 ? "income" : "expense") && entry.description.toLowerCase().includes(r.contains.toLowerCase()))
    // Every rule saved today posts automatically; a few old ones only suggested ("Left to AI"). Two
    // equally specific rules for the same category agree, and the one that posts wins.
    .sort((a, b) => b.contains.length - a.contains.length || Number(b.autoPost) - Number(a.autoPost) || a.id.localeCompare(b.id));
  const best = candidates[0];
  if (!best) return null;
  if (candidates.some((r) => r.contains.length === best.contains.length && r.categoryId !== best.categoryId)) return null;
  return best;
}

export type TransferCandidate = Pick<ImportedEntry, "id" | "provider" | "accountKey" | "occurredOn" | "amount" | "currency" | "description" | "kind" | "status">;
export type ReversalCandidate = TransferCandidate & Pick<ImportedEntry, "externalId">;

export function transferEligible(a: TransferCandidate, b: TransferCandidate): boolean {
  return a.id !== b.id && a.status === "pending" && b.status === "pending" &&
    ["payment", "transfer", "other"].includes(a.kind) && ["payment", "transfer", "other"].includes(b.kind) &&
    a.amount * b.amount < 0 && (a.provider !== b.provider || a.accountKey !== b.accountKey || a.currency !== b.currency) &&
    Math.abs(daysBetween(a.occurredOn, b.occurredOn)) <= 7;
}

/** Suggestions are deliberately narrow. Confirmation also supports cross-currency transfers. */
export function transferSuggestions(entries: TransferCandidate[]): [TransferCandidate, TransferCandidate][] {
  const candidates = new Map<string, TransferCandidate[]>();
  for (const a of entries) candidates.set(a.id, entries.filter((b) => transferEligible(a, b) && a.currency === b.currency &&
    Math.abs(a.amount + b.amount) <= Math.max(1e-10, Math.abs(a.amount) * 1e-10)));
  return entries.filter((a) => a.amount < 0 && candidates.get(a.id)?.length === 1)
    .flatMap((a) => { const b = candidates.get(a.id)![0]; return candidates.get(b.id)?.length === 1 ? [[a, b]] : []; });
}

const wiseBaseRef = (externalId: string) => externalId.split(":")[0].replace(/^(?:FEE|CHARGE)[-_]/i, "");

/** Pairs both legs of a Wise currency conversion (same BALANCE-* or CONVERSION-* reference, opposite directions, different currencies). */
export function conversionPairs(entries: ReversalCandidate[]): [ReversalCandidate, ReversalCandidate][] {
  const byRef = new Map<string, ReversalCandidate[]>();
  for (const e of entries) {
    if (e.status !== "pending" || e.provider !== "wise" || e.kind !== "transfer") continue;
    const base = e.externalId.split(":")[0];
    if (!/^(?:BALANCE|CONVERSION)[-_]/i.test(base)) continue;
    const key = `${e.accountKey}|${base.toUpperCase()}`;
    byRef.set(key, [...(byRef.get(key) ?? []), e]);
  }
  const pairs: [ReversalCandidate, ReversalCandidate][] = [];
  for (const group of byRef.values()) {
    if (group.length !== 2) continue;
    const [a, b] = group;
    if (a.amount * b.amount >= 0 || a.currency === b.currency || Math.abs(daysBetween(a.occurredOn, b.occurredOn)) > 7) continue;
    pairs.push(a.amount < 0 ? [a, b] : [b, a]);
  }
  return pairs;
}

export interface ReversalSet { ids: string[]; reason: string }

/**
 * Unambiguous zero-net reversals and card refunds within the same bank account:
 * - Wise rows sharing one reference (including its fee row) whose debit + fee + refund sum to 0.
 * - Same-account card payment + explicit refund row of the exact opposite amount within 7 days.
 */
export function reversalSets(entries: ReversalCandidate[]): ReversalSet[] {
  const pending = entries.filter((e) => e.status === "pending" && isBank(e.provider));
  const used = new Set<string>();
  const sets: ReversalSet[] = [];

  const wiseGroups = new Map<string, ReversalCandidate[]>();
  for (const e of pending) {
    if (e.provider !== "wise") continue;
    const ref = wiseBaseRef(e.externalId);
    if (!ref) continue;
    const key = `${e.accountKey}|${e.currency}|${ref.toUpperCase()}`;
    wiseGroups.set(key, [...(wiseGroups.get(key) ?? []), e]);
  }
  for (const group of wiseGroups.values()) {
    if (group.length < 2) continue;
    const hasDebit = group.some((e) => e.amount < 0), hasCredit = group.some((e) => e.amount > 0);
    if (!hasDebit || !hasCredit) continue;
    const dates = group.map((e) => e.occurredOn).sort();
    if (Math.abs(daysBetween(dates[0], dates.at(-1)!)) > 7) continue;
    const net = group.reduce((sum, e) => sum + e.amount, 0);
    if (Math.abs(net) > 0.005) continue;
    const ids = group.map((e) => e.id);
    for (const id of ids) used.add(id);
    sets.push({ ids, reason: "Reversed Wise transaction" });
  }

  const remaining = pending.filter((e) => !used.has(e.id) && e.kind === "payment");
  const refunds = remaining.filter((e) => e.amount > 0 && /\b(?:refund|reversal)\b/i.test(e.description));
  const debits = remaining.filter((e) => e.amount < 0);
  const matches = (r: ReversalCandidate, d: ReversalCandidate) =>
    r.provider === d.provider && r.accountKey === d.accountKey && r.currency === d.currency &&
    Math.abs(daysBetween(r.occurredOn, d.occurredOn)) <= 7 && Math.abs(r.amount + d.amount) <= 0.005;
  const forRefund = new Map(refunds.map((r) => [r.id, debits.filter((d) => matches(r, d))]));
  const forDebit = new Map(debits.map((d) => [d.id, refunds.filter((r) => matches(r, d))]));
  for (const r of refunds) {
    const candidates = forRefund.get(r.id) ?? [];
    if (candidates.length !== 1) continue;
    const d = candidates[0];
    if ((forDebit.get(d.id)?.length ?? 0) !== 1) continue;
    sets.push({ ids: [d.id, r.id], reason: "Refunded card payment" });
  }
  return sets;
}

/** How a bank import was filed, in Bank activity. A same-day twin of something you logged is told apart from a plain ignore. */
export type BankFiling = "posted" | "transfer" | "ignored" | "duplicate" | "pending" | "investment";

export const DUPLICATE_REASON = "Already in Transactions";

export function bankFiling(e: Pick<ImportedEntry, "status" | "aiReason">): BankFiling {
  if (e.status === "ignored" && e.aiReason?.startsWith(DUPLICATE_REASON)) return "duplicate";
  if (e.status === "reviewed") return "investment";
  return e.status;
}

export const BANK_FILING_LABELS: Record<BankFiling, string> = {
  posted: "In Transactions", transfer: "Transfer", ignored: "Ignored", duplicate: "Already in Transactions", pending: "Waiting for AI", investment: "Investment",
};

/** What a bank import can be re-filed as from Bank activity. */
export function refileChoices(e: Pick<ImportedEntry, "provider" | "kind" | "amount" | "currency" | "status" | "transferId">) {
  const bank = isBank(e.provider);
  return {
    post: bank && e.status !== "posted" && canPost(e),
    transfer: bank && e.status !== "transfer" && ["payment", "transfer", "other"].includes(e.kind),
    ignore: bank && e.status !== "ignored",
    unlink: bank && e.status === "transfer" && e.transferId != null,
  };
}

const POSTED_CASH_KINDS = new Set(["dividend", "interest", "fee", "tax"]);

export function earningsByCurrency(entries: Pick<ImportedEntry, "provider" | "kind" | "status" | "currency" | "amount" | "realizedPnl">[]) {
  const rows = new Map<string, { currency: string; contributions: number; rewards: number; dividends: number; interest: number; fees: number; taxes: number; realized: number | null }>();
  let postedCash = 0;
  for (const e of entries) {
    if (e.status === "ignored" || isBank(e.provider)) continue;
    // Posted cash is on the Overview too; this page is the only place it's added up, so it counts here as well.
    if (e.status === "posted" && POSTED_CASH_KINDS.has(e.kind)) postedCash += 1;
    const row = rows.get(e.currency) ?? { currency: e.currency, contributions: 0, rewards: 0, dividends: 0, interest: 0, fees: 0, taxes: 0, realized: null };
    if (e.status === "transfer") row.contributions += e.amount;
    if (e.kind === "reward") row.rewards += e.amount;
    if (e.kind === "dividend") row.dividends += e.amount;
    if (e.kind === "interest") row.interest += e.amount;
    if (e.kind === "fee") row.fees -= e.amount;
    if (e.kind === "tax") row.taxes -= e.amount;
    if (e.realizedPnl != null) row.realized = (row.realized ?? 0) + e.realizedPnl;
    rows.set(e.currency, row);
  }
  return { rows: [...rows.values()].sort((a, b) => a.currency.localeCompare(b.currency)), postedCash };
}
