import { describe, expect, test } from "bun:test";
import { buildSummaryFacts, buildSummaryPrompt, hashableFacts, readSummary, tidySummary, type SummaryInput } from "./ai-summary";
import { computeNetWorth } from "./calc";

const fx = { USD: 56 };
const input = (over: Partial<SummaryInput> = {}): SummaryInput => ({
  today: "2026-11-06",
  current: "2026-11",
  fx,
  netWorth: computeNetWorth(
    [{ assetClass: "cash", quantity: 1, avgCost: 120_000, currency: "PHP", lastPrice: 120_000 }],
    [{ balance: 25_000, currency: "PHP" }],
    fx,
  ),
  snapshots: [{ date: "2026-10-01", netWorth: 80_000 }],
  debts: [{ kind: "credit_card", balance: 25_000, currency: "PHP", creditLimit: 50_000, interestRate: 3, minPayment: 1_250 }],
  months: [
    { month: "2026-08", income: 90_000, expense: 40_000, incomplete: false },
    { month: "2026-09", income: 110_000, expense: 60_000, incomplete: false },
    { month: "2026-10", income: 0, expense: 500, incomplete: true },
    { month: "2026-11", income: 10_000, expense: 3_000, incomplete: true },
  ],
  categorySpending: [
    { categoryId: 1, month: "2026-08", total: 10_000 },
    { categoryId: 1, month: "2026-09", total: 20_000 },
    { categoryId: 1, month: "2026-11", total: 3_000 },
  ],
  categories: [{ id: 1, name: "Food", kind: "expense", monthlyBudget: 12_000, archived: false }],
  monthBudgets: new Map([[1, 4_000]]),
  recurring: [{ kind: "expense", amount: 15, currency: "USD", frequency: "monthly", paused: false, nextOn: "2026-11-20" }],
  goals: [],
  emergencyMonths: 2.4,
  gaps: ["MariBank statements stop in February"],
  ...over,
});

describe("AI summary facts", () => {
  test("averages use complete months only, so a month missing statements isn't read as frugal", () => {
    const facts = buildSummaryFacts(input());
    expect(facts.averagesOverCompleteMonths).toEqual({ months: 2, income: 100_000, spending: 50_000, savingsRatePct: 50 });
    expect(facts.topSpendingCategories).toEqual([{ category: "Food", monthlyAverage: 15_000, monthlyBudget: 12_000 }]);
    expect(facts.months.find((m) => m.month === "2026-10")?.status).toBe("incomplete: statements missing");
  });

  test("this month's budget is the month's own one, with how far into the month it is", () => {
    const { thisMonth } = buildSummaryFacts(input());
    expect(thisMonth.budgets).toEqual([{ category: "Food", budget: 4_000, spentSoFar: 3_000, usedPct: 75 }]);
    expect(thisMonth.daysElapsed).toBe(6);
    expect(thisMonth.daysInMonth).toBe(30);
  });

  test("debts, buffers and schedules come through as rounded pesos", () => {
    const facts = buildSummaryFacts(input());
    expect(facts.netWorth).toMatchObject({ total: 95_000, owned: 120_000, owed: 25_000, changeLast30Days: 15_000, changeLast90Days: null });
    expect(facts.debts[0]).toEqual({ type: "Credit card", balance: 25_000, interestRatePct: 3, creditUsedPct: 50, minimumPayment: 1_250 });
    expect(facts.scheduled.monthlyExpenses).toBe(840);
    expect(facts.emergencyFundMonths).toBe(2.4);
  });

  test("nothing identifying is sent: categories by name, never payees or notes", () => {
    const { prompt } = buildSummaryPrompt(buildSummaryFacts(input()));
    expect(prompt).toContain("Food");
    expect(prompt).not.toMatch(/notes|description|payee/i);
  });

  test("the date alone doesn't change what a summary means", () => {
    const a = hashableFacts(buildSummaryFacts(input()));
    const b = hashableFacts(buildSummaryFacts(input({ today: "2026-11-07" })));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("a long answer is trimmed to a glance", () => {
    const long = "x".repeat(500);
    const tidy = tidySummary({ headline: long, status: "watch", points: Array(6).fill({ tone: "good", text: long }), actions: Array(5).fill(long), caveat: long });
    expect(tidy.headline.length).toBe(100);
    expect(tidy.points).toHaveLength(3);
    expect(tidy.points[0].text.length).toBe(110);
    expect(tidy.actions).toHaveLength(2);
    expect(tidy.caveat?.length).toBe(90);
  });

  test("an older, longer saved summary isn't shown in the new panel", () => {
    expect(readSummary({ headline: "Old", status: "watch", insights: [], actions: [], caveats: [] })).toBeNull();
    expect(readSummary({ headline: "New", status: "act", points: [{ tone: "act", text: "Cash is thin" }], actions: ["Save"], caveat: null })?.headline).toBe("New");
  });
});
