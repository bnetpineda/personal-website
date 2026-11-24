import { expect, test } from "bun:test";
import { assumedMinimum, comparePayoff, nextDueDate, payoffPlan, type PlanDebt } from "./debt";

test("the next due date clamps to short months and rolls over once the day has passed", () => {
  expect(nextDueDate(15, "2026-11-10")).toEqual({ date: "2026-11-15", inDays: 5 });
  expect(nextDueDate(15, "2026-11-15")).toEqual({ date: "2026-11-15", inDays: 0 });
  expect(nextDueDate(15, "2026-11-16")).toEqual({ date: "2026-12-15", inDays: 29 });
  expect(nextDueDate(31, "2027-02-10")).toEqual({ date: "2027-02-28", inDays: 18 });
  expect(nextDueDate(31, "2028-02-29")).toEqual({ date: "2028-02-29", inDays: 0 });
  expect(nextDueDate(30, "2026-12-31")).toEqual({ date: "2027-01-30", inDays: 30 });
});

const card: PlanDebt = { id: "card", name: "Card", balance: 50_000, rate: 36, minPayment: 2_000 };
const loan: PlanDebt = { id: "loan", name: "Loan", balance: 10_000, rate: 12, minPayment: 300 };
const options = { extra: 3_000, ratePer: "year" as const, startMonth: "2026-12" };

test("an interest-free debt pays off in balance / payment months", () => {
  const plan = payoffPlan([{ id: "a", name: "A", balance: 1_000, rate: null, minPayment: 300 }], "minimum", options);
  expect(plan).toMatchObject({ feasible: true, months: 4, debtFreeMonth: "2027-03", totalInterest: 0, totalPaid: 1_000 });
});

test("avalanche clears the highest rate first; snowball the smallest balance, and avalanche pays less interest", () => {
  const avalanche = payoffPlan([card, loan], "avalanche", options);
  const snowball = payoffPlan([card, loan], "snowball", options);
  expect(avalanche.order[0].id).toBe("card");
  expect(snowball.order[0].id).toBe("loan");
  expect(avalanche.feasible && snowball.feasible).toBe(true);
  expect(avalanche.totalInterest).toBeLessThan(snowball.totalInterest);
  expect(avalanche.totalPaid).toBeCloseTo(60_000 + avalanche.totalInterest, 0);
});

test("comparison reports interest saved and months sooner than paying only the minimums", () => {
  const result = comparePayoff([card, loan], options);
  expect(result.minimum.feasible).toBe(true);
  expect(result.avalanche.saved).toBeGreaterThan(0);
  expect(result.avalanche.monthsSooner).toBeGreaterThan(0);
  expect(result.avalanche.saved).toBeCloseTo(result.minimum.totalInterest - result.avalanche.totalInterest, 2);
});

test("payments that never cover the interest are reported as not feasible", () => {
  const plan = payoffPlan([{ id: "x", name: "X", balance: 100_000, rate: 5, minPayment: 1_000 }], "minimum", { ...options, ratePer: "month" });
  expect(plan.feasible).toBe(false);
  expect(plan.debtFreeMonth).toBeNull();
  expect(comparePayoff([{ id: "x", name: "X", balance: 100_000, rate: 5, minPayment: 1_000 }], { ...options, extra: 0, ratePer: "month" }).avalanche.saved).toBeNull();
});

test("a monthly rate charges twelve times a yearly one", () => {
  const yearly = payoffPlan([{ ...card, rate: 3 }], "minimum", { ...options, ratePer: "year" });
  const monthly = payoffPlan([{ ...card, rate: 3 }], "minimum", { ...options, ratePer: "month" });
  expect(monthly.totalInterest).toBeGreaterThan(yearly.totalInterest * 8);
});

test("a missing minimum assumes interest plus 1%, at least ₱500, never more than the balance", () => {
  expect(assumedMinimum({ balance: 100_000, rate: 36 }, "year")).toBe(4_000);
  expect(assumedMinimum({ balance: 10_000, rate: null }, "year")).toBe(500);
  expect(assumedMinimum({ balance: 300, rate: null }, "year")).toBe(300);
});

test("no debts: nothing to plan", () => {
  expect(payoffPlan([], "avalanche", options)).toMatchObject({ feasible: true, months: 0, debtFreeMonth: null, order: [] });
});
