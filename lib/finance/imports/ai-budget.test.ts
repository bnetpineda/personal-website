import { describe, expect, test } from "bun:test";
import { categorizeQuietly, describeAiRun, type AiRunResult } from "./ai-service";
import { actionDeadline, deadlineFor, timeLeft } from "../deadline";

const run = (over: Partial<AiRunResult> = {}): AiRunResult => ({ skipped: false, claimed: 0, linked: 0, posted: 0, duplicates: 0, held: 0, transfers: 0, investment: 0, ignored: 0, unsure: 0, ...over });

describe("categorization time budget", () => {
  test("with too little time left, nothing is claimed and the entries wait for the next sync", async () => {
    // Returns before touching the database or the model.
    expect(await categorizeQuietly({ deadline: Date.now() + 5_000 })).toEqual({ error: "New activity is categorized on the next sync." });
  });

  test("a run stopped by its deadline says the rest comes later", () => {
    expect(describeAiRun(run({ posted: 3, stopped: true }))).toBe(" Categorized: 3 posted. The rest is categorized on the next sync.");
    expect(describeAiRun(run({ stopped: true }))).toBe(" The rest is categorized on the next sync.");
    expect(describeAiRun(run())).toBe("");
  });

  test("an action's deadline leaves a margin inside the page's 120-second limit", () => {
    expect(actionDeadline(0)).toBe(110_000);
    expect(deadlineFor(300, 1_000)).toBe(291_000);
    expect(timeLeft(10_000, 4_000)).toBe(6_000);
    expect(timeLeft(10_000, 12_000)).toBe(0);
  });
});
