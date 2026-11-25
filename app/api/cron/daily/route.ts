import { createHash, timingSafeEqual } from "node:crypto";
import { runDailyJob } from "@/lib/finance/daily-job";
import { recordDailyRun } from "@/lib/finance/daily-runs";

// Vercel Cron: post recurring entries and file imports, sync accounts, record net worth and each account's value, then categorize.
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
  const startedAt = new Date();
  const steps = await runDailyJob(maxDuration);
  await recordDailyRun(startedAt, steps);
  return Response.json({ at: new Date().toISOString(), steps }, { headers: { "Cache-Control": "private, no-store" } });
}
