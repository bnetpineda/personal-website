import type { Metadata } from "next";
import { after } from "next/server";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SEARCH_LIMIT,
  getAccounts,
  getCashFlows,
  getCategories,
  getCategoryTotals,
  getConnections,
  getEntrySuggestions,
  getFx,
  getImportedIncome,
  getLastEntryDefaults,
  getLatestPortfolioSnapshots,
  getMonthlyTotals,
  getPeriodTotals,
  getRecurring,
  getSnapshots,
  getStatementBalances,
  getStatementImports,
  getTeachGroups,
} from "@/lib/dal";
import { computeNetWorth, monthlySeries, savingsRate } from "@/lib/finance/calc";
import type { CashFlowKind } from "@/lib/finance/constants";
import { PROVIDER_META, includedPositions, isConnectionStale } from "@/lib/finance/connections/types";
import { addDays, addMonths, currentMonth, dayLabel, dayRangeLabel, daysBetween, isMonth, monthComparison, monthLabel, shortDayLabel, timeAgo, todayManila } from "@/lib/finance/dates";
import { missingBalanceProviders, missingStatementProviders } from "@/lib/finance/imports/coverage";
import { groupAlerts } from "@/lib/finance/notifications";
import { getNotifications } from "@/lib/finance/notifications-dal";
import { dueOccurrences } from "@/lib/finance/recurrence";
import { importedIncomeSince, repeatIncomeByMonth, repeatPayers, typicalIncome } from "@/lib/finance/repeat-income";
import { ensureTodaySnapshot } from "@/lib/finance/service";
import { statementPositions } from "@/lib/finance/statement-balances";
import { ActivityFeed, type ActivityEntry } from "../../_components/activity-feed";
import { AddEntry } from "../../_components/add-entry";
import { BudgetsForm } from "../../_components/budgets-form";
import type { FormCategory } from "../../_components/cash-flow-form";
import { CategoryBreakdown, type BreakdownItem } from "../../_components/category-breakdown";
import { CashFlowChart, CashFlowLegend, MiniBars, Sparkline, type MiniBar } from "../../_components/charts";
import { SyncConnectionsButton } from "../../_components/connection-controls";
import { AccountsPanel, CoverageBadge, KpiStrip, NeedsYou, type AccountRow, type InboxProps } from "../../_components/dashboard";
import { FormSheet } from "../../_components/form";
import { MonthNav } from "../../_components/month-nav";
import { AdminHeader } from "../../_components/shell";
import { Money, Panel, Pct } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Overview",
};
export const maxDuration = 120;

/** Type and category filters are in the URL too, but the client applies them (see useDashboardFilters). */
type Params = { month?: string; q?: string };

/** A statement balance older than this reads as out of date next to net worth. */
const STALE_BALANCE_DAYS = 40;

/**
 * Everything on one screen: net worth and the month's numbers on top, then what needs you,
 * spending by category, the month's activity, accounts, what's coming and the 12-month trend.
 * Wide screens fit it into the viewport (panels scroll on their own); smaller ones stack it.
 * It renders its own header, which carries the month and the Sync / Add actions.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const now = new Date();
  const today = todayManila(now);
  const current = currentMonth(now);
  const month = isMonth(params.month) ? params.month : current;
  const comparison = monthComparison(month, today);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const [
    connections,
    fx,
    snapshots,
    portfolio,
    monthly,
    entries,
    expenseTotals,
    incomeTotals,
    allCategories,
    accounts,
    recurring,
    received,
    balances,
    teach,
    statements,
    notifications,
    suggestions,
    lastExpense,
    lastIncome,
    selectedPeriod,
    previousPeriod,
  ] = await Promise.all([
    getConnections(),
    getFx(),
    getSnapshots(),
    getLatestPortfolioSnapshots(),
    getMonthlyTotals(month, 12),
    getCashFlows({ month, q: q || undefined }),
    getCategoryTotals("expense", month),
    getCategoryTotals("income", month),
    getCategories(),
    getAccounts(),
    getRecurring(),
    getImportedIncome(importedIncomeSince(today)),
    getStatementBalances(),
    getTeachGroups(),
    getStatementImports(),
    getNotifications(),
    getEntrySuggestions(),
    getLastEntryDefaults("expense"),
    getLastEntryDefaults("income"),
    comparison?.monthToDate ? getPeriodTotals(comparison.selected.start, comparison.selected.end) : null,
    comparison?.monthToDate ? getPeriodTotals(comparison.previous.start, comparison.previous.end) : null,
  ]);

  // Backfill today's history point after responding, in case the daily cron hasn't run yet.
  after(async () => {
    try {
      await ensureTodaySnapshot();
    } catch (err) {
      console.error("[admin] ensureTodaySnapshot failed", err);
    }
  });

  const formCategories: Record<CashFlowKind, FormCategory[]> = { expense: [], income: [] };
  for (const c of allCategories) formCategories[c.kind].push({ id: c.id, name: c.name, color: c.color, archived: c.archived });

  // ---- net worth, and how fresh each of its sources is ----
  const nw = computeNetWorth([], [], fx, [...includedPositions(connections), ...statementPositions(balances)]);
  const missingBalances = missingBalanceProviders(statements, balances);
  const monthAgo = [...snapshots].reverse().find((s) => s.snapshotDate <= addDays(today, -30));
  const change = monthAgo ? nw.netWorthPhp - monthAgo.netWorthPhp : null;
  // Last 90 days of history, ending in the live total.
  const trend = [
    ...snapshots.filter((s) => s.snapshotDate >= addDays(today, -90) && s.snapshotDate < today).map((s) => ({ date: s.snapshotDate, value: s.netWorthPhp })),
    { date: today, value: nw.netWorthPhp },
  ];
  const banks = [...new Set(balances.map((b) => b.provider))].map((provider) => {
    const mine = balances.filter((b) => b.provider === provider);
    return { provider, total: computeNetWorth([], [], fx, statementPositions(mine)), asOf: mine.map((b) => b.asOf).sort().at(-1)!, currencies: mine.map((b) => b.currency) };
  });
  const outOfDate = [
    ...connections
      .filter((c) => c.includeInNetWorth && c.snapshot && (c.error || isConnectionStale(c, now)))
      .map((c) => `${PROVIDER_META[c.provider].name} ${c.lastSyncedAt ? timeAgo(c.lastSyncedAt, now).replace(" ago", "") : "never synced"}`),
    ...banks.filter((b) => daysBetween(b.asOf, today) > STALE_BALANCE_DAYS).map((b) => `${PROVIDER_META[b.provider].name} ${shortDayLabel(b.asOf)}`),
    ...missingBalances.map((p) => `${PROVIDER_META[p].name} missing`),
  ];

  // ---- the selected month ----
  const series = monthlySeries(month, 12, monthly);
  const [prev, thisMonth] = series.slice(-2);
  const missingStatements = missingStatementProviders(statements, month);
  const missingPrevious = missingStatementProviders(statements, addMonths(month, -1));
  const provisional = missingStatements.length > 0;
  const rate = provisional || month > current ? null : savingsRate(thisMonth.income, thisMonth.expense);
  /** The month's largest category of a kind: what the tiles say while statements are still missing. */
  const largest = (k: CashFlowKind) => {
    const totals = k === "expense" ? expenseTotals : incomeTotals;
    const top = allCategories.filter((c) => c.kind === k && (totals.get(c.id) ?? 0) > 0).sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0))[0];
    return top ? `Largest: ${top.name}` : k === "expense" ? "Nothing spent yet" : "Nothing received yet";
  };
  /** Lower spending and higher income are improvements; the signed percentage still describes the change. */
  const compare = (kind: CashFlowKind) => {
    // The header's coverage badge explains a provisional month once; the tiles stay quiet about it.
    if (provisional || !comparison || missingPrevious.length) return largest(kind);
    const before = (previousPeriod ?? prev)[kind];
    if (before <= 0) return largest(kind);
    const period = comparison.monthToDate ? dayRangeLabel(comparison.previous.start, addDays(comparison.previous.end, -1)) : monthLabel(addMonths(month, -1), "short");
    return (
      <span>
        <Pct value={((selectedPeriod ?? thisMonth)[kind] - before) / before} tone lowerIsBetter={kind === "expense"} /> vs {period}
      </span>
    );
  };

  // Hourly work pays differently every month: each client's average month, with everyone's low and high.
  const payers = repeatPayers(received);
  const income = typicalIncome(fx, recurring, payers);
  // Tile charts: each month the figure is drawn from (pay by month; the year up to the month on show).
  const bars = (points: { month: string; value: number }[]): MiniBar[] => points.map((p) => ({ key: p.month, label: monthLabel(p.month), value: p.value }));
  const lastSixClosed = Array.from({ length: 6 }, (_, i) => addMonths(current, i - 6));

  // ---- needs you ----
  const inbox: InboxProps = {
    groups: groupAlerts(notifications.filter((a) => !a.dismissed)),
    missingFx: [...new Set([...nw.missingFx, ...income.missing])],
    due: dueOccurrences(recurring, today),
    teach,
    today,
    categories: formCategories,
    accounts,
  };

  // ---- categories ----
  const breakdown = (k: CashFlowKind): BreakdownItem[] => {
    const totals = k === "expense" ? expenseTotals : incomeTotals;
    return allCategories
      .filter((c) => c.kind === k && ((totals.get(c.id) ?? 0) > 0 || (k === "expense" && !c.archived && (c.monthlyBudget ?? 0) > 0)))
      .map((c) => ({ id: c.id, label: c.name, color: c.color, value: totals.get(c.id) ?? 0, budget: k === "expense" ? c.monthlyBudget : null }))
      .sort((a, b) => b.value - a.value);
  };
  const budgetsSheet = (
    <FormSheet
      title="Monthly budgets"
      description="Per expense category, in PHP. Leave blank for no budget."
      trigger={
        <Button variant="ghost" size="sm">
          <SlidersHorizontal /> Budgets
        </Button>
      }
    >
      <BudgetsForm
        categories={allCategories
          .filter((c) => c.kind === "expense" && !c.archived)
          .map((c) => ({ id: c.id, name: c.name, budget: c.monthlyBudget, spent: expenseTotals.get(c.id) ?? 0 }))}
      />
    </FormSheet>
  );

  // ---- accounts: synced connections (each with its own sync), then banks by their latest statement ----
  const saved = new Map(portfolio.map((p) => [p.provider, p]));
  const accountRows: AccountRow[] = [
    ...connections.map((c): AccountRow => {
      // No status badges here: problems are the Needs you bell's job.
      const attention = Boolean(c.error || c.historyError || isConnectionStale(c, now));
      const status = !c.enabled ? "Sync paused" : c.syncing ? "Syncing…" : c.lastSyncedAt ? `Synced ${timeAgo(c.lastSyncedAt, now)}` : "Not synced yet";
      const pnl = saved.get(c.provider);
      return {
        key: c.provider,
        name: PROVIDER_META[c.provider].name,
        // Healthy accounts open their performance; one that needs attention opens its connection.
        href: attention ? `/admin/connections#${c.provider}` : "/admin/holdings",
        description: c.includeInNetWorth ? status : `${status} · not in net worth`,
        value: c.snapshot ? computeNetWorth([], [], fx, c.snapshot.positions).netWorthPhp : null,
        pnlPct: pnl?.pnlUsd != null && pnl.costUsd ? pnl.pnlUsd / pnl.costUsd : null,
        sync: { provider: c.provider, disabled: !c.enabled || c.syncing },
      };
    }),
    ...banks.map((b): AccountRow => ({
      key: b.provider,
      name: PROVIDER_META[b.provider].name,
      href: `/admin/connections#${b.provider}`,
      description: `Statement balance · ${dayLabel(b.asOf)} · ${b.currencies.join(", ")}`,
      value: b.total.netWorthPhp,
      pnlPct: null,
    })),
    ...missingBalances.map((provider): AccountRow => ({
      key: provider,
      name: PROVIDER_META[provider].name,
      href: `/admin/connections#${provider}`,
      description: "Import a closing balance to count it in net worth.",
      value: null,
      pnlPct: null,
    })),
  ];

  // ---- activity ----
  const activity: ActivityEntry[] = entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    occurredOn: e.occurredOn,
    description: e.description,
    categoryId: e.categoryId,
    categoryName: e.categoryName,
    categoryColor: e.categoryColor,
    account: e.account,
    notes: e.notes,
    amount: e.amount,
    currency: e.currency,
    amountPhp: e.amountPhp,
    recurringId: e.recurringId,
  }));
  const entryDefaults = (last: typeof lastExpense) => ({
    occurredOn: today,
    categoryId: last?.categoryId,
    account: last?.account,
    currency: last?.currency,
  });

  return (
    <>
      <AdminHeader wide>
        <MonthNav month={month} current={current} />
        <CoverageBadge missing={missingStatements} month={month} current={current} />
        <div className="ml-auto flex items-center gap-2">
          <NeedsYou {...inbox} />
          <SyncConnectionsButton compact disabled={!connections.some((c) => c.enabled)} />
          <AddEntry
            kind="expense"
            categories={formCategories}
            accounts={accounts}
            suggestions={suggestions}
            defaults={{ expense: entryDefaults(lastExpense), income: entryDefaults(lastIncome) }}
          />
        </div>
      </AdminHeader>

      <main id="main-content" className="mx-auto mb-safe flex w-full max-w-screen-2xl flex-1 flex-col gap-3 px-4 pt-4 pb-4 xl:min-h-0">
        <h1 className="sr-only">Overview · {monthLabel(month)}</h1>
        <KpiStrip
          netWorth={{
            label: "Net worth",
            value: <Money value={nw.netWorthPhp} />,
            // The 30-day change once there is that much history; then what in the total is out of date.
            hint: (
              <>
                {change != null && (
                  <span>
                    <Money value={change} signed /> since {dayLabel(monthAgo!.snapshotDate)}
                  </span>
                )}
                {outOfDate.length > 0 ? (
                  <span className="truncate" title={`Out of date: ${outOfDate.join(" · ")}`}>
                    Out of date: {outOfDate.join(" · ")}
                  </span>
                ) : (
                  change == null && <span>Every account is current</span>
                )}
              </>
            ),
          }}
          trend={trend.length >= 3 ? <Sparkline points={trend} label="Net worth" /> : undefined}
          items={[
            {
              label: "Income / month",
              value: income.sources ? <Money value={income.average} /> : "—",
              chart: income.sources ? <MiniBars label="Pay" points={bars(repeatIncomeByMonth(fx, payers, lastSixClosed))} reference={income.average} /> : undefined,
              hint: income.sources ? (
                <span title="Each client's average month, read from imports. The range adds up everyone's lowest and highest month: plan spending on the low end.">
                  Low <Money value={income.low} compact /> · high <Money value={income.high} compact />
                </span>
              ) : (
                "Shows up once a payer has paid twice"
              ),
            },
            {
              label: `Spent · ${monthLabel(month, "short")}`,
              value: <Money value={thisMonth.expense} />,
              hint: compare("expense"),
              chart: <MiniBars label="Spent" color="var(--chart-3)" points={bars(series.map((p) => ({ month: p.month, value: p.expense })))} highlight={month} />,
            },
            {
              label: `Earned · ${monthLabel(month, "short")}`,
              value: <Money value={thisMonth.income} />,
              hint: compare("income"),
              chart: <MiniBars label="Earned" points={bars(series.map((p) => ({ month: p.month, value: p.income })))} highlight={month} />,
            },
            {
              label: `Net · ${monthLabel(month, "short")}`,
              value: <Money value={thisMonth.income - thisMonth.expense} signed tone />,
              chart: <MiniBars label="Net" tone points={bars(series.map((p) => ({ month: p.month, value: p.net })))} highlight={month} />,
              hint:
                rate != null ? (
                  <span>
                    Saved <Pct value={rate} />
                    {month === current && " so far"}
                  </span>
                ) : (
                  "Income minus spending"
                ),
            },
          ]}
        />

        {/*
          Wide screens: three columns filling the rest of the viewport (categories, activity, then
          accounts over the 12-month trend); every panel scrolls inside. Below that the right column
          dissolves (`contents`) into one stacked grid, with Activity last because it's the longest.
        */}
        <div className="grid gap-3 md:grid-cols-2 xl:min-h-0 xl:flex-1 xl:grid-cols-12 xl:grid-rows-1">
          <div className="min-w-0 xl:col-span-3 xl:min-h-0">
            <CategoryBreakdown expense={breakdown("expense")} income={breakdown("income")} action={budgetsSheet} />
          </div>
          <ActivityFeed
            className="order-last min-w-0 scroll-mt-20 md:col-span-2 xl:order-none xl:col-span-6 xl:min-h-0"
            entries={activity}
            search={q ? { q, capped: entries.length >= SEARCH_LIMIT ? SEARCH_LIMIT : null } : null}
            month={month}
            current={current}
            today={today}
            categories={allCategories.map(({ id, kind, name, color, monthlyBudget }) => ({ id, kind, name, color, monthlyBudget }))}
            formCategories={formCategories}
            accounts={accounts}
            totals={{ expense: thisMonth.expense, income: thisMonth.income, byCategory: Object.fromEntries([...expenseTotals, ...incomeTotals]) }}
          />
          <div className="contents xl:col-span-3 xl:flex xl:min-h-0 xl:flex-col xl:gap-3">
            <AccountsPanel rows={accountRows} className="min-w-0 xl:max-h-3/5 xl:min-h-0 xl:shrink-0" />
            <Panel fill scroll={false} title="12 months" action={<CashFlowLegend />} className="min-w-0 md:col-span-2 xl:min-h-40 xl:flex-1">
              <CashFlowChart fill points={series.map((p) => ({ label: monthLabel(p.month, "short").split(" ")[0], income: p.income, expense: p.expense }))} />
            </Panel>
          </div>
        </div>
      </main>
    </>
  );
}
