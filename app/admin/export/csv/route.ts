import type { NextRequest } from "next/server";
import { MONTH_LIMIT, getCashFlows } from "@/lib/dal";
import { isMonth, todayManila } from "@/lib/finance/dates";
import { entriesCsv, isSearching, parseEntryFilters } from "@/lib/finance/entry-filters";

/**
 * The Activity panel's entries as CSV, for a spreadsheet or an accountant: the same month or search
 * across all months, with the type and category filters on top (auth-checked inside getCashFlows).
 */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const filters = parseEntryFilters(params);
  const month = isMonth(params.month) ? params.month : todayManila().slice(0, 7);
  const kind = params.kind === "income" || params.kind === "expense" ? params.kind : undefined;
  const category = Number(params.category) > 0 ? Number(params.category) : undefined;
  const searching = isSearching(filters);
  const entries = await getCashFlows({ kind, category, month, filters, limit: MONTH_LIMIT });
  const name = searching ? `search-${todayManila()}` : month;
  // A byte-order mark, so Excel reads the file as UTF-8 (₱ and accented names).
  return new Response(`﻿${entriesCsv(entries)}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="transactions-${name}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
