import "server-only";
import { cache } from "react";
import { count, inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { importedEntries } from "@/lib/db/schema";
import { STATEMENT_PROVIDERS } from "./coverage";

/**
 * Months with imported bank-statement activity, per bank, for statementCoverage(). The Overview, Needs you
 * and the AI summary all read it; cache() runs it once per request. No auth check: callers do that.
 */
export const loadStatementMonths = cache(async () => {
  const e = importedEntries;
  return getDb()
    .select({ provider: e.provider, month: sql<string>`to_char(${e.occurredOn}, 'YYYY-MM')`, entries: count(), importedAt: max(e.createdAt) })
    .from(e).where(inArray(e.provider, [...STATEMENT_PROVIDERS])).groupBy(e.provider, sql`2`);
});
