import { describe, expect, test } from "bun:test";
import { AREAS, PAGES, RECOVERY_CHECKS, TASKS, TRUST_CHECKS, linear, overallScore, scoreUsability, taskScore, type ColdTest, type Measurement, type PageMetrics, type TaskId } from "./admin-usability";

const easyPage: PageMetrics = {
  labelledDestinations: 4, currentMarked: true, addReachable: true, proseWords: 100, longParagraphs: 0, jargonHits: 0, rawDates: 0,
  clippedText: 0, overflow: false, tapTargets: 20, tapTargetsOk: 20, navStaysVisible: true,
};

/** Synthetic: everything at or within budget. Not a live result. */
const perfect = (): Measurement => ({
  measuredAt: "2026-11-05", sourceHash: "x", production: true, buildId: "b",
  tasks: Object.fromEntries((Object.keys(TASKS) as TaskId[]).map((id) => [id, { actions: TASKS[id].budget }])),
  pages: {
    desktop: Object.fromEntries(PAGES.map((p) => [p, { ...easyPage }])),
    phone: Object.fromEntries(PAGES.map((p) => [p, { ...easyPage }])),
  },
  recovery: Object.fromEntries(Object.keys(RECOVERY_CHECKS).map((id) => [id, true])),
  trust: Object.fromEntries(Object.keys(TRUST_CHECKS).map((id) => [id, true])),
  navMs: [500, 600, 700],
  guards: { monthVisible: true, monthExplained: true, privacyTotal: 10, privacyBlurred: 10, unknownNotZero: true },
});

describe("admin usability score", () => {
  test("the areas add up to ten and a perfect measurement earns them all", () => {
    expect(Object.values(AREAS).reduce((sum, a) => sum + a.maximum, 0)).toBe(10);
    expect(scoreUsability(perfect())).toMatchObject({ total: 10, accepted: true, blockers: [] });
  });

  test("a line runs between good and bad, and doesn't run past either", () => {
    expect(linear(0, 0, 10)).toBe(1);
    expect(linear(5, 0, 10)).toBe(0.5);
    expect(linear(20, 0, 10)).toBe(0);
    expect(linear(0.95, 0.95, 0.6)).toBe(1);
  });

  test("each action over budget costs a budget's worth, and a failed task earns nothing", () => {
    expect(taskScore(1, 1)).toBe(1);
    expect(taskScore(2, 1)).toBe(0);
    expect(taskScore(3, 2)).toBe(0.5);
    expect(taskScore(1, 0)).toBe(0);
    expect(taskScore(null, 4)).toBe(0);
  });

  test("a task that can't be completed blocks acceptance, whatever the total", () => {
    const m = perfect();
    m.tasks["add-expense"] = { actions: null, error: "no control" };
    const result = scoreUsability(m);
    expect(result.total).toBeGreaterThan(9);
    expect(result.accepted).toBe(false);
    expect(result.blockers.join()).toContain("Add an expense");
  });

  test("a weak area can't hide behind a high total", () => {
    const m = perfect();
    m.recovery = Object.fromEntries(Object.keys(RECOVERY_CHECKS).map((id, i) => [id, i < 6]));
    const result = scoreUsability(m);
    expect(result.total).toBeGreaterThanOrEqual(9);
    expect(result.accepted).toBe(false);
  });

  test("a recovery check that couldn't run earns nothing", () => {
    const m = perfect();
    m.recovery.reconnectOffered = null;
    expect(scoreUsability(m).areas.find((a) => a.id === "recovery")!.score).toBeCloseTo(10 / 11);
  });

  test("a trust check with no data to check is left out, but one that wasn't run counts as failed", () => {
    const na = perfect();
    na.trust!.failingFlagged = null;
    expect(scoreUsability(na).areas.find((a) => a.id === "trust")!.score).toBeCloseTo(1.5);
    const failed = perfect();
    failed.trust!.incomeAgrees = false;
    expect(scoreUsability(failed).areas.find((a) => a.id === "trust")!.score).toBeCloseTo(1.5 * (Object.keys(TRUST_CHECKS).length - 1) / Object.keys(TRUST_CHECKS).length);
    const older = perfect();
    delete older.trust;
    expect(scoreUsability(older).areas.find((a) => a.id === "trust")!.score).toBe(0);
  });

  test("the overall score is the lower of the measured score and the independent cold test", () => {
    const measured = scoreUsability(perfect());
    const cold = (rating: number, sourceHash = "x"): ColdTest => ({ rating, sourceHash, testedAt: "2026-11-05", tester: "fixture", remaining: [] });
    expect(overallScore(measured, cold(6.5), "x")).toMatchObject({ total: 6.5, accepted: false });
    expect(overallScore(measured, cold(9.2), "x")).toMatchObject({ total: 9.2, accepted: true });
  });

  test("no cold test, or one of older source, can't be accepted however good the numbers", () => {
    const measured = scoreUsability(perfect());
    expect(overallScore(measured, null, "x")).toMatchObject({ total: 10, accepted: false, cold: null });
    expect(overallScore(measured, { rating: 9.5, sourceHash: "older", testedAt: "2026-11-05", tester: "fixture", remaining: [] }, "x")).toMatchObject({ accepted: false, cold: null });
  });

  test("a generous tester can't carry a measurement that fails", () => {
    const m = perfect();
    m.tasks["add-expense"] = { actions: null };
    expect(overallScore(scoreUsability(m), { rating: 10, sourceHash: "x", testedAt: "2026-11-05", tester: "fixture", remaining: [] }, "x").accepted).toBe(false);
  });

  test("omitted tasks or pages can't inflate the score", () => {
    const noTask = perfect();
    delete noTask.tasks["fix-account"];
    expect(() => scoreUsability(noTask)).toThrow("missing task fix-account");
    const noPage = perfect();
    delete noPage.pages.phone.accounts;
    expect(() => scoreUsability(noPage)).toThrow("phone metrics for accounts");
  });

  test("a task with no data to run against is left out, but too many of them block", () => {
    const m = perfect();
    m.tasks["fix-account"] = { actions: null, na: true };
    expect(scoreUsability(m)).toMatchObject({ total: 10, accepted: true });
    for (const id of ["upload-statement", "explain-alert", "p-explain-alert"] as const) m.tasks[id] = { actions: null, na: true };
    expect(scoreUsability(m).accepted).toBe(false);
  });

  test("a dev server earns no speed and can't be accepted", () => {
    const m = perfect();
    m.production = false;
    const result = scoreUsability(m);
    expect(result.areas.find((a) => a.id === "speed")!.score).toBe(0);
    expect(result.accepted).toBe(false);
  });

  test("slow navigation is scored on the median, so one outlier doesn't decide it", () => {
    const m = perfect();
    m.navMs = [500, 600, 9000];
    expect(scoreUsability(m).areas.find((a) => a.id === "speed")!.score).toBe(0.5);
    m.navMs = [2500, 2500, 2500];
    expect(scoreUsability(m).areas.find((a) => a.id === "speed")!.score).toBe(0.25);
  });

  test("data-trust guards block acceptance even at a perfect score", () => {
    for (const change of [
      { monthVisible: false },
      { monthExplained: false },
      { privacyBlurred: 9 },
      { unknownNotZero: false },
    ]) {
      const m = perfect();
      Object.assign(m.guards, change);
      const result = scoreUsability(m);
      expect(result.total).toBe(10);
      expect(result.accepted).toBe(false);
    }
  });

  test("unlabelled navigation loses most of Finding things", () => {
    const m = perfect();
    for (const viewport of ["desktop", "phone"] as const) for (const p of PAGES) m.pages[viewport][p].labelledDestinations = 0;
    expect(scoreUsability(m).areas.find((a) => a.id === "finding")!.score).toBeCloseTo(0.6);
  });
});
