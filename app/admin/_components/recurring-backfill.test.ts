import { describe, expect, test } from "bun:test";
import { backfillNote } from "./recurring-backfill";

describe("recurring backfill preview", () => {
  test("a past first date says how many entries saving adds", () => {
    expect(backfillNote({ frequency: "monthly", startOn: "2026-08-01" }, "2026-11-25", true)).toBe("Saving adds 4 entries now, from the first date through today.");
  });

  test("items that ask first say the entries will wait", () => {
    expect(backfillNote({ frequency: "weekly", startOn: "2026-11-18" }, "2026-11-25", false)).toBe("2 entries from the first date through today will wait for you to confirm.");
  });

  test("today or a future first date adds nothing yet", () => {
    expect(backfillNote({ frequency: "monthly", startOn: "2026-12-01" }, "2026-11-25", true)).toBeNull();
    expect(backfillNote({ frequency: "monthly", startOn: "2026-11-25" }, "2026-11-25", true)).toBe("Saving adds 1 entry now, from the first date through today.");
  });

  test("an end date in the past caps the count", () => {
    expect(backfillNote({ frequency: "monthly", startOn: "2026-01-15", endOn: "2026-03-31" }, "2026-11-25", true)).toBe("Saving adds 3 entries now, from the first date through today.");
  });
});
