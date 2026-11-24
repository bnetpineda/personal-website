import type { CategoryRule, ImportedEntry } from "@/lib/db/schema";
import { isBank } from "../connections/types";
import { CURRENCIES } from "../constants";
import { daysBetween } from "../dates";
import type { ImportEntry } from "./types";

export function canPost(entry: Pick<ImportEntry, "provider" | "currency" | "kind" | "amount">) {
  return entry.provider !== "binance" && entry.provider !== "hyperliquid" && entry.kind !== "trade" && entry.amount !== 0 &&
    (CURRENCIES as readonly string[]).includes(entry.currency) && Math.abs(entry.amount) >= 0.005;
}

export function matchingRule(entry: ImportEntry, rules: CategoryRule[]): CategoryRule | null {
  if (!canPost(entry) || entry.kind === "transfer" || entry.kind === "other") return null;
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
