import { getExportData } from "@/lib/dal";
import { todayManila } from "@/lib/finance/dates";

/** JSON backup of every finance table (auth-checked inside getExportData). */
export async function GET() {
  const data = await getExportData();
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="finance-export-${todayManila()}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
