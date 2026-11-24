import { describe, expect, test } from "bun:test";
import { monthEnds } from "./month-ends";

describe("net worth details rows", () => {
  test("keeps each month's last saved day, newest month first, whatever the input order", () => {
    const rows = monthEnds([
      { date: "2026-10-31", v: 3 },
      { date: "2026-09-02", v: 1 },
      { date: "2026-11-05", v: 4 },
      { date: "2026-09-30", v: 2 },
    ]);
    expect(rows.map((r) => r.date)).toEqual(["2026-11-05", "2026-10-31", "2026-09-30"]);
  });

  test("an empty history has no rows", () => {
    expect(monthEnds([])).toEqual([]);
  });
});
