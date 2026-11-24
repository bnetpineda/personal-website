import { describe, expect, test } from "bun:test";
import { importedIncomeSince, nextMonthSameDay, payerName, repeatIncomeByMonth, repeatPayers as detect, subscriptions, typicalIncome, type ImportedFlow } from "./repeat-income";

const income = (description: string, occurredOn: string, amount: number, currency = "PHP") =>
  ({ description, occurredOn, amount, currency, categoryName: "Business", categoryColor: "var(--chart-1)" });
/** Every month in these fixtures has closed by December 2026. */
const repeatPayers = (entries: ImportedFlow[]) => detect(entries, "2026-12");

describe("the month in progress", () => {
  // Paid on the 15th and the 30th; on Nov 20 only the first half of November has arrived.
  const twiceMonthly = [
    income("Client C", "2026-09-15", 500), income("Client C", "2026-09-30", 500),
    income("Client C", "2026-10-15", 500), income("Client C", "2026-10-30", 500),
    income("Client C", "2026-11-15", 500),
  ];

  test("is left out of the rate, the average and the range", () => {
    const [payer] = detect(twiceMonthly, "2026-11");
    expect(payer.monthly).toBe(1000);
    expect(payer.average).toBe(1000);
    expect([payer.low, payer.high]).toEqual([1000, 1000]);
    expect(payer.byMonth).toEqual({ "2026-09": 1000, "2026-10": 1000 });
  });

  test("still counts as the latest payment", () => {
    const [payer] = detect(twiceMonthly, "2026-11");
    expect(payer.lastOn).toBe("2026-11-15");
    expect(payer.payments).toBe(5);
  });

  test("a payer first seen last month waits for a second closed month", () => {
    expect(detect([income("New client", "2026-10-05", 100), income("New client", "2026-11-05", 100)], "2026-11")).toEqual([]);
  });

  test("six closed months are read, plus this one", () => {
    expect(importedIncomeSince("2026-11-20")).toBe("2026-05-01");
  });
});

describe("subscriptions", () => {
  const charge = (description: string, occurredOn: string, amount: number, currency = "PHP") =>
    ({ description, occurredOn, amount, currency, categoryName: "Subscriptions", categoryColor: "var(--chart-4)", categoryId: 7, account: "GoTyme" });

  test("a monthly charge of about the same amount is a subscription", () => {
    const [sub] = subscriptions([
      charge("Card payment: Netflix (549.00 PHP)", "2026-08-03", 549),
      charge("Card payment: Netflix (549.00 PHP)", "2026-09-03", 549),
      charge("Card payment: Netflix (599.00 PHP)", "2026-10-03", 599),
    ], "2026-11");
    expect(sub.name).toBe("Netflix");
    expect(sub.typical).toBe(549);
    expect(sub.nextOn).toBe("2026-11-03");
    expect(sub.categoryId).toBe(7);
    expect(sub.account).toBe("GoTyme");
  });

  test("groceries repeat several times a month, for different amounts, so they are not", () => {
    const grocery = ["2026-09-02", "2026-09-09", "2026-09-20", "2026-10-01", "2026-10-15"].map((d, i) => charge("Payment: SM Supermarket", d, 800 + i * 400));
    expect(subscriptions(grocery, "2026-11")).toEqual([]);
  });

  test("a charge whose amount swings is not", () => {
    expect(subscriptions([charge("Meralco", "2026-09-10", 1500), charge("Meralco", "2026-10-10", 2600)], "2026-11")).toEqual([]);
  });

  test("one that stopped more than two months ago is not", () => {
    expect(subscriptions([charge("Spotify", "2026-05-01", 149), charge("Spotify", "2026-06-01", 149)], "2026-11")).toEqual([]);
  });

  test("a payee an expense schedule already covers is left out", () => {
    const charges = [charge("Card payment: Spotify (149.00 PHP)", "2026-09-01", 149), charge("Card payment: Spotify (149.00 PHP)", "2026-10-01", 149)];
    expect(subscriptions(charges, "2026-11", ["Spotify"])).toEqual([]);
    expect(subscriptions(charges, "2026-11", ["Rent"])).toHaveLength(1);
  });

  test("the next charge lands on the same day next month, or that month's last day", () => {
    expect(nextMonthSameDay("2026-01-31")).toBe("2026-02-28");
    expect(nextMonthSameDay("2026-12-15")).toBe("2027-01-15");
  });

  test("this month's charge moves the next date on", () => {
    const [sub] = subscriptions([charge("iCloud", "2026-09-12", 49), charge("iCloud", "2026-10-12", 49), charge("iCloud", "2026-11-12", 49)], "2026-11");
    expect(sub.nextOn).toBe("2026-12-12");
  });
});

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

  test("estimated income adds active income schedules to repeat payers", () => {
    const payers = repeatPayers([income("Employer", "2026-05-30", 1000), income("Employer", "2026-06-30", 1000)]);
    const schedule = { kind: "income" as const, amount: 500, currency: "PHP", frequency: "monthly" as const, paused: false, nextOn: "2026-07-01" };
    expect(typicalIncome({}, [schedule, { ...schedule, paused: true }, { ...schedule, kind: "expense" }], payers).average).toBe(1500);
    expect(importedIncomeSince("2026-09-27")).toBe("2026-03-01");
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
    expect(typical).toEqual({ average: 56_000 + 1_900 * 50, low: 54_000 + 1_800 * 50, high: 58_000 + 2_000 * 50, fixed: 0, sources: 2, missing: [] });
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
