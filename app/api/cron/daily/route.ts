import { createHash, timingSafeEqual } from "node:crypto";
import { pruneLoginAttempts } from "@/lib/auth/rate-limit";
import { refreshAllPrices } from "@/lib/finance/service";

// Vercel Cron (vercel.json): refresh prices + FX, record today's net-worth point.
export const maxDuration = 60;

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
  const summary = await refreshAllPrices();
  await pruneLoginAttempts();
  return Response.json(summary);
}
