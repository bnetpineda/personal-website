import { describe, expect, test } from "bun:test";
import { runDailySteps, within, type DailyStep } from "./daily-steps";

describe("daily job steps", () => {
  test("a failed step is recorded by error name only, and the later steps still run", async () => {
    const ran: string[] = [];
    const steps: DailyStep[] = [
      { name: "rates", run: async () => { ran.push("rates"); throw new Error("Failed query: insert ... params: 1234.56,secret payee"); } },
      { name: "recurring", run: async () => { ran.push("recurring"); return { posted: 2 }; } },
    ];
    const outcomes = await runDailySteps(steps, Date.now() + 60_000);
    expect(ran).toEqual(["rates", "recurring"]);
    expect(outcomes.rates).toMatchObject({ status: "failed", error: "Error" });
    expect(JSON.stringify(outcomes)).not.toContain("secret payee");
    expect(outcomes.recurring).toMatchObject({ status: "ok", value: { posted: 2 } });
  });

  test("a step that needs more time than is left is skipped, and cheap steps after it still run", async () => {
    let clock = 0;
    const steps: DailyStep[] = [
      { name: "sync", needsMs: 100_000, run: async () => "synced" },
      { name: "snapshot", run: async () => { clock += 5; return "saved"; } },
    ];
    const outcomes = await runDailySteps(steps, 50_000, () => clock);
    expect(outcomes.sync).toEqual({ status: "skipped", reason: "out of time" });
    expect(outcomes.snapshot).toEqual({ status: "ok", ms: 5, value: "saved" });
  });

  test("each step is told the job's deadline", async () => {
    const seen: number[] = [];
    await runDailySteps([{ name: "a", run: async (deadline) => seen.push(deadline) }], 123_456, () => 0);
    expect(seen).toEqual([123_456]);
  });

  test("within() moves on at the limit while the work keeps going", async () => {
    let finished = false;
    const slow = new Promise<string>((resolve) => setTimeout(() => { finished = true; resolve("done"); }, 50));
    expect(await within(slow, 5, () => "late")).toBe("late");
    expect(finished).toBe(false);
    expect(await within(Promise.resolve("quick"), 1_000, () => "late")).toBe("quick");
  });
});
