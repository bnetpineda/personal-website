import { dayRangeLabel, fullDayLabel } from "./dates";

/*
 * Search filters for Transactions, read from the URL. Pure (no I/O), shared by the Overview's
 * Activity panel and the CSV export so both list exactly the same entries.
 */

export interface EntryFilters {
  /** Words to find in the description, notes, account or category. */
  q: string;
  /** Inclusive dates, YYYY-MM-DD. */
  from: string | null;
  to: string | null;
  /** Inclusive PHP amounts. */
  min: number | null;
  max: number | null;
  /** Exactly this account ("Paid with" / "Received in"). */
  account: string | null;
}

/** Entries shown per page of an all-time search; each "Show more" adds another page. */
export const SEARCH_PAGE_SIZE = 200;
/** Pages a search can grow to (5,000 entries). */
export const MAX_SEARCH_PAGES = 25;

const DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

type Raw = Record<string, string | string[] | undefined | null>;
const one = (params: Raw, key: string) => {
  const v = params[key];
  return typeof v === "string" ? v.trim() : Array.isArray(v) && typeof v[0] === "string" ? v[0].trim() : "";
};
const day = (value: string) => (DAY.test(value) && !Number.isNaN(Date.parse(value)) ? value : null);
const amount = (value: string) => {
  if (!value) return null;
  const n = Number(value.replace(/[,₱\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseEntryFilters(params: Raw): EntryFilters {
  let from = day(one(params, "from"));
  let to = day(one(params, "to"));
  if (from && to && from > to) [from, to] = [to, from];
  let min = amount(one(params, "min"));
  let max = amount(one(params, "max"));
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return { q: one(params, "q").slice(0, 100), from, to, min, max, account: one(params, "account").slice(0, 60) || null };
}

/** Any filter beyond the month: the list becomes a search across all months. */
export function isSearching(f: EntryFilters): boolean {
  return Boolean(f.q || f.from || f.to || f.min != null || f.max != null || f.account);
}

/** The filters as URL params (blank ones left out), for links and the export. */
export function entryFilterParams(f: Partial<EntryFilters>): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.min != null) out.min = String(f.min);
  if (f.max != null) out.max = String(f.max);
  if (f.account) out.account = f.account;
  return out;
}

/**
 * The date filter in words ("Jan 1 – Mar 31, 2026", "from Fri, Jan 2, 2026"). Built on the server:
 * Intl's range format differs slightly between Node and browsers, which would break hydration.
 */
export function filterDatesLabel(f: Pick<EntryFilters, "from" | "to">): string | null {
  if (f.from && f.to) return dayRangeLabel(f.from, f.to);
  if (f.from) return `from ${fullDayLabel(f.from)}`;
  if (f.to) return `until ${fullDayLabel(f.to)}`;
  return null;
}

export function searchPage(params: Raw): number {
  const n = Math.floor(Number(one(params, "page")));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_SEARCH_PAGES) : 1;
}

/* ---- CSV ---- */

/**
 * One CSV cell. Quotes when needed, and neutralizes text a spreadsheet would run as a formula
 * (a description starting with "=", "+", "-", "@" or a tab), since descriptions come from banks.
 */
export function csvCell(value: string | number | null | undefined, text = true): string {
  if (value == null) return "";
  let s = String(value);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvEntry {
  occurredOn: string;
  kind: "income" | "expense";
  description: string;
  categoryName: string;
  account: string | null;
  amount: number;
  currency: string;
  amountPhp: number;
  notes: string | null;
}

export const CSV_HEADER = ["Date", "Type", "Description", "Category", "Account", "Amount", "Currency", "Amount (PHP)", "Notes"];

/** Entries as CSV with a header row; spending is negative, so a column sum is the net. CRLF line ends, per RFC 4180. */
export function entriesCsv(entries: readonly CsvEntry[]): string {
  const sign = (e: CsvEntry) => (e.kind === "expense" ? -1 : 1);
  const rows = entries.map((e) => [
    csvCell(e.occurredOn, false),
    csvCell(e.kind === "expense" ? "Spending" : "Income"),
    csvCell(e.description),
    csvCell(e.categoryName),
    csvCell(e.account),
    csvCell((sign(e) * e.amount).toFixed(2), false),
    csvCell(e.currency),
    csvCell((sign(e) * e.amountPhp).toFixed(2), false),
    csvCell(e.notes),
  ].join(","));
  return [CSV_HEADER.join(","), ...rows].join("\r\n") + "\r\n";
}
