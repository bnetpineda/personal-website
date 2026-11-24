import { describe, expect, test } from "bun:test";
import { stableDayRange } from "./stable-dates";

describe("date ranges that render the same on the server and in the browser", () => {
  test("one day, one month, two months and two years", () => {
    expect(stableDayRange("2026-11-25", "2026-11-25")).toBe("Nov 25, 2026");
    expect(stableDayRange("2026-11-02", "2026-11-25")).toBe("Nov 2 – 25, 2026");
    expect(stableDayRange("2026-10-30", "2026-11-25")).toBe("Oct 30 – Nov 25, 2026");
    expect(stableDayRange("2025-12-30", "2026-01-02")).toBe("Dec 30, 2025 – Jan 2, 2026");
  });
});
