import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { statementBalances } from "@/lib/db/schema";
import { getExportData } from "@/lib/dal";
import { todayManila } from "@/lib/finance/dates";

/** JSON backup of every finance table (auth-checked inside getExportData). Restored by Settings -> Backup. */
export async function GET() {
  const data = await getExportData();
  // Bank statement balances count as cash in net worth; queried after getExportData's auth check.
  const balances = await getDb().select().from(statementBalances).orderBy(asc(statementBalances.provider), asc(statementBalances.account), asc(statementBalances.currency));
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), ...data, statementBalances: balances }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="finance-export-${todayManila()}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
