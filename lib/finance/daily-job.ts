import "server-only";
import { pruneLoginAttempts } from "@/lib/auth/rate-limit";
import { writeAiSummaryQuietly } from "./ai-summary-service";
import { loadConnectionViews, resealAllCredentials, syncAllAccounts } from "./connections/service";
import { runDailySteps, within, type DailyStep } from "./daily-steps";
import { deadlineFor, timeLeft } from "./deadline";
import { categorizeQuietly } from "./imports/ai-service";
import { syncInvestmentHistory } from "./imports/history-service";
import { applyCategoryRules } from "./imports/service";
import { recordPortfolioQuietly } from "./portfolio";
import { ensureFx, postDueRecurring, refreshRates, upsertTodaySnapshot } from "./service";

/*
 * The daily cron's work. Cheap, important steps go first, so a slow provider or a failed step never
 * costs the day's recurring entries or net-worth point. Each step runs on its own (runDailySteps) and
 * is skipped when there isn't time for it. Called only by the CRON_SECRET-protected route.
 */

/** Time kept after the account syncs for the snapshot, categorization and the AI summary. */
const AFTER_SYNC_MS = 140_000;
/** The AI summary goes last; it gets this much at the end. */
const SUMMARY_MS = 60_000;

const services = {
  refreshRates, postDueRecurring, applyCategoryRules, pruneLoginAttempts, resealAllCredentials, syncAllAccounts, syncInvestmentHistory,
  loadConnectionViews, ensureFx, upsertTodaySnapshot, recordPortfolioQuietly, categorizeQuietly, writeAiSummaryQuietly,
};
export type DailyServices = typeof services;

export function dailySteps(s: DailyServices = services): DailyStep[] {
  return [
    // Today's exchange rates before anything converts money.
    { name: "rates", run: () => s.refreshRates() },
    { name: "recurring", run: () => s.postDueRecurring() },
    // Rules before the model: it only sees what the person's own rules leave pending.
    { name: "imports", run: () => s.applyCategoryRules() },
    { name: "logins", run: () => s.pruneLoginAttempts() },
    // Paused accounts don't sync, so their credentials move to CREDENTIALS_SECRET here. Never throws.
    { name: "resealed", run: () => s.resealAllCredentials() },
    {
      name: "sync", needsMs: AFTER_SYNC_MS + 30_000,
      run: async (deadline) => {
        const until = deadline - AFTER_SYNC_MS;
        // A sync still running at `until` keeps going in the background; the job moves on and says so.
        const done = await within(Promise.all([s.syncAllAccounts(), s.syncInvestmentHistory({ deadline: until })]), timeLeft(until), () => null);
        return done ? { connections: done[0], history: done[1] } : "still running";
      },
    },
    // Today's point, with whatever the syncs brought (and rates for any new currency).
    {
      name: "snapshot",
      run: async () => {
        const views = await s.loadConnectionViews();
        await s.ensureFx(views.flatMap((v) => v.snapshot?.positions.map((p) => p.currency) ?? []));
        await s.upsertTodaySnapshot();
      },
    },
    { name: "portfolio", run: () => s.recordPortfolioQuietly() },
    { name: "ai", needsMs: SUMMARY_MS + 20_000, run: (deadline) => s.categorizeQuietly({ deadline: deadline - SUMMARY_MS }) },
    // Last, so it sees today's synced balances and filed entries; skipped when nothing changed. Never throws.
    { name: "feedback", needsMs: SUMMARY_MS, run: () => s.writeAiSummaryQuietly() },
  ];
}

export function runDailyJob(maxDurationSeconds: number, s: DailyServices = services) {
  return runDailySteps(dailySteps(s), deadlineFor(maxDurationSeconds));
}
