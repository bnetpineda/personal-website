import { createHash } from "node:crypto";

/*
 * Admin usability score: how much of a hassle the finance admin is to use.
 *
 * Nothing here is hand-marked. scripts/admin-usability-probe.js walks the real UI in a browser and
 * records raw numbers (actions per task, words per page, tap sizes, navigation time); this file turns
 * them into a score. A measurement only counts for the exact source it was taken from, so a change to
 * the admin (or to these thresholds) makes the score stale until it is measured again.
 *
 * Numbers alone can flatter: the first version of this scorer read 10/10 while a tester who had never
 * seen the admin gave it 6.5. So the overall score is the lower of the measured score and an independent
 * cold test (admin-usability.cold-test.json), which has to be of the same source to count.
 */

export const AREAS = {
  effort: { label: "Effort: actions per task", maximum: 3 },
  finding: { label: "Finding things", maximum: 1.5 },
  clarity: { label: "Clarity: reading load & wording", maximum: 1.5 },
  recovery: { label: "Forgiveness & feedback", maximum: 1 },
  trust: { label: "Trust: the app agrees with itself", maximum: 1.5 },
  phone: { label: "Phone", maximum: 1 },
  speed: { label: "Speed", maximum: 0.5 },
} as const;
type Area = keyof typeof AREAS;

/** Every area must reach this share of its maximum, so a weak one can't hide in the total. */
export const MINIMUM_AREA_SHARE = 0.7;
export const TARGET = 9;

/** The jobs the admin exists for, and the most actions each should take (a click, a field, a key). */
export const TASKS = {
  "see-month": { label: "See the month's spending and income on opening", budget: 0 },
  "go-portfolio": { label: "Go to Portfolio", budget: 1 },
  "go-recurring": { label: "Go to Recurring", budget: 1 },
  "go-accounts": { label: "Go to Accounts", budget: 1 },
  "manage-categories": { label: "Open category management", budget: 1 },
  "reach-earnings": { label: "Reach Earnings", budget: 2 },
  "add-expense": { label: "Add an expense", budget: 4 },
  "add-anywhere": { label: "Start adding from another page", budget: 1 },
  "search-entry": { label: "Find a past entry by word", budget: 3 },
  "jump-month": { label: "Jump six months back", budget: 2 },
  "this-month": { label: "Return to this month", budget: 1 },
  "filter-category": { label: "Filter to a category, then clear it", budget: 2 },
  "history-by-type": { label: "Filter investment history by type", budget: 1 },
  "move-category": { label: "Change an entry's category", budget: 2 },
  "edit-budget": { label: "Change a budget", budget: 3 },
  "explain-alert": { label: "Read in full why an account needs attention", budget: 1 },
  "fix-account": { label: "Open the fix for a failing account", budget: 2 },
  "upload-statement": { label: "Upload a missing statement", budget: 2 },
  "hide-amounts": { label: "Hide amounts", budget: 1 },
  "p-see-month": { label: "Phone: see the month on opening", budget: 0 },
  "p-go-portfolio": { label: "Phone: go to Portfolio", budget: 1 },
  "p-go-recurring": { label: "Phone: go to Recurring", budget: 1 },
  "p-go-accounts": { label: "Phone: go to Accounts", budget: 1 },
  "p-add-anywhere": { label: "Phone: start adding from another page", budget: 1 },
  "p-explain-alert": { label: "Phone: read why an account needs attention", budget: 1 },
  "p-search-entry": { label: "Phone: find a past entry by word", budget: 3 },
} as const;
export type TaskId = keyof typeof TASKS;

export const RECOVERY_CHECKS = {
  keepsInput: "A rejected form keeps what was typed",
  errorInline: "The error shows next to the field",
  focusInvalid: "Focus moves to the field that needs fixing",
  outsideSafe: "Clicking outside a half-filled sheet doesn't lose it",
  closeAsks: "Closing a half-filled sheet asks first",
  escReturns: "Escape closes a sheet and returns focus",
  addAnother: "Several entries can be added without reopening the sheet",
  everyAlertHasFix: "Every alert offers its fix in place",
  reconnectOffered: "A failing account offers Reconnect right in the alert",
  plainErrors: "No raw error codes on screen",
  emptyStateActs: "An empty month offers a way forward",
  nonTextDirty: "Changing only a picker in a sheet still asks before discarding it",
  focusReturns: "Closing a sheet whose button is gone leaves focus on a control, not the page",
} as const;
export type RecoveryId = keyof typeof RECOVERY_CHECKS;

/** Accessibility the page numbers can't see. Missing (not run) counts as failed; null means no data to check. */
export const ACCESS_CHECKS = {
  contrast: "Text meets WCAG AA contrast on every page, light and dark",
  focusVisible: "Every control Tab reaches shows where focus is",
  rawInSheets: "Sheets show no raw values (ISO dates, stored codes)",
} as const;
export type AccessId = keyof typeof ACCESS_CHECKS;

/** A measured page with nothing in it: what a page the measurement left out counts as. */
const UNMEASURED_PAGE: PageMetrics = {
  labelledDestinations: 0, currentMarked: false, addReachable: false, proseWords: 10_000, longParagraphs: 10, jargonHits: 100, rawDates: 100,
  clippedText: 100, overflow: true, tapTargets: 1, tapTargetsOk: 0, navStaysVisible: false,
};

/** Things that make a finance app hard to believe. null means it couldn't be checked with today's data. */
export const TRUST_CHECKS = {
  incomeAgrees: "Overview and Recurring show the same income estimate",
  failingFlagged: "A failing account is marked on the Overview",
  filterClears: "Clearing a category restores the previous view",
  statusWords: "An account's state has the same name on every page",
  netWorthDated: "Net worth is labelled as today's, whatever month is on show",
  portfolioReconciles: "Portfolio says when it includes accounts outside net worth",
  changeHonest: "A balance change that includes deposits doesn't read as profit",
  addStartsClean: "The Add form doesn't start from an imported account",
  panelsShowAll: "At laptop size, every category and account shows without scrolling inside its panel",
  netWorthHonest: "Net worth doesn't claim centavo precision while its sources are out of date",
  earningsSameMonth: "Earnings by month opens where the Overview opens",
  fixedCostsHonest: "Nothing scheduled reads as unknown, not a zero",
  ratesClear: "A peso figure at today's rate is called an estimate, so it can't contradict recorded totals",
} as const;
export type TrustId = keyof typeof TRUST_CHECKS;

/** An independent person or agent, new to the admin, trying its main jobs and rating how easy it was. */
export interface ColdTest {
  rating: number;
  sourceHash: string;
  testedAt: string;
  tester: string;
  /** What they said still got in the way. */
  remaining: string[];
}

export const PAGES = ["overview", "portfolio", "earnings", "history", "recurring", "accounts", "categories"] as const;
export type PageId = (typeof PAGES)[number];
const DESTINATIONS = 4;

export interface PageMetrics {
  /** Primary destinations reachable from here by a visible, labelled, persistent link (of 4). */
  labelledDestinations: number;
  currentMarked: boolean;
  addReachable: boolean;
  proseWords: number;
  longParagraphs: number;
  jargonHits: number;
  rawDates: number;
  clippedText: number;
  overflow: boolean;
  tapTargets: number;
  tapTargetsOk: number;
  navStaysVisible: boolean;
}

export interface Measurement {
  measuredAt: string;
  sourceHash: string;
  production: boolean;
  buildId: string | null;
  tasks: Record<string, { actions: number | null; path?: number; error?: string; na?: boolean }>;
  pages: { desktop: Record<string, PageMetrics>; phone: Record<string, PageMetrics> };
  recovery: Record<string, boolean | null>;
  /** Checks a measurement didn't run count against it, as failures. */
  trust?: Record<string, boolean | null>;
  /** Contrast, visible focus and raw values in sheets; older measurements don't have it (all failed). */
  access?: Record<string, boolean | null>;
  navMs: number[];
  guards: {
    /** The month on show is visible on opening. */
    monthVisible: boolean;
    /** Opening on a month other than this one says so. */
    monthExplained: boolean;
    /** Hide amounts really blurs every amount on screen. */
    privacyTotal: number;
    privacyBlurred: number;
    /** A month with missing statements never shows a false zero. */
    unknownNotZero: boolean;
  };
}

/** 1 at `good` or better, 0 at `bad` or worse, straight line between. */
export function linear(value: number, good: number, bad: number) {
  const share = (value - bad) / (good - bad);
  return Math.min(1, Math.max(0, share));
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : Infinity;
};

/** Within budget earns the task in full; each extra action costs a budget's worth, a failed task nothing. */
export function taskScore(actions: number | null, budget: number) {
  if (actions == null) return 0;
  return actions <= budget ? 1 : Math.max(0, 1 - (actions - budget) / Math.max(budget, 1));
}

export function scoreUsability(m: Measurement) {
  // A page or task the measurement left out (an older measurement, before a page existed) can't
  // inflate the score: it counts as the worst result and blocks acceptance, instead of crashing.
  const unmeasured: string[] = [];
  const pagesOf = (viewport: "desktop" | "phone") => PAGES.map((id) => {
    const page = m.pages[viewport]?.[id];
    if (page) return page;
    unmeasured.push(`${id} (${viewport})`);
    return UNMEASURED_PAGE;
  });
  const desktop = pagesOf("desktop");
  const phone = pagesOf("phone");
  const both = [...desktop, ...phone];

  // ---- effort: a task the probe skipped can't be ignored, only one marked not applicable (no such data) ----
  const taskRows = (Object.keys(TASKS) as TaskId[]).map((id) => {
    const measured = m.tasks[id];
    if (!measured) unmeasured.push(`task "${TASKS[id].label}"`);
    const actions = measured?.actions ?? null;
    return { id, label: TASKS[id].label, budget: TASKS[id].budget, actions, na: Boolean(measured?.na), score: taskScore(actions, TASKS[id].budget), error: measured ? measured.error : "not measured" };
  });
  const scored = taskRows.filter((t) => !t.na);
  const notApplicable = taskRows.length - scored.length;

  const parts: Record<Area, number> = {
    effort: mean(scored.map((t) => t.score)),
    finding:
      0.6 * mean(both.map((p) => p.labelledDestinations / DESTINATIONS)) +
      0.2 * mean(both.map((p) => (p.currentMarked ? 1 : 0))) +
      0.2 * mean(both.map((p) => (p.addReachable ? 1 : 0))),
    // Reading load and wording, plus whether the text can be read at all (contrast) and found with a
    // keyboard (focus), and no raw values hiding in sheets.
    clarity:
      0.8 *
        (0.3 * linear(mean(desktop.map((p) => p.longParagraphs)), 0, 3) +
          0.25 * linear(desktop.reduce((sum, p) => sum + p.jargonHits, 0), 0, 15) +
          0.1 * linear(desktop.reduce((sum, p) => sum + p.rawDates, 0), 0, 10) +
          0.2 * linear(mean(desktop.map((p) => p.proseWords)), 200, 700) +
          0.15 * linear(desktop.reduce((sum, p) => sum + p.clippedText, 0), 0, 10)) +
      0.2 * mean((Object.keys(ACCESS_CHECKS) as AccessId[]).filter((id) => m.access?.[id] !== null).map((id) => (m.access?.[id] === true ? 1 : 0))),
    recovery: mean((Object.keys(RECOVERY_CHECKS) as RecoveryId[]).map((id) => (m.recovery[id] === true ? 1 : 0))),
    // Not applicable today (null) is left out; anything missing counts as failed.
    trust: mean((Object.keys(TRUST_CHECKS) as TrustId[]).filter((id) => m.trust?.[id] !== null).map((id) => (m.trust?.[id] === true ? 1 : 0))),
    phone:
      0.5 * linear(phone.reduce((sum, p) => sum + p.tapTargetsOk, 0) / Math.max(1, phone.reduce((sum, p) => sum + p.tapTargets, 0)), 0.95, 0.6) +
      0.25 * mean(phone.map((p) => (p.overflow ? 0 : 1))) +
      0.25 * mean(phone.map((p) => (p.navStaysVisible ? 1 : 0))),
    // A dev server's timings say nothing about the real app, so only a production build earns these.
    speed: m.production ? linear(median(m.navMs), 1000, 4000) : 0,
  };

  const areas = (Object.keys(AREAS) as Area[]).map((id) => ({
    id,
    label: AREAS[id].label,
    maximum: AREAS[id].maximum,
    score: parts[id] * AREAS[id].maximum,
  }));
  // Rounded so floating point can't decide a threshold.
  const total = Math.round(areas.reduce((sum, area) => sum + area.score, 0) * 1000) / 1000;

  const blockers = [
    !m.guards.monthVisible && "The month on show isn't visible on opening",
    !m.guards.monthExplained && "Opening on another month doesn't say so",
    m.guards.privacyBlurred < m.guards.privacyTotal && `Hide amounts leaves ${m.guards.privacyTotal - m.guards.privacyBlurred} of ${m.guards.privacyTotal} amounts readable`,
    !m.guards.unknownNotZero && "A month with missing statements shows a false zero",
    !m.production && "Not measured on a production build",
    unmeasured.length > 0 && `Not measured (measure again): ${unmeasured.join(", ")}`,
    notApplicable > 3 && `${notApplicable} tasks had no data to run against`,
    ...scored.filter((t) => t.actions == null).map((t) => `Task can't be completed: ${t.label}`),
  ].filter((b): b is string => Boolean(b));

  return {
    total,
    maximum: 10,
    areas,
    tasks: taskRows,
    blockers,
    accepted: total >= TARGET && blockers.length === 0 && areas.every((area) => area.score >= area.maximum * MINIMUM_AREA_SHARE),
  };
}

/** The lower of the two, so neither a saturated measurement nor a generous tester can carry it alone. */
export function overallScore(measured: ReturnType<typeof scoreUsability>, cold: ColdTest | null, hash: string) {
  const counted = cold && cold.sourceHash === hash ? cold : null;
  const total = counted ? Math.min(measured.total, counted.rating) : measured.total;
  return { total, cold: counted, accepted: measured.accepted && counted != null && counted.rating >= TARGET };
}

/** Everything a score depends on: the admin UI, its components and how it is scored. Line endings don't count. */
export async function sourceHash(root: URL) {
  const hash = createHash("sha256");
  const patterns = ["app/admin/**/*.{ts,tsx}", "components/ui/**/*.tsx", "app/globals.css", "lib/dal.ts", "lib/finance/notifications.ts", "lib/finance/connections/types.ts", "scripts/admin-usability.ts", "scripts/admin-usability-probe.js"];
  const files = new Set<string>();
  for (const pattern of patterns) for await (const file of new Bun.Glob(pattern).scan({ cwd: Bun.fileURLToPath(root) })) if (!file.includes(".test.")) files.add(file.replaceAll("\\", "/"));
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update((await Bun.file(new URL(file, root)).text()).replaceAll("\r\n", "\n"));
  }
  return hash.digest("hex").slice(0, 16);
}

function report(result: ReturnType<typeof scoreUsability>, baseline: ReturnType<typeof scoreUsability> | null, overall: ReturnType<typeof overallScore>, staleCold: boolean) {
  const change = (now: number, before?: number) => (before == null ? "" : `  (was ${before.toFixed(1)})`);
  for (const area of result.areas) {
    const before = baseline?.areas.find((a) => a.id === area.id)?.score;
    console.log(`${area.score.toFixed(1).padStart(4)} / ${area.maximum.toFixed(1)}  ${area.label}${change(area.score, before)}`);
  }
  console.log(`\nMeasured: ${result.total.toFixed(1)}/10${change(result.total, baseline?.total)}`);
  console.log(overall.cold ? `Independent cold test: ${overall.cold.rating.toFixed(1)}/10 by ${overall.cold.tester}` : `Independent cold test: ${staleCold ? "out of date, doesn't count" : "none yet"}`);
  console.log(`\nOverall: ${overall.total.toFixed(1)}/10 — ${overall.accepted ? "ACCEPTED" : "NEEDS IMPROVEMENT"}`);
  if (overall.cold?.remaining.length) console.log(`\nStill in the way, per the tester:\n  ${overall.cold.remaining.join("\n  ")}`);
  const over = result.tasks.filter((t) => !t.na && t.score < 1);
  if (over.length) {
    console.log("\nTasks over budget:");
    for (const t of over) console.log(`  ${t.label}: ${t.actions == null ? "failed" : `${t.actions} actions`} (budget ${t.budget})${t.error ? ` — ${t.error}` : ""}`);
  }
  if (result.blockers.length) console.log(`\nBlockers:\n  ${result.blockers.join("\n  ")}`);
}

if (import.meta.main) {
  const root = new URL("../", import.meta.url);
  const hash = await sourceHash(root);
  if (process.argv.includes("--hash")) {
    console.log(hash);
    process.exit(0);
  }
  const file = Bun.file(new URL("admin-usability.json", root));
  if (!(await file.exists())) {
    console.error("No measurement yet. Run the /neo-admin-ux-score task against a production build.");
    process.exit(1);
  }
  const measurement: Measurement = await file.json();
  const baselineFile = Bun.file(new URL("admin-usability.baseline.json", root));
  const baseline = (await baselineFile.exists()) ? scoreUsability(await baselineFile.json()) : null;
  const result = scoreUsability(measurement);
  const coldFile = Bun.file(new URL("admin-usability.cold-test.json", root));
  const cold: ColdTest | null = (await coldFile.exists()) ? await coldFile.json() : null;
  const overall = overallScore(result, cold, hash);
  console.log(`Measured ${measurement.measuredAt} on ${measurement.production ? `production build ${measurement.buildId}` : "a dev server"}\n`);
  report(result, baseline, overall, Boolean(cold) && !overall.cold);
  if (measurement.sourceHash !== hash) {
    console.log(`\nSTALE: measured against source ${measurement.sourceHash}, the admin is now ${hash}. Measure again; this score doesn't count.`);
    process.exitCode = 1;
  } else if (!overall.accepted) process.exitCode = 1;
}
