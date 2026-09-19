import "server-only";
import { env } from "@/lib/env";

/*
 * External quote/FX providers. Every call has a timeout and is never cached; callers treat
 * failures as non-fatal (keep the old price, report the reason).
 *  - CoinGecko  /simple/price  — crypto, priced directly in the holding's currency
 *  - Finnhub    /quote         — US stocks & ETFs (USD)
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

/** US stock/ETF quote in USD. Returns null for unknown tickers (Finnhub answers 200 with zeros). */
export async function fetchFinnhubQuote(symbol: string): Promise<Quote | null> {
  const key = env.finnhubApiKey();
  if (!key) throw new PriceError("FINNHUB_API_KEY is not set");
  const { status, body } = await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}`, {
    "X-Finnhub-Token": key,
  });
  if (status === 401) throw new PriceError("Finnhub rejected the API key");
  if (status === 403) throw new PriceError("Not on Finnhub's free plan (US listings only)");
  if (status === 429) throw new PriceError("Finnhub rate limit hit");
  if (status !== 200) throw new PriceError(`Finnhub returned HTTP ${status}`);

  const q = body as { c?: number; t?: number } | null;
  if (!q?.c && !q?.t) return null;
  return { price: q.c ?? 0, asOf: q.t ? new Date(q.t * 1000) : new Date() };
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

/** One quote for a single auto-priced holding — used to validate ids/tickers on save. */
export async function fetchQuote(source: "coingecko" | "finnhub", ref: string, currency: string): Promise<Quote | null> {
  if (source === "finnhub") return fetchFinnhubQuote(ref);
  const hit = (await fetchCoinGeckoPrices([ref], [currency])).get(ref);
  const price = hit?.prices[currency.toLowerCase()];
  return hit && price != null ? { price, asOf: hit.asOf } : null;
}
