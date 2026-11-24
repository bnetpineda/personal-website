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
