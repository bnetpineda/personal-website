import { describe, expect, test } from "bun:test";
import { addMonths, currentMonth, isMonth, monthRange, nextDueDate, timeAgo, todayManila } from "./dates";

describe("Manila calendar", () => {
  test("todayManila uses UTC+8, not the server's UTC date", () => {
    // 2026-09-19 16:30 UTC is already 2026-09-20 00:30 in Manila.
    expect(todayManila(new Date("2026-09-19T16:30:00Z"))).toBe("2026-09-20");
    expect(todayManila(new Date("2026-09-19T15:59:59Z"))).toBe("2026-09-19");
    expect(currentMonth(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01");
  });

  test("month helpers roll over years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", -14)).toBe("2025-01");
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });

  test("isMonth validates the ?month= param", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-9")).toBe(false);
    expect(isMonth(undefined)).toBe(false);
  });

  test("nextDueDate clamps to short months and rolls to next month", () => {
    expect(nextDueDate(15, "2026-09-10")).toEqual({ date: "2026-09-15", inDays: 5 });
    expect(nextDueDate(15, "2026-09-15")).toEqual({ date: "2026-09-15", inDays: 0 });
    expect(nextDueDate(5, "2026-09-20")).toEqual({ date: "2026-10-05", inDays: 15 });
    expect(nextDueDate(31, "2026-02-10")).toEqual({ date: "2026-02-28", inDays: 18 });
  });

  test("timeAgo", () => {
    const now = new Date("2026-09-19T12:00:00Z");
    expect(timeAgo(new Date("2026-09-19T11:59:40Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-09-19T11:15:00Z"), now)).toBe("45 min ago");
    expect(timeAgo(new Date("2026-09-19T06:00:00Z"), now)).toBe("6 h ago");
    expect(timeAgo(new Date("2026-09-15T12:00:00Z"), now)).toBe("4 d ago");
  });
});
