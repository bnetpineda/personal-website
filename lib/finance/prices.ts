import "server-only";
import { env } from "@/lib/env";

/*
 * External quote/FX providers. Every call has a timeout and is never cached; callers treat
 * failures as non-fatal (keep the old price, report the reason).
 *  - CoinGecko  /simple/price  — crypto prices for synced Binance balances
 *  - Frankfurter v2 /rate      — ECB reference FX rates → PHP
 */

const TIMEOUT_MS = 8000;

export class PriceError extends Error {}

export interface Quote {
  price: number;
  asOf: Date;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...headers },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Error pages aren't always JSON; the status code is enough.
  }
  return { status: res.status, body };
}

/** Batched crypto prices. Unknown ids are silently absent from the result. */
export async function fetchCoinGeckoPrices(
  ids: string[],
  currencies: string[]
): Promise<Map<string, { prices: Record<string, number>; asOf: Date }>> {
  const params = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: [...new Set(currencies.map((c) => c.toLowerCase()))].join(","),
    include_last_updated_at: "true",
  });
  const key = env.coingeckoApiKey();
  const { status, body } = await getJson(
    `https://api.coingecko.com/api/v3/simple/price?${params}`,
    key ? { "x-cg-demo-api-key": key } : {}
  );
  if (status === 429) throw new PriceError("CoinGecko rate limit hit — set a free COINGECKO_API_KEY");
  if (status !== 200 || typeof body !== "object" || body === null) {
    throw new PriceError(`CoinGecko returned HTTP ${status}`);
  }

  const result = new Map<string, { prices: Record<string, number>; asOf: Date }>();
  for (const [id, raw] of Object.entries(body as Record<string, Record<string, number>>)) {
    const { last_updated_at: updatedAt, ...prices } = raw;
    result.set(id, { prices, asOf: updatedAt ? new Date(updatedAt * 1000) : new Date() });
  }
  return result;
}

/** PHP per 1 unit of `currency`, from ECB reference rates. */
export async function fetchFxRate(currency: string): Promise<{ rate: number; asOf: string }> {
  const { status, body } = await getJson(`https://api.frankfurter.dev/v2/rate/${encodeURIComponent(currency)}/PHP`);
  const r = body as { rate?: number; date?: string } | null;
  if (status !== 200 || typeof r?.rate !== "number" || !r.date) {
    throw new PriceError(`No FX rate for ${currency} (HTTP ${status})`);
  }
  return { rate: r.rate, asOf: r.date };
}

/** PHP per 1 unit of `currency` on each day the provider published from `from` to `to` (inclusive). */
export async function fetchFxRates(currency: string, from: string, to: string): Promise<{ on: string; rate: number }[]> {
  const params = new URLSearchParams({ base: currency, quotes: "PHP", from, to });
  const { status, body } = await getJson(`https://api.frankfurter.dev/v2/rates?${params}`);
  if (status !== 200 || !Array.isArray(body)) throw new PriceError(`No FX history for ${currency} (HTTP ${status})`);
  return body.flatMap((row: { date?: unknown; rate?: unknown; quote?: unknown }) =>
    typeof row?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && typeof row.rate === "number" && row.rate > 0 && (row.quote ?? "PHP") === "PHP"
      ? [{ on: row.date, rate: row.rate }] : []);
}
