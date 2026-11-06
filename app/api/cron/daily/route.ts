import { createHash, timingSafeEqual } from "node:crypto";
import { pruneLoginAttempts } from "@/lib/auth/rate-limit";
import { postDueRecurring, refreshRates } from "@/lib/finance/service";
import { resealAllCredentials, syncAllAccounts } from "@/lib/finance/connections/service";
import { applyCategoryRules } from "@/lib/finance/imports/service";
import { categorizeQuietly } from "@/lib/finance/imports/ai-service";
import { syncInvestmentHistory } from "@/lib/finance/imports/history-service";
import { recordPortfolioQuietly } from "@/lib/finance/portfolio";
import { writeAiSummaryQuietly } from "@/lib/finance/ai-summary-service";

// Vercel Cron: sync accounts, refresh FX, record net worth and each account's value, post recurring entries, then categorize imports.
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
  const summary = await refreshRates();
  await recordPortfolioQuietly();
  const recurring = await postDueRecurring();
  const imports = await applyCategoryRules();
  // Rules first: the model only sees what the person's own rules leave pending.
  const ai = await categorizeQuietly();
  await pruneLoginAttempts();
  // Paused accounts don't sync, so their credentials move to CREDENTIALS_SECRET here. Never throws.
  const resealed = await resealAllCredentials();
  // Last, so it sees today's synced balances and filed entries; skipped when nothing changed. Never throws.
  const feedback = await writeAiSummaryQuietly();
  return Response.json({ ...summary, recurring, connections, imports, ai, history, resealed, feedback }, { headers: { "Cache-Control": "private, no-store" } });
}
