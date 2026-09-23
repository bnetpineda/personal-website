import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ArrowRight, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import type { CashFlowKind } from "@/lib/finance/constants";
import { Swatch } from "@/components/ui/swatch";
import {
  getAccounts,
  getCategories,
  getCategoryTotals,
  getFx,
  getHoldings,
  getLiabilities,
  getMonthlyTotals,
  getRecentCashFlows,
  getRecurring,
  getSnapshots,
} from "@/lib/dal";
import { allocation, computeNetWorth, holdingMetrics, monthlySeries, savingsRate } from "@/lib/finance/calc";
import { ASSET_CLASS_META } from "@/lib/finance/constants";
import { addDays, currentMonth, dayLabel, monthLabel, timeAgo, todayManila } from "@/lib/finance/dates";
import { formatPct } from "@/lib/finance/format";
import { dueOccurrences, upcomingOccurrences } from "@/lib/finance/recurrence";
import { ensureTodaySnapshot } from "@/lib/finance/service";
import { deleteCashFlow, restoreCashFlow } from "../_actions/cash-flows";
import { BudgetsForm } from "../_components/budgets-form";
import { CashFlowForm, type FormCategory } from "../_components/cash-flow-form";
import { AllocationChart, CashFlowChart, NetWorthChart } from "../_components/charts";
import { FormSheet } from "../_components/form";
import { transactionsHref } from "../_components/nav";
import { DuePanel, OccurrenceList } from "../_components/recurring";
import { EditableRow } from "../_components/row-actions";
import { RefreshPricesButton } from "../_components/refresh-prices-button";
import { Breakdown, EmptyState, Money, PageHeader, Panel, Pct, StatCards } from "../_components/ui";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function OverviewPage() {
  const now = new Date();
  const today = todayManila(now);
  const month = currentMonth(now);

  const [holdingRows, liabilityRows, fx, snapshots, monthly, expenseTotals, allCategories, recent, recurring, accounts] = await Promise.all([
    getHoldings(),
    getLiabilities(),
    getFx(),
    getSnapshots(),
    getMonthlyTotals(month, 12),
    getCategoryTotals("expense", month),
    getCategories(),
    getRecentCashFlows(8),
    getRecurring(),
    getAccounts(),
  ]);
  const categories = allCategories.filter((c) => c.kind === "expense");
  const formCategories: Record<CashFlowKind, FormCategory[]> = { expense: [], income: [] };
  for (const c of allCategories) formCategories[c.kind].push({ id: c.id, name: c.name, color: c.color, archived: c.archived });

  // Backfill today's history point after responding, in case the daily cron hasn't run yet.
  after(async () => {
    try {
      await ensureTodaySnapshot();
    } catch (err) {
      console.error("[admin] ensureTodaySnapshot failed", err);
    }
  });

  const activeDebts = liabilityRows.filter((l) => !l.archived);
  const nw = computeNetWorth(holdingRows, activeDebts, fx);
  const series = monthlySeries(month, 12, monthly);
  const thisMonth = series[series.length - 1];
  const rate = savingsRate(thisMonth.income, thisMonth.expense);

  const monthAgo = [...snapshots].reverse().find((s) => s.snapshotDate <= addDays(today, -30));
  const change = monthAgo ? nw.netWorthPhp - monthAgo.netWorthPhp : null;

  const newestQuote = holdingRows
    .filter((h) => h.priceSource !== "manual" && h.priceUpdatedAt)
    .reduce<Date | null>((latest, h) => (!latest || h.priceUpdatedAt! > latest ? h.priceUpdatedAt! : latest), null);

  const top = holdingRows
    .map((h) => ({ h, m: holdingMetrics(h, fx) }))
    .filter((x) => x.m.valuePhp != null)
    .sort((a, b) => b.m.valuePhp! - a.m.valuePhp!)
    .slice(0, 6);

  const budgetRows = categories
    .filter((c) => !c.archived && ((c.monthlyBudget ?? 0) > 0 || (expenseTotals.get(c.id) ?? 0) > 0))
    .map((c) => ({
      key: c.id,
      label: c.name,
      color: c.color,
      value: expenseTotals.get(c.id) ?? 0,
      budget: c.monthlyBudget,
      href: transactionsHref({ category: c.id }),
    }))
    .sort((a, b) => (b.budget ? b.value / b.budget : 0) - (a.budget ? a.value / a.budget : 0) || b.value - a.value)
    .slice(0, 6);

  const alloc = allocation(nw.byClass);
  const due = dueOccurrences(recurring, today);
  const upcoming = upcomingOccurrences(recurring, today, today, addDays(today, 14)).slice(0, 8);

  return (
    <>
      <PageHeader eyebrow="Net worth" title="Overview">
        <p className="font-mono text-xs text-muted-foreground">{newestQuote ? `Quotes as of ${timeAgo(newestQuote, now)}` : "No live quotes yet"}</p>
        <RefreshPricesButton />
      </PageHeader>

      {nw.missingFx.length > 0 && (
        <Alert variant="warning" className="mb-6">
          <TriangleAlert />
          <AlertTitle>Missing exchange rates</AlertTitle>
          <AlertDescription>
            No rate yet for {nw.missingFx.join(", ")} — those amounts are left out until you refresh prices.
          </AlertDescription>
        </Alert>
      )}

      {due.length > 0 && (
        <div className="mb-6">
          <DuePanel due={due} today={today} categories={formCategories} accounts={accounts} />
        </div>
      )}

      <StatCards
        items={[
          {
            label: "Net worth",
            value: <Money value={nw.netWorthPhp} />,
            hint: change != null ? <Money value={change} signed /> : "vs. 30 days ago: —",
            primary: true,
          },
          { label: "Assets", value: <Money value={nw.assetsPhp} />, hint: `${holdingRows.length} holdings` },
          { label: "Debts", value: <Money value={nw.liabilitiesPhp} />, hint: `${activeDebts.length} active` },
          { label: "Unrealized P/L", value: <Money value={nw.unrealizedPhp} signed tone />, hint: <Pct value={nw.unrealizedPct} tone /> },
          { label: `Income · ${monthLabel(month, "short")}`, value: <Money value={thisMonth.income} /> },
          {
            label: `Spent · ${monthLabel(month, "short")}`,
            value: <Money value={thisMonth.expense} />,
            hint: rate != null ? `Saved ${formatPct(rate)}` : "Savings rate: —",
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel title="Net worth trend">
            <NetWorthChart points={snapshots.map((s) => ({ date: s.snapshotDate, netWorth: s.netWorthPhp }))} today={today} />
          </Panel>
        </div>
        <div className="lg:col-span-2">
          <Panel
            title="Allocation"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/holdings">
                  Holdings <ArrowRight />
                </Link>
              </Button>
            }
          >
            {alloc.length === 0 ? (
              <EmptyState title="No holdings yet">Add stocks, crypto, cash and more on the Holdings page.</EmptyState>
            ) : (
              <div className="flex flex-col gap-4">
                <AllocationChart slices={alloc} />
                <ul className="flex flex-col gap-2 text-sm">
                  {alloc.map((a) => (
                    <li key={a.assetClass} className="flex items-center gap-2">
                      <Swatch color={ASSET_CLASS_META[a.assetClass].color} />
                      <span className="flex-1">{ASSET_CLASS_META[a.assetClass].plural}</span>
                      <span className="font-mono text-xs">
                        <Money value={a.value} />
                      </span>
                      <span className="w-12 text-right font-mono text-xs text-muted-foreground">{formatPct(a.share)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Income vs expenses">
          <CashFlowChart points={series.map((p) => ({ label: monthLabel(p.month, "short").split(" ")[0], income: p.income, expense: p.expense }))} />
        </Panel>
        <Panel
          title={`Budgets · ${monthLabel(month, "short")}`}
          action={
            <FormSheet
              title="Monthly budgets"
              description="Per expense category, in PHP. Leave blank for no budget."
              trigger={
                <Button variant="ghost" size="sm">
                  <SlidersHorizontal /> Edit
                </Button>
              }
            >
              <BudgetsForm
                categories={categories
                  .filter((c) => !c.archived)
                  .map((c) => ({ id: c.id, name: c.name, budget: c.monthlyBudget, spent: expenseTotals.get(c.id) ?? 0 }))}
              />
            </FormSheet>
          }
        >
          {budgetRows.length === 0 ? <EmptyState title="No spending yet">Use Edit to set a monthly budget per category.</EmptyState> : <Breakdown rows={budgetRows} />}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Panel
          title="Coming up · 14 days"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/recurring">
                Recurring <ArrowRight />
              </Link>
            </Button>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing scheduled">Add salary, rent and subscriptions on the Recurring page.</EmptyState>
          ) : (
            <OccurrenceList items={upcoming} today={today} />
          )}
        </Panel>
        <Panel title="Top holdings">
          {top.length === 0 ? (
            <EmptyState title="Nothing here yet" />
          ) : (
            <ItemGroup>
              {top.map(({ h, m }) => (
                <Item key={h.id} size="sm">
                  <ItemMedia>
                    <Swatch color={ASSET_CLASS_META[h.assetClass].color} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{h.name}</ItemTitle>
                    <ItemDescription>
                      {[ASSET_CLASS_META[h.assetClass].label, h.symbol, nw.assetsPhp > 0 ? formatPct(m.valuePhp! / nw.assetsPhp) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <div className="flex flex-col items-end font-mono text-sm">
                      <Money value={m.valuePhp!} />
                      <span className="text-xs">
                        <Pct value={m.pnlPct} tone />
                      </span>
                    </div>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </Panel>
        <Panel
          title="Recent entries"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/transactions">
                All <ArrowRight />
              </Link>
            </Button>
          }
        >
          {recent.length === 0 ? (
            <EmptyState title="Nothing logged yet">Use Add (or press E / I) to log an expense or income.</EmptyState>
          ) : (
            <ItemGroup>
              {recent.map((r) => (
                <EditableRow
                  key={r.id}
                  name={r.description}
                  editTitle={r.kind === "expense" ? "Edit expense" : "Edit income"}
                  editForm={
                    <CashFlowForm
                      kind={r.kind}
                      categories={formCategories[r.kind]}
                      accounts={accounts}
                      defaults={{ occurredOn: r.occurredOn }}
                      entry={{
                        id: r.id,
                        occurredOn: r.occurredOn,
                        amount: r.amount,
                        currency: r.currency,
                        categoryId: r.categoryId,
                        description: r.description,
                        account: r.account,
                        notes: r.notes,
                      }}
                    />
                  }
                  onDelete={deleteCashFlow.bind(null, r.id)}
                  onRestore={restoreCashFlow}
                  media={
                    <ItemMedia>
                      <Swatch color={r.categoryColor} />
                    </ItemMedia>
                  }
                  aside={
                    <span className="font-mono text-sm">
                      <Money value={r.kind === "expense" ? -r.amountPhp : r.amountPhp} signed tone />
                    </span>
                  }
                >
                  <ItemContent>
                    <ItemTitle>{r.description}</ItemTitle>
                    <ItemDescription>
                      {dayLabel(r.occurredOn)} · {r.categoryName}
                    </ItemDescription>
                  </ItemContent>
                </EditableRow>
              ))}
            </ItemGroup>
          )}
        </Panel>
      </div>
    </>
  );
}
