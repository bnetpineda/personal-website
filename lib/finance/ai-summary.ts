import { z } from "zod";
import { allocation, fxToPhp, monthBudget, type FxTable, type NetWorth } from "./calc";
import { ASSET_CLASS_META, GOAL_MEASURE_LABELS, LIABILITY_KIND_LABELS, type AssetClass, type GoalMeasure, type LiabilityKind, type RecurrenceFrequency } from "./constants";
import { addDays, daysBetween, monthRange } from "./dates";
import type { GoalProgress } from "./goals";
import { monthlyEquivalent } from "./recurrence";

/*
 * The Overview's AI feedback: what the model is told and what it must answer. Pure (no I/O) and
 * unit-tested. Only totals leave the app: no payee names, descriptions, account numbers or notes.
 */

/**
 * What the model answers: a glance, not a report. Lengths are asked for in the prompt and enforced afterwards,
 * so a long answer is trimmed, not lost. Bump PROMPT_VERSION when this or the prompt changes, so the next run
 * writes a new summary even if the numbers are the same.
 */
export const PROMPT_VERSION = 2;

export const financeSummarySchema = z.object({
  headline: z.string().describe("At most 12 words: the one thing that matters most right now."),
  status: z.enum(["on_track", "watch", "act"]).describe("on_track: nothing urgent. watch: something is drifting. act: something needs doing this month."),
  points: z.array(z.object({
    tone: z.enum(["good", "watch", "act"]),
    text: z.string().describe("At most 14 words, with the key number. No filler."),
  })).describe("Two or three points, most important first."),
  actions: z.array(z.string().describe("At most 12 words: verb, amount, deadline. E.g. 'Move ₱30,000 to savings by Nov 30'.")).describe("One or two next steps."),
  caveat: z.string().nullable().describe("At most 12 words on the biggest data gap, or null when the data is complete."),
});

export type FinanceSummary = z.infer<typeof financeSummarySchema>;

const clip = (text: string, max: number) => (text.length <= max ? text.trim() : `${text.slice(0, max - 1).trimEnd()}…`);

/** Keeps a model's answer inside what the panel can show. */
export function tidySummary(summary: FinanceSummary): FinanceSummary {
  return {
    headline: clip(summary.headline, 100),
    status: summary.status,
    points: summary.points.slice(0, 3).map((p) => ({ tone: p.tone, text: clip(p.text, 110) })),
    actions: summary.actions.slice(0, 2).map((a) => clip(a, 90)),
    caveat: summary.caveat ? clip(summary.caveat, 90) : null,
  };
}

/** A saved summary in today's shape, or null (older, longer ones are written again on the next refresh). */
export function readSummary(value: unknown): FinanceSummary | null {
  const parsed = financeSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const peso = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n));
const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 1000) / 10);

export interface SummaryInput {
  today: string;
  /** YYYY-MM */
  current: string;
  fx: FxTable;
  netWorth: NetWorth;
  /** Daily net-worth history, oldest first. */
  snapshots: readonly { date: string; netWorth: number }[];
  debts: readonly { kind: LiabilityKind; balance: number; currency: string; creditLimit: number | null; interestRate: number | null; minPayment: number | null }[];
  /** The last twelve closed months and this one, oldest first; null is unknown (missing statements), never zero. */
  months: readonly { month: string; income: number | null; expense: number | null; incomplete: boolean }[];
  /** Spending per category per month, PHP. */
  categorySpending: readonly { categoryId: number; month: string; total: number }[];
  categories: readonly { id: number; name: string; kind: "income" | "expense"; monthlyBudget: number | null; archived: boolean }[];
  /** This month's own budgets (see category_budgets). */
  monthBudgets: ReadonlyMap<number, number | null>;
  recurring: readonly { kind: "income" | "expense"; amount: number; currency: string; frequency: RecurrenceFrequency; paused: boolean; nextOn: string | null }[];
  goals: readonly { name: string; measure: GoalMeasure; targetOn: string | null; progress: GoalProgress }[];
  emergencyMonths: number | null;
  /** Already in plain words: out-of-date accounts, missing statements, missing exchange rates. */
  gaps: readonly string[];
}

/** The facts the model sees, compact and rounded. Everything it says has to come from here. */
export function buildSummaryFacts(input: SummaryInput) {
  const { today, current, fx, netWorth: nw } = input;
  const closed = input.months.filter((m) => m.month < current);
  const complete = closed.filter((m) => !m.incomplete && m.income != null && m.expense != null);
  const avg = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null);
  const avgIncome = avg(complete.map((m) => m.income!));
  const avgSpending = avg(complete.map((m) => m.expense!));

  const ago = (days: number) => [...input.snapshots].reverse().find((s) => s.date <= addDays(today, -days));
  const changeSince = (days: number) => {
    const then = ago(days);
    return then ? peso(nw.netWorthPhp - then.netWorth) : null;
  };

  // The three most recent complete months, so a partial month doesn't pass for a frugal one.
  const recent = complete.slice(-3).map((m) => m.month);
  const expenseCategories = input.categories.filter((c) => c.kind === "expense");
  const topSpending = expenseCategories
    .map((c) => {
      const totals = recent.map((month) => input.categorySpending.find((s) => s.categoryId === c.id && s.month === month)?.total ?? 0);
      return { category: c.name, monthlyAverage: recent.length ? totals.reduce((s, v) => s + v, 0) / recent.length : 0, defaultBudget: c.monthlyBudget };
    })
    .filter((c) => c.monthlyAverage > 0)
    .sort((a, b) => b.monthlyAverage - a.monthlyAverage)
    .slice(0, 8)
    .map((c) => ({ category: c.category, monthlyAverage: peso(c.monthlyAverage), monthlyBudget: peso(c.defaultBudget) }));

  const { start, end } = monthRange(current);
  const thisMonth = input.months.find((m) => m.month === current);
  const budgets = expenseCategories
    .filter((c) => !c.archived)
    .flatMap((c) => {
      const budget = monthBudget(c, input.monthBudgets);
      if (!budget) return [];
      const spent = input.categorySpending.find((s) => s.categoryId === c.id && s.month === current)?.total ?? 0;
      return [{ category: c.name, budget: peso(budget), spentSoFar: peso(spent), usedPct: pct(spent / budget) }];
    });

  const recurringMonthly = (kind: "income" | "expense") => {
    let total = 0;
    for (const r of input.recurring) {
      if (r.kind !== kind || r.paused || r.nextOn == null) continue;
      const rate = fxToPhp(fx, r.currency);
      if (rate != null) total += monthlyEquivalent(r.amount, r.frequency) * rate;
    }
    return peso(total);
  };

  return {
    today,
    currency: "PHP",
    netWorth: {
      total: peso(nw.netWorthPhp),
      owned: peso(nw.assetsPhp),
      owed: peso(nw.liabilitiesPhp),
      changeLast30Days: changeSince(30),
      changeLast90Days: changeSince(90),
      note: "Changes count every peso in or out: pay, spending and deposits as well as market moves.",
    },
    cash: peso(nw.byClass.cash ?? 0),
    emergencyFundMonths: input.emergencyMonths == null ? null : Math.round(input.emergencyMonths * 10) / 10,
    allocation: allocation(nw.byClass).map((a) => ({ assetClass: ASSET_CLASS_META[a.assetClass as AssetClass].plural, sharePct: pct(a.share) })),
    debts: input.debts.map((d) => {
      const rate = fxToPhp(fx, d.currency);
      return {
        type: LIABILITY_KIND_LABELS[d.kind],
        balance: rate == null ? null : peso(d.balance * rate),
        interestRatePct: d.interestRate,
        creditUsedPct: d.creditLimit ? pct(d.balance / d.creditLimit) : null,
        minimumPayment: rate == null || d.minPayment == null ? null : peso(d.minPayment * rate),
      };
    }),
    months: input.months.map((m) => ({
      month: m.month,
      income: peso(m.income),
      spending: peso(m.expense),
      status: m.month === current ? "in progress" : m.incomplete ? "incomplete: statements missing" : "complete",
    })),
    averagesOverCompleteMonths: {
      months: complete.length,
      income: peso(avgIncome),
      spending: peso(avgSpending),
      savingsRatePct: avgIncome && avgSpending != null ? pct((avgIncome - avgSpending) / avgIncome) : null,
    },
    topSpendingCategories: topSpending,
    thisMonth: {
      month: current,
      daysElapsed: daysBetween(start, today) + 1,
      daysInMonth: daysBetween(start, end),
      incomeSoFar: peso(thisMonth?.income),
      spendingSoFar: peso(thisMonth?.expense),
      budgets,
    },
    scheduled: { monthlyIncome: recurringMonthly("income"), monthlyExpenses: recurringMonthly("expense") },
    goals: input.goals.map((g) => ({
      name: g.name,
      tracks: GOAL_MEASURE_LABELS[g.measure],
      unit: g.progress.unit,
      current: g.progress.unit === "months" ? g.progress.current : peso(g.progress.current),
      target: g.progress.target,
      progressPct: pct(g.progress.ratio),
      by: g.targetOn,
      toSavePerMonth: peso(g.progress.perMonth),
    })),
    incomeIsVariable: "They are paid by the hour by several clients, so monthly income changes; there is no fixed salary.",
    dataGaps: input.gaps,
  };
}

export type SummaryFacts = ReturnType<typeof buildSummaryFacts>;

/** The parts of the facts that change a summary's meaning; the date alone doesn't call for a new one. */
export function hashableFacts(facts: SummaryFacts) {
  const { thisMonth, ...rest } = facts;
  return { ...rest, today: undefined, thisMonth: { ...thisMonth, daysElapsed: undefined }, promptVersion: PROMPT_VERSION };
}

export function buildSummaryPrompt(facts: SummaryFacts) {
  const instructions = [
    "You are a frank, warm personal finance coach for one person who lives in the Philippines and works for clients abroad. You write the feedback panel on their private finance dashboard.",
    "Use only the facts in the JSON you are given. Never invent numbers, accounts or events. Quote amounts in pesos rounded to the nearest hundred or thousand, like ₱12,000.",
    "null means unknown, never zero. A month marked incomplete or in progress is partial: don't treat a low partial total as frugality, and say when a conclusion rests on few complete months.",
    "Look, in roughly this order: the cash buffer against monthly spending, debts and their interest, income against spending and the savings rate, budgets this month (allowing for how far into the month it is), goals and whether their monthly saving is realistic, and concentration in the allocation.",
    "Their income is variable, so judge buffers against their typical spending and their lowest months, not one good month.",
    "Be specific: every action needs an amount, a destination or a habit, and a timeframe. Only the one or two changes that matter most.",
    "Don't recommend specific stocks, coins or funds, and don't predict markets; comments on how much is in each asset class are fine.",
    "Be extremely brief. It is read at a glance on a small panel: respect every word limit, no full explanations, no filler words, no repeating the headline in the points.",
    "If the data gaps are large enough to change the picture, name the biggest one in caveat.",
  ].join("\n");
  const prompt = `Today is ${facts.today}. Here are their finances (PHP):\n\n${JSON.stringify(facts)}`;
  return { instructions, prompt };
}
