import { BASE_CURRENCY } from "./constants";

const cache = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-PH", options);
    cache.set(key, f);
  }
  return f;
}

/** Money amounts: 2 decimals (0 for JPY/KRW), optional +/− sign and compact form. */
export function formatMoney(
  value: number,
  currency: string = BASE_CURRENCY,
  { signed = false, compact = false }: { signed?: boolean; compact?: boolean } = {}
): string {
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency,
    signDisplay: signed ? "exceptZero" : "auto",
    ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : {}),
  };
  return formatter(`m|${currency}|${signed}|${compact}`, options).format(value);
}

export function formatQty(value: number): string {
  return formatter("q", { maximumFractionDigits: 8 }).format(value);
}

/** Ratio → percent (0.1234 → "12.3%"). */
export function formatPct(ratio: number, { signed = false }: { signed?: boolean } = {}): string {
  return formatter(`pct|${signed}`, {
    style: "percent",
    maximumFractionDigits: 1,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(ratio);
}
