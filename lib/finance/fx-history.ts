import { BASE_CURRENCY } from "./constants";
import { addDays } from "./dates";

/*
 * Pure rules for converting an entry at its own date's exchange rate. The provider skips some days
 * (holidays), so a day uses the latest published rate within a week before it.
 */

/** Entries this many days old or newer use the current rate; it is the same number. */
export const RECENT_DAYS = 2;
/** How far back a published rate may stand in for a day with none. */
export const LOOKBACK_DAYS = 7;

/** A saved current rate older than this is fetched again before use (the daily cron normally keeps it fresh). */
export const FX_STALE_MS = 36 * 60 * 60 * 1000;

/** Currencies whose current rate is missing or was last fetched too long ago. */
export function ratesToFetch(currencies: readonly string[], saved: readonly { currency: string; updatedAt: Date }[], now: Date): string[] {
  const fetched = new Map(saved.map((r) => [r.currency, r.updatedAt.getTime()]));
  return [...new Set(currencies)].filter((c) => {
    if (c === BASE_CURRENCY) return false;
    const at = fetched.get(c);
    return at == null || now.getTime() - at > FX_STALE_MS;
  });
}

export interface DatedRate {
  currency: string;
  on: string;
  rate: number;
}

export interface WantedRate {
  currency: string;
  on: string;
}

export const rateKey = (currency: string, on: string) => `${currency}|${on}`;

/** Wanted (currency, day) pairs that need a dated rate: not PHP and older than the recent window. */
export function datedPairs(wanted: readonly WantedRate[], today: string): WantedRate[] {
  const cutoff = addDays(today, -RECENT_DAYS);
  const seen = new Map<string, WantedRate>();
  for (const w of wanted) if (w.currency !== BASE_CURRENCY && w.on < cutoff) seen.set(rateKey(w.currency, w.on), w);
  return [...seen.values()];
}

/** The latest rate published on or up to a week before `on`, or null. `history` may be in any order. */
export function rateOn(history: readonly DatedRate[], currency: string, on: string): number | null {
  const earliest = addDays(on, -LOOKBACK_DAYS);
  let best: DatedRate | null = null;
  for (const h of history) {
    if (h.currency !== currency || h.on > on || h.on < earliest) continue;
    if (!best || h.on > best.on) best = h;
  }
  return best?.rate ?? null;
}

/** One date range per currency covering every wanted day that has no usable saved rate. */
export function missingRanges(pairs: readonly WantedRate[], history: readonly DatedRate[]): Map<string, { from: string; to: string }> {
  const ranges = new Map<string, { from: string; to: string }>();
  for (const p of pairs) {
    if (rateOn(history, p.currency, p.on) != null) continue;
    const from = addDays(p.on, -LOOKBACK_DAYS);
    const range = ranges.get(p.currency);
    ranges.set(p.currency, range ? { from: from < range.from ? from : range.from, to: p.on > range.to ? p.on : range.to } : { from, to: p.on });
  }
  return ranges;
}
