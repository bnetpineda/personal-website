import { describe, expect, test } from "bun:test";
import { runDailyJob, type DailyServices } from "./daily-job";

/*
 * The cron's order and isolation with every service replaced: a database error in an early step must not
 * cost the recurring entries, the snapshot or categorization.
 */
function fakes(failing: string[] = []) {
  const calls: string[] = [];
  const fake = (name: string, value: unknown = null) => async () => {
    calls.push(name);
    if (failing.includes(name)) throw new Error("database unavailable");
    return value;
  };
  const services = {
    refreshRates: fake("refreshRates", { fxUpdated: 3 }), postDueRecurring: fake("postDueRecurring", { posted: 1 }),
    applyCategoryRules: fake("applyCategoryRules", { posted: 0 }), pruneLoginAttempts: fake("pruneLoginAttempts"),
    resealAllCredentials: fake("resealAllCredentials", 0), syncAllAccounts: fake("syncAllAccounts", []),
    syncInvestmentHistory: fake("syncInvestmentHistory", []), loadConnectionViews: fake("loadConnectionViews", [{ snapshot: { positions: [{ currency: "USD" }] } }]),
    ensureFx: fake("ensureFx", {}), upsertTodaySnapshot: fake("upsertTodaySnapshot"), recordPortfolioQuietly: fake("recordPortfolioQuietly"),
    autoTeachPayees: fake("autoTeachPayees", { payees: 0, moved: 0 }),
    categorizeQuietly: fake("categorizeQuietly", { skipped: true }), writeAiSummaryQuietly: fake("writeAiSummaryQuietly", "unchanged"),
  } as unknown as DailyServices;
  return { calls, services };
}

describe("daily job", () => {
  test("runs cheap critical steps first, syncs, then records today's point and categorizes", async () => {
    const { calls, services } = fakes();
    const steps = await runDailyJob(300, services);
    expect(calls).toEqual([
      "refreshRates", "postDueRecurring", "applyCategoryRules", "pruneLoginAttempts", "resealAllCredentials",
      "syncAllAccounts", "syncInvestmentHistory", "loadConnectionViews", "ensureFx", "upsertTodaySnapshot",
      "recordPortfolioQuietly", "autoTeachPayees", "categorizeQuietly", "writeAiSummaryQuietly",
    ]);
    expect(Object.values(steps).every((s) => s.status === "ok")).toBe(true);
    expect(steps.recurring).toMatchObject({ value: { posted: 1 } });
  });

  test("a failing exchange-rate refresh or sync still posts recurring entries and saves the snapshot", async () => {
    const { calls, services } = fakes(["refreshRates", "syncAllAccounts"]);
    const steps = await runDailyJob(300, services);
    expect(steps.rates).toMatchObject({ status: "failed", error: "Error" });
    expect(steps.sync).toMatchObject({ status: "failed" });
    expect(steps.recurring.status).toBe("ok");
    expect(steps.snapshot.status).toBe("ok");
    expect(steps.ai.status).toBe("ok");
    expect(calls).toContain("upsertTodaySnapshot");
  });

  test("with little time left the slow steps are skipped, not cut off", async () => {
    const { services } = fakes();
    // A 60-second limit leaves 50 seconds: not enough to sync, categorize or write the summary.
    const steps = await runDailyJob(60, services);
    expect(steps.sync).toEqual({ status: "skipped", reason: "out of time" });
    expect(steps.ai.status).toBe("skipped");
    expect(steps.feedback.status).toBe("skipped");
    expect(steps.recurring.status).toBe("ok");
    expect(steps.snapshot.status).toBe("ok");
  });
});

describe("daily run records", () => {
  test("keep status and time, never values or messages", async () => {
    const { stepRecords } = await import("./daily-steps");
    expect(stepRecords({
      rates: { status: "ok", ms: 12, value: { fxUpdated: 3 } },
      ai: { status: "failed", ms: 40, error: "AbortError" },
      feedback: { status: "skipped", reason: "out of time" },
    })).toEqual({ rates: { status: "ok", ms: 12 }, ai: { status: "failed", ms: 40, error: "AbortError" }, feedback: { status: "skipped" } });
  });
});
