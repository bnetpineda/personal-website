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

/** Manual accounts are valued by hand ("manual"); the quote sources stay for the database enum. */
export const PRICE_SOURCES = ["manual", "coingecko", "finnhub"] as const;

export const CASH_FLOW_KINDS = ["income", "expense"] as const;
export type CashFlowKind = (typeof CASH_FLOW_KINDS)[number];

export const RECURRENCE_FREQUENCIES = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "quarterly",
  "semiannual",
  "yearly",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  semimonthly: "Twice a month",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  semiannual: "Every 6 months",
  yearly: "Yearly",
};

export const LIABILITY_KINDS = ["credit_card", "loan", "bnpl", "other"] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

export const LIABILITY_KIND_LABELS: Record<LiabilityKind, string> = {
  credit_card: "Credit card",
  loan: "Loan",
  bnpl: "Buy now, pay later",
  other: "Other debt",
};

/**
 * What a goal measures. Every measure but "manual" reads a live figure: net worth, cash (bank balances
 * and cash held in accounts), investments (everything but cash), or the emergency fund, whose target is
 * a number of months of average spending covered by cash.
 */
export const GOAL_MEASURES = ["emergency_fund", "net_worth", "cash", "investments", "manual"] as const;
export type GoalMeasure = (typeof GOAL_MEASURES)[number];

export const GOAL_MEASURE_LABELS: Record<GoalMeasure, string> = {
  emergency_fund: "Emergency fund",
  net_worth: "Net worth",
  cash: "Cash",
  investments: "Investments",
  manual: "Amount I enter",
};

/** Fiat currencies supported by both CoinGecko (vs_currencies) and Frankfurter (FX). */
export const CURRENCIES = ["PHP", "USD", "EUR", "JPY", "SGD", "HKD", "GBP", "AUD", "CAD", "CNY", "KRW"] as const;

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
