import { describe, expect, test } from "bun:test";
import {
  defaultSecondDay,
  describeSchedule,
  dueOccurrences,
  monthlyEquivalent,
  nextOccurrence,
  occurrencesBetween,
  occurrencesOf,
  upcomingOccurrences,
} from "./recurrence";

describe("due and upcoming", () => {
  const today = "2026-09-22";
  const base = { paused: false, endOn: null, secondDay: null };
  const rent = { ...base, id: "rent", frequency: "monthly" as const, startOn: "2026-01-05", nextOn: "2026-10-05", autoPost: true };
  const power = { ...base, id: "power", frequency: "monthly" as const, startOn: "2026-01-10", nextOn: "2026-08-10", autoPost: false };
  const gym = { ...base, id: "gym", frequency: "monthly" as const, startOn: "2026-01-01", nextOn: "2026-10-01", autoPost: true, paused: true };
  const ended = { ...base, id: "old", frequency: "monthly" as const, startOn: "2026-01-01", nextOn: null, autoPost: true };
  const items = [rent, power, gym, ended];

  test("due = confirm-mode occurrences from the cursor up to today", () => {
    expect(dueOccurrences(items, today).map((o) => `${o.item.id} ${o.date}`)).toEqual(["power 2026-08-10", "power 2026-09-10"]);
  });

  test("upcoming skips paused/ended items and confirm-mode dates already due", () => {
    expect(upcomingOccurrences(items, today, "2026-08-01", "2026-10-31").map((o) => `${o.item.id} ${o.date}`)).toEqual([
      "rent 2026-10-05",
      "power 2026-10-10",
    ]);
  });
});

describe("occurrencesBetween", () => {
  test("monthly on the 31st clamps to short months without drifting", () => {
    expect(occurrencesBetween({ frequency: "monthly", startOn: "2026-01-31" }, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  test("never returns dates before the start or after the end", () => {
    const s = { frequency: "monthly" as const, startOn: "2026-09-15", endOn: "2026-11-15" };
    expect(occurrencesBetween(s, "2026-01-01", "2027-12-31")).toEqual(["2026-09-15", "2026-10-15", "2026-11-15"]);
    expect(occurrencesBetween(s, "2026-11-16", "2027-12-31")).toEqual([]);
  });

  test("weekly and every 2 weeks step from the start date", () => {
    expect(occurrencesBetween({ frequency: "weekly", startOn: "2026-09-04" }, "2026-09-10", "2026-09-30")).toEqual([
      "2026-09-11",
      "2026-09-18",
      "2026-09-25",
    ]);
    expect(occurrencesBetween({ frequency: "biweekly", startOn: "2026-09-04" }, "2026-09-05", "2026-10-31")).toEqual([
      "2026-09-18",
      "2026-10-02",
      "2026-10-16",
      "2026-10-30",
    ]);
  });

  test("twice a month: 15th and 30th, with February clamped", () => {
    const s = { frequency: "semimonthly" as const, startOn: "2026-01-15", secondDay: 30 };
    expect(occurrencesBetween(s, "2026-01-01", "2026-03-31")).toEqual([
      "2026-01-15",
      "2026-01-30",
      "2026-02-15",
      "2026-02-28",
      "2026-03-15",
      "2026-03-30",
    ]);
  });

  test("twice a month skips the second day when it falls before the start", () => {
    expect(occurrencesBetween({ frequency: "semimonthly", startOn: "2026-09-20", secondDay: 5 }, "2026-09-01", "2026-10-31")).toEqual([
      "2026-09-20",
      "2026-10-05",
      "2026-10-20",
    ]);
  });

  test("quarterly, every 6 months and yearly", () => {
    expect(occurrencesBetween({ frequency: "quarterly", startOn: "2026-01-10" }, "2026-02-01", "2026-12-31")).toEqual([
      "2026-04-10",
      "2026-07-10",
      "2026-10-10",
    ]);
    expect(occurrencesBetween({ frequency: "semiannual", startOn: "2026-03-01" }, "2026-01-01", "2027-12-31")).toEqual([
      "2026-03-01",
      "2026-09-01",
      "2027-03-01",
      "2027-09-01",
    ]);
    expect(occurrencesBetween({ frequency: "yearly", startOn: "2024-02-29" }, "2025-01-01", "2028-12-31")).toEqual([
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });
});

describe("nextOccurrence", () => {
  test("finds the next date on or after a day", () => {
    const s = { frequency: "monthly" as const, startOn: "2026-09-15" };
    expect(nextOccurrence(s, "2026-09-15")).toBe("2026-09-15");
    expect(nextOccurrence(s, "2026-09-16")).toBe("2026-10-15");
    expect(nextOccurrence(s, "2026-01-01")).toBe("2026-09-15");
    expect(nextOccurrence({ frequency: "yearly", startOn: "2026-01-01" }, "2026-01-02")).toBe("2027-01-01");
  });

  test("returns null once the schedule has ended", () => {
    expect(nextOccurrence({ frequency: "monthly", startOn: "2026-09-15", endOn: "2026-10-01" }, "2026-09-16")).toBeNull();
  });
});

describe("helpers", () => {
  test("defaultSecondDay pairs days 15 apart", () => {
    expect(defaultSecondDay("2026-09-15")).toBe(30);
    expect(defaultSecondDay("2026-09-10")).toBe(25);
    expect(defaultSecondDay("2026-09-30")).toBe(15);
  });

  test("monthlyEquivalent", () => {
    expect(monthlyEquivalent(1200, "yearly")).toBe(100);
    expect(monthlyEquivalent(100, "semimonthly")).toBe(200);
    expect(monthlyEquivalent(1200, "weekly")).toBe(5200);
  });

  test("describeSchedule", () => {
    expect(describeSchedule({ frequency: "monthly", startOn: "2026-09-15" })).toBe("Monthly on the 15th");
    expect(describeSchedule({ frequency: "monthly", startOn: "2026-08-31" })).toBe("Monthly on the last day");
    expect(describeSchedule({ frequency: "biweekly", startOn: "2026-09-04" })).toBe("Every 2 weeks on Fri");
    expect(describeSchedule({ frequency: "semimonthly", startOn: "2026-09-30", secondDay: 15 })).toBe("Twice a month · 15th & 30th");
    expect(describeSchedule({ frequency: "yearly", startOn: "2026-03-05" })).toBe("Yearly on Mar 5");
  });

  test("occurrencesOf merges schedules by date and honours a per-item start", () => {
    const items = [
      { name: "rent", s: { frequency: "monthly" as const, startOn: "2026-09-05" } },
      { name: "pay", s: { frequency: "semimonthly" as const, startOn: "2026-09-15", secondDay: 30, from: "2026-09-30" } },
    ];
    const got = occurrencesOf(items, (i) => i.s, "2026-09-01", "2026-10-10").map((o) => `${o.date} ${o.item.name}`);
    expect(got).toEqual(["2026-09-05 rent", "2026-09-30 pay", "2026-10-05 rent"]);
  });
});
