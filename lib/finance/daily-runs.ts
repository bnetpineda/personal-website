import "server-only";
import { desc, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dailyJobRuns } from "@/lib/db/schema";
import { stepRecords, type DailyRun, type StepOutcome } from "./daily-steps";

/** Runs kept for the alert and for looking back at a bad week. */
const KEEP_DAYS = 60;

/**
 * Saves what the daily cron did, so a failed step reaches the person as an alert instead of only the
 * Vercel logs. Never throws: losing the record must not turn a finished job into a failed request.
 */
export async function recordDailyRun(startedAt: Date, outcomes: Record<string, StepOutcome>) {
  try {
    const db = getDb();
    await db.insert(dailyJobRuns).values({ startedAt, steps: stepRecords(outcomes) });
    await db.delete(dailyJobRuns).where(lt(dailyJobRuns.startedAt, sql`now() - make_interval(days => ${KEEP_DAYS})`));
  } catch (error) {
    console.error(`[cron] run record not saved: ${error instanceof Error ? error.name : "UnknownError"}`);
  }
}

/** The last two runs, newest first. */
export async function loadDailyRuns(): Promise<DailyRun[]> {
  return getDb().select({ id: dailyJobRuns.id, startedAt: dailyJobRuns.startedAt, steps: dailyJobRuns.steps })
    .from(dailyJobRuns).orderBy(desc(dailyJobRuns.startedAt)).limit(2);
}
