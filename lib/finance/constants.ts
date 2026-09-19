/*
 * Single source of truth for finance enums, labels and colors.
 * Imported by the DB schema (pgEnum values), server code and client components alike,
 * so it must stay free of server-only imports.
 */

export const BASE_CURRENCY = "PHP";
export const TIMEZONE = "Asia/Manila";

export const ASSET_CLASSES = ["stock", "etf", "crypto", "fund", "bond", "cash", "real_estate", "other"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ASSET_CLASS_META: Record<AssetClass, { label: string; plural: string; color: string }> = {
  stock: { label: "Stock", plural: "Stocks", color: "var(--chart-2)" },
  etf: { label: "ETF", plural: "ETFs", color: "var(--chart-5)" },
  crypto: { label: "Crypto", plural: "Crypto", color: "var(--chart-4)" },
  fund: { label: "Fund", plural: "Funds / UITF", color: "var(--chart-6)" },
  bond: { label: "Bond", plural: "Bonds", color: "var(--chart-7)" },
  cash: { label: "Cash", plural: "Cash", color: "var(--chart-1)" },
  real_estate: { label: "Real estate", plural: "Real estate", color: "var(--chart-8)" },
  other: { label: "Other", plural: "Other", color: "var(--chart-9)" },
};

export const PRICE_SOURCES = ["manual", "coingecko", "finnhub"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  manual: "Manual",
  coingecko: "CoinGecko",
  finnhub: "Finnhub",
};

export const CASH_FLOW_KINDS = ["income", "expense"] as const;
export type CashFlowKind = (typeof CASH_FLOW_KINDS)[number];

export const LIABILITY_KINDS = ["credit_card", "loan", "bnpl", "other"] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

export const LIABILITY_KIND_LABELS: Record<LiabilityKind, string> = {
  credit_card: "Credit card",
  loan: "Loan",
  bnpl: "Buy now, pay later",
  other: "Other",
};

/** Fiat currencies supported by both CoinGecko (vs_currencies) and Frankfurter (FX). */
export const CURRENCIES = ["PHP", "USD", "EUR", "JPY", "SGD", "HKD", "GBP", "AUD", "CAD", "CNY", "KRW"] as const;

/** Common tickers → CoinGecko API ids, used to prefill the holding form. */
export const COINGECKO_PRESETS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
  XRP: "ripple",
  BNB: "binancecoin",
  DOGE: "dogecoin",
  ADA: "cardano",
  TON: "the-open-network",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  LTC: "litecoin",
  SUI: "sui",
  SHIB: "shiba-inu",
};

/** Palette offered when creating categories (stored as hex; mirrors the chart tokens). */
export const CATEGORY_COLORS = [
  "#FF4D50",
  "#FF8A3D",
  "#FACC00",
  "#b6f23a",
  "#8AE500",
  "#00B3A4",
  "#0099FF",
  "#7A83FF",
  "#E879F9",
  "#A8A29E",
] as const;

/** Prices from automatic sources older than this are flagged as stale. */
export const STALE_PRICE_MS = 24 * 60 * 60 * 1000;
