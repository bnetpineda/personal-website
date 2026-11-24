import { describe, expect, test } from "bun:test";
import { addDays } from "./dates";
import {
  cursorAfterEdit,
  defaultSecondDay,
  describeSchedule,
  dueOccurrences,
  dueThrough,
  markHandled,
  unmarkHandled,
  MAX_OCCURRENCES,
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

describe("handling due occurrences out of order", () => {
  const bill = { frequency: "monthly" as const, startOn: "2026-01-01", endOn: null, secondDay: null };
  const item = { ...bill, id: "bill", paused: false, autoPost: false, nextOn: "2026-10-01", handledOn: [] as string[] };

  test("posting or skipping a later occurrence keeps the earlier one due", () => {
    const state = markHandled(bill, item, ["2026-11-01"]);
    expect(state).toEqual({ nextOn: "2026-10-01", handledOn: ["2026-11-01"] });
    expect(dueOccurrences([{ ...item, ...state }], "2026-11-20").map((o) => o.date)).toEqual(["2026-10-01"]);
  });

  test("handling the oldest moves the cursor past every handled one after it", () => {
    expect(markHandled(bill, { nextOn: "2026-10-01", handledOn: ["2026-11-01"] }, ["2026-10-01"])).toEqual({ nextOn: "2026-12-01", handledOn: [] });
  });

  test("handling the oldest alone moves to the next occurrence", () => {
    expect(markHandled(bill, item, ["2026-10-01"])).toEqual({ nextOn: "2026-11-01", handledOn: [] });
  });

  test("handled dates stay out of upcoming too", () => {
    const upcoming = upcomingOccurrences([{ ...item, nextOn: "2026-12-01", handledOn: ["2027-01-01"] }], "2026-11-20", "2026-11-20", "2027-02-28");
    expect(upcoming.map((o) => o.date)).toEqual(["2026-12-01", "2027-02-01"]);
  });

  test("an ended schedule clears what was handled", () => {
    expect(markHandled({ ...bill, endOn: "2026-10-31" }, item, ["2026-10-01"])).toEqual({ nextOn: null, handledOn: [] });
  });
});

describe("cursorAfterEdit", () => {
  const s = { frequency: "monthly" as const, startOn: "2026-01-01", endOn: "2027-06-30", secondDay: null };
  const today = "2026-11-20";

  test("an 'ask me' item keeps its waiting past occurrences", () => {
    expect(cursorAfterEdit(s, { nextOn: "2026-10-01", autoPost: false }, false, today)).toBe("2026-10-01");
  });

  test("a changed day starts at the first new occurrence after the old cursor", () => {
    expect(cursorAfterEdit({ ...s, startOn: "2026-01-15" }, { nextOn: "2026-10-01", autoPost: false }, false, today)).toBe("2026-10-15");
  });

  test("auto-post items, and items switched to auto-post, reschedule from today", () => {
    expect(cursorAfterEdit(s, { nextOn: "2026-10-01", autoPost: true }, true, today)).toBe("2026-12-01");
    expect(cursorAfterEdit(s, { nextOn: "2026-10-01", autoPost: false }, true, today)).toBe("2026-12-01");
  });

  test("a later start date wins", () => {
    expect(cursorAfterEdit({ ...s, startOn: "2027-02-01" }, { nextOn: "2026-10-01", autoPost: false }, false, today)).toBe("2027-02-01");
  });
});

describe("dueThrough", () => {
  test("covers every occurrence through today and moves the cursor past it", () => {
    const s = { frequency: "monthly" as const, startOn: "2026-01-31", endOn: null, secondDay: null };
    expect(dueThrough(s, { nextOn: "2026-01-31" }, "2026-03-31")).toEqual({ days: ["2026-01-31", "2026-02-28", "2026-03-31"], nextOn: "2026-04-30", more: false });
  });

  test("a capped catch-up resumes right after its last occurrence instead of jumping to today", () => {
    const s = { frequency: "weekly" as const, startOn: "2010-01-04", endOn: null, secondDay: null };
    const first = dueThrough(s, { nextOn: s.startOn }, "2026-11-20");
    expect(first.days).toHaveLength(MAX_OCCURRENCES);
    expect(first.more).toBe(true);
    expect(first.nextOn).toBe(nextOccurrence(s, addDays(first.days[first.days.length - 1], 1)));
    const second = dueThrough(s, { nextOn: first.nextOn }, "2026-11-20");
    expect(second.more).toBe(false);
    expect(second.days[0]).toBe(first.nextOn!);
    expect(second.days[second.days.length - 1] <= "2026-11-20").toBe(true);
    expect(second.nextOn! > "2026-11-20").toBe(true);
  });

  test("skips dates already handled", () => {
    const s = { frequency: "monthly" as const, startOn: "2026-01-01", endOn: null, secondDay: null };
    expect(dueThrough(s, { nextOn: "2026-01-01", handledOn: ["2026-02-01"] }, "2026-03-15").days).toEqual(["2026-01-01", "2026-03-01"]);
  });
});

describe("unmarkHandled (Undo of Skip or Post)", () => {
  const bill = { frequency: "monthly" as const, startOn: "2026-09-01", endOn: null, secondDay: null };
  const undoes = (state: { nextOn: string | null; handledOn: string[] }, days: string[]) => {
    const after = markHandled(bill, state, days);
    expect(unmarkHandled(bill, after, days)).toEqual(state);
  };

  test("undoing the front occurrence puts the cursor back", () => undoes({ nextOn: "2026-10-01", handledOn: [] }, ["2026-10-01"]));
  test("undoing a later occurrence keeps the cursor and un-hides it", () => undoes({ nextOn: "2026-10-01", handledOn: [] }, ["2026-11-01"]));
  test("undoing the front keeps an earlier out-of-order handle", () => undoes({ nextOn: "2026-10-01", handledOn: ["2026-11-01"] }, ["2026-10-01"]));
  test("undoing Post all restores every occurrence", () => undoes({ nextOn: "2026-09-01", handledOn: [] }, ["2026-09-01", "2026-10-01", "2026-11-01"]));
  test("an ended schedule comes back", () => {
    const ending = { ...bill, endOn: "2026-10-31" };
    const after = markHandled(ending, { nextOn: "2026-10-01", handledOn: [] }, ["2026-10-01"]);
    expect(unmarkHandled(ending, after, ["2026-10-01"])).toEqual({ nextOn: "2026-10-01", handledOn: [] });
  });
});
