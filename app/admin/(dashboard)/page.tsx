import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ArrowRight, BellRing, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import {
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
import { AllocationChart, CashFlowChart, NetWorthChart } from "../_components/charts";
import { OccurrenceList } from "../_components/recurring";
import { RefreshPricesButton } from "../_components/refresh-prices-button";
import { Breakdown, EmptyState, Money, PageHeader, Panel, Pct, StatCards } from "../_components/ui";

export const metadata: Metadata = {
  title: "Overview",
};

export default async function OverviewPage() {
  const now = new Date();
  const today = todayManila(now);
  const month = currentMonth(now);

  const [holdingRows, liabilityRows, fx, snapshots, monthly, expenseTotals, categories, recent, recurring] = await Promise.all([
    getHoldings(),
    getLiabilities(),
    getFx(),
    getSnapshots(),
    getMonthlyTotals(month, 12),
    getCategoryTotals("expense", month),
    getCategories("expense"),
    getRecentCashFlows(8),
    getRecurring(),
  ]);

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
    .map((c) => ({ key: c.id, label: c.name, color: c.color, value: expenseTotals.get(c.id) ?? 0, budget: c.monthlyBudget }))
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
        <Alert className="mb-6">
          <BellRing />
          <AlertTitle>
            {due.length} recurring {due.length === 1 ? "item needs" : "items need"} confirming
          </AlertTitle>
          <AlertDescription>
            <p>
              {due
                .slice(0, 3)
                .map((d) => d.item.description)
                .join(", ")}
              {due.length > 3 ? "…" : ""} —{" "}
              <Link href="/admin/recurring" className="underline underline-offset-4">
                post or skip them
              </Link>
              .
            </p>
          </AlertDescription>
        </Alert>
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
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/expenses">
                Expenses <ArrowRight />
              </Link>
            </Button>
          }
        >
          {budgetRows.length === 0 ? <EmptyState title="No spending yet">Set monthly budgets per category in Settings.</EmptyState> : <Breakdown rows={budgetRows} />}
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
        <Panel title="Recent entries">
          {recent.length === 0 ? (
            <EmptyState title="Nothing logged yet">Log expenses and income from their pages (or the + button on mobile).</EmptyState>
          ) : (
            <ItemGroup>
              {recent.map((r) => (
                <Item key={r.id} size="sm">
                  <ItemMedia>
                    <Swatch color={r.categoryColor} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{r.description}</ItemTitle>
                    <ItemDescription>
                      {dayLabel(r.occurredOn)} · {r.categoryName}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="font-mono text-sm">
                      <Money value={r.kind === "expense" ? -r.amountPhp : r.amountPhp} signed tone />
                    </span>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </Panel>
      </div>
    </>
  );
}
