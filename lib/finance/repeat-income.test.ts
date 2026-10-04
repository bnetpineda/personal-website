import { describe, expect, test } from "bun:test";
import { importedIncomeSince, monthlyIncome, payerName, repeatIncomeByMonth, repeatPayers, typicalIncome } from "./repeat-income";

const income = (description: string, occurredOn: string, amount: number, currency = "PHP") =>
  ({ description, occurredOn, amount, currency, categoryName: "Business", categoryColor: "var(--chart-1)" });

describe("repeat payers", () => {
  test("names the Wise sender", () => {
    expect(payerName("Received money from Centauri Media Ltd with reference INV-12")).toBe("Centauri Media Ltd");
    expect(payerName("Received money from Centauri Media Ltd")).toBe("Centauri Media Ltd");
    expect(payerName("Dividend  AAPL")).toBe("Dividend AAPL");
    expect(payerName("Received from Acme Studio Ltd")).toBe("Acme Studio Ltd");
  });

  test("a monthly payer's rate is its latest pay; the average covers every month", () => {
    const [payer] = repeatPayers([
      income("Received money from Centauri Media Ltd with reference 0426", "2026-04-07", 54622.19),
      income("Received money from Centauri Media Ltd with reference 0526", "2026-05-05", 58590.99),
      income("Received money from Centauri Media Ltd with reference 0626", "2026-06-07", 56028.61),
    ]);
    expect(payer.name).toBe("Centauri Media Ltd");
    expect(payer.payments).toBe(3);
    expect(payer.lastOn).toBe("2026-06-07");
    expect(payer.monthly).toBe(56028.61);
    expect(payer.average).toBeCloseTo(56413.93, 2);
  });

  test("spreads a quarterly payer across the gap", () => {
    const [payer] = repeatPayers([income("Client A", "2026-03-10", 300), income("Client A", "2026-06-10", 300)]);
    expect(payer.monthly).toBe(100);
    expect(payer.average).toBe(150);
  });

  test("one-off and same-month payments are not recurring", () => {
    expect(repeatPayers([income("Gift", "2026-05-01", 100), income("Refund", "2026-06-01", 50)])).toEqual([]);
    expect(repeatPayers([income("Bonus", "2026-05-01", 100), income("Bonus", "2026-05-20", 100)])).toEqual([]);
  });

  test("a raise shows in the current rate", () => {
    const [payer] = repeatPayers([income("Employer", "2026-04-30", 1000), income("Employer", "2026-05-30", 1000), income("Employer", "2026-06-30", 1200)]);
    expect(payer.monthly).toBe(1200);
  });

  test("monthly income adds schedules to repeat payers", () => {
    const payers = repeatPayers([income("Employer", "2026-05-30", 1000), income("Employer", "2026-06-30", 1000)]);
    const schedule = { kind: "income" as const, amount: 500, currency: "PHP", frequency: "monthly" as const, paused: false, nextOn: "2026-07-01" };
    expect(monthlyIncome({}, [schedule, { ...schedule, paused: true }, { ...schedule, kind: "expense" }], payers).total).toBe(1500);
    expect(importedIncomeSince("2026-09-27")).toBe("2026-04-01");
  });

  test("keeps currencies apart", () => {
    const payers = repeatPayers([
      income("Client B", "2026-04-01", 10, "USD"), income("Client B", "2026-05-01", 10, "USD"),
      income("Client B", "2026-05-01", 500), income("Client B", "2026-06-01", 500),
    ]);
    expect(payers.map((p) => p.currency).sort()).toEqual(["PHP", "USD"]);
  });
});

describe("typical income for hourly work", () => {
  // Same client, different hours each month; a second client paying in dollars.
  const payers = repeatPayers([
    income("Received from Centauri Media Ltd", "2026-07-07", 54_000),
    income("Received from Centauri Media Ltd", "2026-08-07", 58_000),
    income("Received from Centauri Media Ltd", "2026-09-07", 56_000),
    income("Received from Romer Martin LLC", "2026-08-24", 1_800, "USD"),
    income("Received from Romer Martin LLC", "2026-09-22", 2_000, "USD"),
  ]);

  test("each payer keeps its lowest and highest month", () => {
    const centauri = payers.find((p) => p.name === "Centauri Media Ltd")!;
    expect([centauri.low, centauri.high, centauri.average]).toEqual([54_000, 58_000, 56_000]);
  });

  test("adds each payer's average month, with everyone's low and high months as the range", () => {
    const typical = typicalIncome({ USD: 50 }, [], payers);
    expect(typical).toEqual({ average: 56_000 + 1_900 * 50, low: 54_000 + 1_800 * 50, high: 58_000 + 2_000 * 50, sources: 2, missing: [] });
  });

  test("an active income schedule counts at its fixed monthly amount; missing rates are reported", () => {
    const schedule = { kind: "income" as const, amount: 1_000, currency: "PHP", frequency: "monthly" as const, paused: false, nextOn: "2026-10-01" };
    const typical = typicalIncome({}, [schedule], payers);
    expect(typical.low).toBe(1_000 + 54_000);
    expect(typical.missing).toEqual(["USD"]);
  });
});

test("repeat payers' pay per month, in PHP, for the months asked", () => {
  const payers = repeatPayers([
    income("Received from Centauri Media Ltd", "2026-08-07", 58_000),
    income("Received from Centauri Media Ltd", "2026-09-07", 56_000),
    income("Received from Romer Martin LLC", "2026-08-24", 1_800, "USD"),
    income("Received from Romer Martin LLC", "2026-09-22", 2_000, "USD"),
    income("One-off gig", "2026-09-15", 9_999),
  ]);
  expect(repeatIncomeByMonth({ USD: 50 }, payers, ["2026-07", "2026-08", "2026-09"])).toEqual([
    { month: "2026-07", value: 0 },
    { month: "2026-08", value: 58_000 + 1_800 * 50 },
    { month: "2026-09", value: 56_000 + 2_000 * 50 },
  ]);
});
