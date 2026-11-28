import type { CashFlowKind } from "../constants";
import { isGenericDescription, payeeKey, payeeOf } from "../payee";

/** An imported entry the model filed under Other: it was not sure. */
export interface UnsureEntry { description: string; kind: CashFlowKind; amountPhp: number; occurredOn: string; aiReason: string | null }

/** One payee to teach once: every unsure payment from or to it, and the model's closest guess. */
export interface TeachGroup { key: string; payee: string; kind: CashFlowKind; count: number; totalPhp: number; lastOn: string; guess: string | null;
  /** Entries whose closest guess was `guess`. */
  guessCount: number;
  /** The largest single payment, in PHP. */
  maxPhp: number }

/** "Jev: Other, closest Family & Gifts (55% likely)" → "Family & Gifts". */
export function closestGuess(aiReason: string | null): string | null {
  return /closest (.+?) \(\d+% likely\)/.exec(aiReason ?? "")?.[1] ?? null;
}

/** Unsure entries grouped by payee and direction, biggest money first. */
export function teachGroups(entries: UnsureEntry[]): TeachGroup[] {
  const groups = new Map<string, TeachGroup & { guesses: Map<string, number> }>();
  for (const entry of entries) {
    // Generic channel lines ("QR payment", "Refund for card payment") name no payee: a blanket rule would misfile every future one.
    if (isGenericDescription(entry.description)) continue;
    const key = `${payeeKey(entry.description)}|${entry.kind}`;
    const group = groups.get(key) ?? { key, payee: payeeOf(entry.description), kind: entry.kind, count: 0, totalPhp: 0, lastOn: entry.occurredOn, guess: null, guessCount: 0, maxPhp: 0, guesses: new Map() };
    group.count++;
    group.totalPhp += entry.amountPhp;
    group.maxPhp = Math.max(group.maxPhp, entry.amountPhp);
    if (entry.occurredOn >= group.lastOn) { group.lastOn = entry.occurredOn; group.payee = payeeOf(entry.description); }
    const guess = closestGuess(entry.aiReason);
    if (guess) group.guesses.set(guess, (group.guesses.get(guess) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ guesses, ...group }) => {
    const [guess, guessCount] = [...guesses].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    return { ...group, totalPhp: Math.round(group.totalPhp * 100) / 100, guess, guessCount };
  }).sort((a, b) => b.totalPhp - a.totalPhp || a.payee.localeCompare(b.payee));
}

/** A payee the daily job sorted on its own, shown with Undo. */
export interface AutoTaughtRow { id: string; payee: string; category: string; entries: number; createdAt: Date }

/** Auto-sorting a payee needs the model to agree with itself this often, on payments this small. */
export const AUTO_TEACH = { minAgreeing: 3, share: 2 / 3, maxPhp: 5000 } as const;

/**
 * Payees the model keeps guessing the same way, safe to file without asking: spending only (income
 * feeds the tax estimate), at least three payments with the same closest guess and few that disagree,
 * none of them large, and a guess that names a real category. A payee the person un-did stays theirs.
 */
export function autoTeachPicks(groups: TeachGroup[], categories: { id: number; name: string; kind: CashFlowKind; archived: boolean }[], declined: ReadonlySet<string>) {
  return groups.flatMap((group) => {
    if (group.kind !== "expense" || !group.guess || declined.has(group.key)) return [];
    if (group.guessCount < AUTO_TEACH.minAgreeing || group.guessCount < group.count * AUTO_TEACH.share || group.maxPhp >= AUTO_TEACH.maxPhp) return [];
    const category = categories.find((c) => c.kind === "expense" && !c.archived && c.name === group.guess && c.name !== "Other");
    return category ? [{ group, category }] : [];
  });
}
