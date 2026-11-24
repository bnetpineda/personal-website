import type { Metadata } from "next";
import { getGoals, getMonthlyTotals, getNetWorthNow, getSnapshots, getStatementImports } from "@/lib/dal";
import { monthlySeries } from "@/lib/finance/calc";
import { dashboardMonth } from "@/lib/finance/dashboard";
import { addDays, addMonths, currentMonth, fullDayLabel, todayManila } from "@/lib/finance/dates";
import { PACE_WINDOW_DAYS, averageMonthlySpending, goalPace, goalProgress, projectGoal, type GoalProjection } from "@/lib/finance/goals";
import { PortfolioSections } from "../../_components/admin-nav";
import { AddGoalButton, GoalList, type GoalDTO } from "../../_components/goals";
import { InfoNote, Money, PageHeader, PrivateFigure, StatCards } from "../../_components/ui";

export const metadata: Metadata = { title: "Goals" };

/** Spending is averaged over this many closed months for the emergency fund. */
const SPENDING_MONTHS = 6;

/** The projection in plain words, or null when there's nothing to say (reached, or a hand-tracked goal). */
function paceLabel(p: GoalProjection): string | null {
  switch (p.status) {
    case "reached": return null;
    case "unknown": return p.reason.startsWith("A goal you update") ? null : `At the recent pace: ${p.reason.toLowerCase()}`;
    case "not-closer": return "At the recent pace it isn't getting closer";
    case "too-far": return "At the recent pace it's more than 50 years away";
    case "on-pace": return `At the recent pace: around ${fullDayLabel(p.on)}${p.late === true ? ", after the date you set" : p.late === false ? ", in time" : ""}`;
  }
}

/** What you're saving towards, measured against live figures: net worth, cash, investments, or months of spending. */
/** Server Actions run under the calling page's limit (⌘K can sync from any page); see lib/finance/deadline.ts. */
export const maxDuration = 120;

export default async function GoalsPage() {
  const now = new Date();
  const today = todayManila(now);
  const current = currentMonth(now);
  const lastClosed = addMonths(current, -1);
  const [goals, nw, monthly, statements, snapshots] = await Promise.all([getGoals(), getNetWorthNow(), getMonthlyTotals(lastClosed, SPENDING_MONTHS), getStatementImports(), getSnapshots()]);
  // The daily net-worth history the pace is read from, with today's live figures as its last point.
  const since = addDays(today, -PACE_WINDOW_DAYS);
  const history = [
    ...snapshots.filter((s) => s.snapshotDate >= since && s.snapshotDate < today).map((s) => ({ date: s.snapshotDate, netWorth: s.netWorthPhp, assets: s.assetsPhp, cash: s.byClass.cash ?? 0 })),
    ...(nw.empty ? [] : [{ date: today, netWorth: nw.netWorthPhp, assets: nw.assetsPhp, cash: nw.byClass.cash ?? 0 }]),
  ];

  // Closed months only, and only those with complete statements, so a gap doesn't pass for a frugal month.
  const spending = averageMonthlySpending(monthlySeries(lastClosed, SPENDING_MONTHS, monthly).map((p) => dashboardMonth(p, statements, current)));
  const known = !nw.empty;
  const cash = known ? (nw.byClass.cash ?? 0) : null;
  const figures = {
    netWorth: known ? nw.netWorthPhp : null,
    cash,
    investments: known ? nw.assetsPhp - (nw.byClass.cash ?? 0) : null,
    monthlySpending: spending,
  };
  const rows: GoalDTO[] = goals.map((g) => {
    const progress = goalProgress(g, figures, today);
    const projection = projectGoal(progress, goalPace(g.measure, history, spending, today), today, g.targetOn, g.measure === "manual");
    return {
      id: g.id,
      name: g.name,
      measure: g.measure,
      target: g.target,
      saved: g.saved,
      targetOn: g.targetOn,
      archived: g.archived,
      progress,
      due: g.targetOn ? `by ${fullDayLabel(g.targetOn)}` : null,
      pace: paceLabel(projection),
    };
  });
  const runway = cash != null && spending ? cash / spending : null;

  return (
    <>
      <PageHeader title="Portfolio">
        <AddGoalButton />
      </PageHeader>
      <PortfolioSections />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <InfoNote title="How goals are measured">
          <p>Net worth, cash and investments are today&apos;s totals, the same as the Overview and Portfolio. Debts come off net worth only.</p>
          <p>The emergency fund divides your cash by your average monthly spending over the last {SPENDING_MONTHS} closed months, counting only months whose statements are all in.</p>
          <p>&ldquo;Save a month&rdquo; spreads what&apos;s left evenly until the goal&apos;s date. It doesn&apos;t count growth or interest.</p>
          <p>&ldquo;At the recent pace&rdquo; draws a straight line through the last {PACE_WINDOW_DAYS} days of daily history and carries it on to the target. Deposits, spending and market moves all count, so one big month moves it.</p>
        </InfoNote>
      </div>
      <StatCards
        items={[
          {
            label: "Cash runway",
            value: runway == null ? "—" : <PrivateFigure>{`${runway.toLocaleString("en-PH", { maximumFractionDigits: 1 })} months`}</PrivateFigure>,
            primary: true,
            hint: runway == null ? (spending == null ? "Needs two complete months of spending" : "Needs a cash balance") : <>Cash <Money value={cash!} compact /> over spending of <Money value={spending!} compact /> a month</>,
          },
          {
            label: "Average spending",
            value: spending == null ? "—" : <Money value={spending} />,
            hint: `A month, over the last ${SPENDING_MONTHS} complete months`,
          },
        ]}
      />
      <GoalList goals={rows} />
    </>
  );
}
