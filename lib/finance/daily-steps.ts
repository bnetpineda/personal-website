import { timeLeft } from "./deadline";

/*
 * Runs the daily job's steps in order, each on its own: a step that throws is recorded and the next one
 * still runs, and a step that needs more time than is left is skipped instead of being cut off.
 * Kept free of server imports so it is unit-tested directly.
 */

export interface DailyStep {
  name: string;
  /** Skip the step when less time than this is left. */
  needsMs?: number;
  run: (deadline: number) => Promise<unknown>;
}

export type StepOutcome =
  | { status: "ok"; ms: number; value: unknown }
  | { status: "failed"; ms: number; error: string }
  | { status: "skipped"; reason: "out of time" };

/** Only the error's class name is logged or returned: database and AI errors carry query values and prompts. */
const errorName = (error: unknown) => (error instanceof Error ? error.name : "UnknownError");

export async function runDailySteps(steps: readonly DailyStep[], deadline: number, now = () => Date.now()): Promise<Record<string, StepOutcome>> {
  const outcomes: Record<string, StepOutcome> = {};
  for (const step of steps) {
    if (timeLeft(deadline, now()) < (step.needsMs ?? 0)) {
      outcomes[step.name] = { status: "skipped", reason: "out of time" };
      console.error(`[cron] ${step.name} skipped: out of time`);
      continue;
    }
    const start = now();
    try {
      const value = await step.run(deadline);
      outcomes[step.name] = { status: "ok", ms: now() - start, value };
    } catch (error) {
      const ms = now() - start;
      outcomes[step.name] = { status: "failed", ms, error: errorName(error) };
      console.error(`[cron] ${step.name} failed after ${ms} ms: ${errorName(error)}`);
    }
  }
  return outcomes;
}

/** Settles with `fallback` at `ms` while the work keeps going; it can't be cancelled, but the job moves on. */
export function within<T>(work: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback()), Math.max(0, ms)); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** A step's outcome as saved: status and time only. Values and error text can carry amounts or prompts. */
export type DailyStepRecord = { status: "ok" | "failed" | "skipped"; ms?: number; error?: string };

export function stepRecords(outcomes: Record<string, StepOutcome>): Record<string, DailyStepRecord> {
  return Object.fromEntries(Object.entries(outcomes).map(([name, o]) => [name,
    o.status === "skipped" ? { status: "skipped" } : o.status === "failed" ? { status: "failed", ms: o.ms, error: o.error } : { status: "ok", ms: o.ms }]));
}

/** What each step is for, in the words of the app. */
export const DAILY_STEP_LABELS: Record<string, string> = {
  rates: "exchange rates", recurring: "recurring entries", imports: "category rules", logins: "sign-in cleanup",
  resealed: "credential re-encryption", sync: "account sync", snapshot: "today's net-worth point", portfolio: "account values",
  ai: "AI categorizing", feedback: "AI feedback",
};

export interface DailyRun { id: string; startedAt: Date; steps: Record<string, DailyStepRecord> }

/**
 * What needs saying about the last daily runs (newest first): a step that failed in the latest run, or
 * one skipped for lack of time two runs in a row (once can be a slow provider). Nothing on a clean run.
 */
export function dailyRunProblems(runs: DailyRun[]): { failed: string[]; skipped: string[] } | null {
  const [latest, before] = runs;
  if (!latest) return null;
  const failed = Object.entries(latest.steps).filter(([, s]) => s.status === "failed").map(([name]) => name);
  const skipped = before ? Object.entries(latest.steps).filter(([name, s]) => s.status === "skipped" && before.steps[name]?.status === "skipped").map(([name]) => name) : [];
  return failed.length || skipped.length ? { failed, skipped } : null;
}
