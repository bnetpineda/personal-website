import { createHash, timingSafeEqual } from "node:crypto";
import { pruneLoginAttempts } from "@/lib/auth/rate-limit";
import { postDueRecurring, refreshAllPrices } from "@/lib/finance/service";
import { syncAllAccounts } from "@/lib/finance/connections/service";
import { applyCategoryRules } from "@/lib/finance/imports/service";
import { categorizeQuietly } from "@/lib/finance/imports/ai-service";
import { syncInvestmentHistory } from "@/lib/finance/imports/history-service";

// Vercel Cron: sync accounts, refresh prices + FX, record net worth, post recurring entries, then categorize imports.
export const maxDuration = 300;

/** Vercel sends `Authorization: Bearer $CRON_SECRET`. Digests keep the comparison length-safe. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = createHash("sha256").update(request.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [connections, history] = await Promise.all([syncAllAccounts(), syncInvestmentHistory()]);
  const summary = await refreshAllPrices();
  const recurring = await postDueRecurring();
  const imports = await applyCategoryRules();
  // Rules first: the model only sees what the person's own rules leave pending.
  const ai = await categorizeQuietly();
  await pruneLoginAttempts();
  return Response.json({ ...summary, recurring, connections, imports, ai, history }, { headers: { "Cache-Control": "private, no-store" } });
}
