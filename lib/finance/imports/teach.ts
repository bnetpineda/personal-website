import type { CashFlowKind } from "../constants";
import { payeeKey, payeeOf } from "../payee";

/** An imported entry the model filed under Other: it was not sure. */
export interface UnsureEntry { description: string; kind: CashFlowKind; amountPhp: number; occurredOn: string; aiReason: string | null }

/** One payee to teach once: every unsure payment from or to it, and the model's closest guess. */
export interface TeachGroup { key: string; payee: string; kind: CashFlowKind; count: number; totalPhp: number; lastOn: string; guess: string | null }

/** "Jev: Other, closest Family & Gifts (55% likely)" → "Family & Gifts". */
export function closestGuess(aiReason: string | null): string | null {
  return /closest (.+?) \(\d+% likely\)/.exec(aiReason ?? "")?.[1] ?? null;
}

/** Unsure entries grouped by payee and direction, biggest money first. */
export function teachGroups(entries: UnsureEntry[]): TeachGroup[] {
  const groups = new Map<string, TeachGroup & { guesses: Map<string, number> }>();
  for (const entry of entries) {
    const key = `${payeeKey(entry.description)}|${entry.kind}`;
    const group = groups.get(key) ?? { key, payee: payeeOf(entry.description), kind: entry.kind, count: 0, totalPhp: 0, lastOn: entry.occurredOn, guess: null, guesses: new Map() };
    group.count++;
    group.totalPhp += entry.amountPhp;
    if (entry.occurredOn >= group.lastOn) { group.lastOn = entry.occurredOn; group.payee = payeeOf(entry.description); }
    const guess = closestGuess(entry.aiReason);
    if (guess) group.guesses.set(guess, (group.guesses.get(guess) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ guesses, ...group }) => ({
    ...group, totalPhp: Math.round(group.totalPhp * 100) / 100,
    guess: [...guesses].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  })).sort((a, b) => b.totalPhp - a.totalPhp || a.payee.localeCompare(b.payee));
}
