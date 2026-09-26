import { describe, expect, test } from "bun:test";
import { importedIncomeSince, monthlyIncome, payerName, repeatPayers } from "./repeat-income";

const income = (description: string, occurredOn: string, amount: number, currency = "PHP") =>
  ({ description, occurredOn, amount, currency, categoryName: "Business", categoryColor: "var(--chart-1)" });

describe("repeat payers", () => {
  test("names the Wise sender", () => {
    expect(payerName("Received money from Centauri Media Ltd with reference INV-12")).toBe("Centauri Media Ltd");
    expect(payerName("Received money from Centauri Media Ltd")).toBe("Centauri Media Ltd");
    expect(payerName("Dividend  AAPL")).toBe("Dividend AAPL");
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
