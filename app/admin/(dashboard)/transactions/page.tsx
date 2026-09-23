import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Repeat, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import {
  SEARCH_LIMIT,
  getAccounts,
  getCashFlows,
  getCategories,
  getCategoryTotals,
  getFx,
  getMonthlyTotals,
  getRecurring,
  type CashFlowRow,
} from "@/lib/dal";
import { budgetProgress, fxToPhp, monthlySeries, savingsRate } from "@/lib/finance/calc";
import { CASH_FLOW_KINDS, type CashFlowKind } from "@/lib/finance/constants";
import { addDays, addMonths, currentMonth, dayLabel, isMonth, monthLabel, monthRange, todayManila } from "@/lib/finance/dates";
import { formatPct } from "@/lib/finance/format";
import { upcomingOccurrences } from "@/lib/finance/recurrence";
import { deleteCashFlow, restoreCashFlow } from "../../_actions/cash-flows";
import { BudgetsForm } from "../../_components/budgets-form";
import { CashFlowForm, type FormCategory } from "../../_components/cash-flow-form";
import { BreakdownChart } from "../../_components/charts";
import { FormSheet } from "../../_components/form";
import { transactionsHref } from "../../_components/nav";
import { AddEntryButton } from "../../_components/quick-add";
import { OccurrenceList } from "../../_components/recurring";
import { EditableRow } from "../../_components/row-actions";
import { EmptyState, Money, MonthPicker, PageHeader, Panel, StatCards, type BreakdownRow } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Transactions",
};

type Params = { kind?: string; month?: string; q?: string; category?: string };

const KIND_TABS: { kind: CashFlowKind | null; label: string }[] = [
  { kind: null, label: "All" },
  { kind: "expense", label: "Expenses" },
  { kind: "income", label: "Income" },
];

/** Change vs last month as a signed percentage ("—" without a base). */
const vsLast = (now: number, before: number, month: string) =>
  before > 0 ? `${formatPct((now - before) / before, { signed: true })} vs ${monthLabel(month, "short")}` : `— vs ${monthLabel(month, "short")}`;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const now = new Date();
  const today = todayManila(now);
  const current = currentMonth(now);
  const month = isMonth(params.month) ? params.month : current;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const kindParam = CASH_FLOW_KINDS.includes(params.kind as CashFlowKind) ? (params.kind as CashFlowKind) : null;
  const categoryParam = Number(params.category);

  const [allCategories, entries, monthly, expenseTotals, incomeTotals, accounts, recurring, fx] = await Promise.all([
    getCategories(),
    getCashFlows({ kind: kindParam ?? undefined, month, q: q || undefined }),
    getMonthlyTotals(month, 2),
    getCategoryTotals("expense", month),
    getCategoryTotals("income", month),
    getAccounts(),
    getRecurring(),
    getFx(),
  ]);

  // A category filter implies its kind.
  const category = allCategories.find((c) => c.id === categoryParam) ?? null;
  const kind = category?.kind ?? kindParam;
  const visible = category ? entries.filter((e) => e.categoryId === category.id) : entries;
  const href = (next: Partial<{ kind: CashFlowKind | null; category: number | null; q: string; month: string }>) =>
    transactionsHref({
      kind: "kind" in next ? next.kind : kindParam,
      month: (next.month ?? month) === current ? null : (next.month ?? month),
      category: "category" in next ? next.category : category?.id,
      q: "q" in next ? next.q : q,
    });

  const formCategories: Record<CashFlowKind, FormCategory[]> = {
    expense: [],
    income: [],
  };
  for (const c of allCategories) formCategories[c.kind].push({ id: c.id, name: c.name, color: c.color, archived: c.archived });

  // ---- month summary ----
  const [prev, thisMonth] = monthlySeries(month, 2, monthly);
  const rate = savingsRate(thisMonth.income, thisMonth.expense);
  const expenseCategories = allCategories.filter((c) => c.kind === "expense");
  const budgeted = expenseCategories.filter((c) => !c.archived && (c.monthlyBudget ?? 0) > 0);
  const budget = budgetProgress(
    budgeted.reduce((sum, c) => sum + (expenseTotals.get(c.id) ?? 0), 0),
    budgeted.reduce((sum, c) => sum + c.monthlyBudget!, 0)
  );
  const sumPhp = (list: CashFlowRow[], k: CashFlowKind) => list.filter((e) => e.kind === k).reduce((a, e) => a + e.amountPhp, 0);

  const stats = q
    ? [
        { label: "Results", value: visible.length, hint: visible.length >= SEARCH_LIMIT ? `Newest ${SEARCH_LIMIT} shown` : "All time", primary: true },
        { label: "Spent", value: <Money value={sumPhp(visible, "expense")} /> },
        { label: "Earned", value: <Money value={sumPhp(visible, "income")} /> },
      ]
    : [
        {
          label: `Spent · ${monthLabel(month, "short")}`,
          value: <Money value={thisMonth.expense} />,
          hint: vsLast(thisMonth.expense, prev.expense, addMonths(month, -1)),
          primary: kind !== "income",
        },
        {
          label: `Earned · ${monthLabel(month, "short")}`,
          value: <Money value={thisMonth.income} />,
          hint: vsLast(thisMonth.income, prev.income, addMonths(month, -1)),
          primary: kind === "income",
        },
        {
          label: "Net",
          value: <Money value={thisMonth.income - thisMonth.expense} signed tone />,
          hint: rate != null ? `Saved ${formatPct(rate)}` : "Savings rate: —",
        },
        {
          label: "Budget used",
          value: budget ? formatPct(budget.ratio) : "—",
          hint: budget ? (
            <>
              <Money value={budget.remaining} signed /> left
            </>
          ) : (
            "No budgets set"
          ),
        },
      ];

  // ---- breakdowns (month view only) ----
  const breakdown = (k: CashFlowKind): BreakdownRow[] => {
    const totals = k === "expense" ? expenseTotals : incomeTotals;
    return allCategories
      .filter((c) => c.kind === k && ((totals.get(c.id) ?? 0) > 0 || (k === "expense" && !c.archived && (c.monthlyBudget ?? 0) > 0)))
      .map((c) => ({
        key: c.id,
        label: c.name,
        color: c.color,
        value: totals.get(c.id) ?? 0,
        budget: k === "expense" ? c.monthlyBudget : null,
        href: href({ category: c.id, q: "" }),
      }))
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
        categories={expenseCategories
          .filter((c) => !c.archived)
          .map((c) => ({ id: c.id, name: c.name, budget: c.monthlyBudget, spent: expenseTotals.get(c.id) ?? 0 }))}
      />
    </FormSheet>
  );

  // ---- recurring still to come this month ----
  const { start, end } = monthRange(month);
  const scheduled =
    !q && month >= current
      ? upcomingOccurrences(
          recurring.filter((r) => (!kind || r.kind === kind) && (!category || r.categoryId === category.id)),
          today,
          start > today ? start : today,
          addDays(end, -1)
        )
      : [];
  const scheduledNet = scheduled.reduce(
    (sum, o) => sum + (o.item.kind === "expense" ? -1 : 1) * o.item.amount * (fxToPhp(fx, o.item.currency) ?? 0),
    0
  );

  // ---- category chips: what's in the current list (before the category filter) ----
  const chipIds = new Set(entries.map((e) => e.categoryId));
  if (category) chipIds.add(category.id);
  const chips = allCategories.filter((c) => chipIds.has(c.id));

  const byDay = new Map<string, CashFlowRow[]>();
  for (const e of visible) byDay.set(e.occurredOn, [...(byDay.get(e.occurredOn) ?? []), e]);
  // Signed amounts when both kinds are listed, so a day's total reads as net cash flow.
  const signed = kind == null;
  const signedAmount = (e: CashFlowRow) => (e.kind === "expense" ? -e.amountPhp : e.amountPhp);

  const listTitle = q
    ? `“${q}” · ${visible.length} ${visible.length === 1 ? "result" : "results"}`
    : `${monthLabel(month)} · ${visible.length} ${visible.length === 1 ? "entry" : "entries"}`;

  return (
    <>
      <PageHeader eyebrow="Money in & out" title="Transactions">
        {!q && <MonthPicker month={month} current={current} href={(m) => href({ month: m })} />}
        <AddEntryButton kind={kind ?? "expense"} />
      </PageHeader>

      <StatCards items={stats} />

      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
            {KIND_TABS.map((t) => (
              <Button key={t.label} asChild size="sm" variant={kind === t.kind ? "default" : "outline"}>
                <Link href={href({ kind: t.kind, category: null })} aria-current={kind === t.kind ? "page" : undefined}>
                  {t.label}
                </Link>
              </Button>
            ))}
          </nav>
          <Form action="/admin/transactions" role="search" className="w-full sm:w-auto">
            {kindParam && <input type="hidden" name="kind" value={kindParam} />}
            <ButtonGroup className="w-full">
              <Input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search all entries…"
                aria-label="Search entries"
                autoComplete="off"
                className="sm:w-64"
              />
              <Button type="submit" variant="outline" size="icon" aria-label="Search">
                <Search />
              </Button>
            </ButtonGroup>
          </Form>
        </div>
        {chips.length > 1 || category ? (
          <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
            {chips.map((c) => {
              const active = category?.id === c.id;
              return (
                <Button key={c.id} asChild size="xs" variant={active ? "default" : "outline"}>
                  <Link href={href({ category: active ? null : c.id })} aria-current={active ? "page" : undefined}>
                    <Swatch color={c.color} size="sm" />
                    {c.name}
                    {active && <X />}
                  </Link>
                </Button>
              );
            })}
          </nav>
        ) : null}
        {q && (
          <p className="font-mono text-xs text-muted-foreground">
            Searching all months ·{" "}
            <Link href={href({ q: "" })} className="underline underline-offset-4">
              back to {monthLabel(month)}
            </Link>
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1 lg:col-span-3">
          <Panel title={listTitle}>
            {visible.length === 0 ? (
              <EmptyState title={q ? "No matches" : "No entries"}>
                {q ? "Try another word — search covers descriptions, notes, accounts and categories." : "Use Add to log an expense or income."}
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-6">
                {[...byDay.entries()].map(([day, list]) => (
                  <section key={day} className="flex flex-col gap-2">
                    <h3 className="flex justify-between border-b-2 border-border pb-2 font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      <span>{day === today ? "Today" : dayLabel(day)}</span>
                      <Money value={list.reduce((a, e) => a + (signed ? signedAmount(e) : e.amountPhp), 0)} signed={signed} />
                    </h3>
                    <ItemGroup>
                      {list.map((e) => (
                        <EditableRow
                          key={e.id}
                          name={e.description}
                          editTitle={e.kind === "expense" ? "Edit expense" : "Edit income"}
                          editForm={
                            <CashFlowForm
                              kind={e.kind}
                              categories={formCategories[e.kind]}
                              accounts={accounts}
                              defaults={{ occurredOn: e.occurredOn }}
                              entry={{
                                id: e.id,
                                occurredOn: e.occurredOn,
                                amount: e.amount,
                                currency: e.currency,
                                categoryId: e.categoryId,
                                description: e.description,
                                account: e.account,
                                notes: e.notes,
                              }}
                            />
                          }
                          onDelete={deleteCashFlow.bind(null, e.id)}
                          onRestore={restoreCashFlow}
                          media={
                            <ItemMedia>
                              <Swatch color={e.categoryColor} />
                            </ItemMedia>
                          }
                          aside={
                            <span className="flex flex-col items-end font-mono text-sm">
                              <Money
                                value={signed && e.kind === "expense" ? -e.amount : e.amount}
                                currency={e.currency}
                                signed={signed}
                                tone={signed && e.kind === "income"}
                              />
                              {e.currency !== "PHP" && (
                                <span className="text-xs text-muted-foreground">
                                  <Money value={e.amountPhp} />
                                </span>
                              )}
                            </span>
                          }
                        >
                          <ItemContent>
                            <ItemTitle>
                              {e.description}
                              {e.recurringId && <Repeat aria-label="Recurring" className="size-3 text-muted-foreground" />}
                            </ItemTitle>
                            <ItemDescription>
                              {[q ? dayLabel(e.occurredOn) : null, e.categoryName, e.account, e.notes].filter(Boolean).join(" · ")}
                            </ItemDescription>
                          </ItemContent>
                        </EditableRow>
                      ))}
                    </ItemGroup>
                  </section>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="order-1 flex min-w-0 flex-col gap-6 lg:order-2 lg:col-span-2">
          {!q && kind !== "income" && (
            <Panel title="Spending by category" action={budgetsSheet}>
              {breakdown("expense").length === 0 ? (
                <EmptyState title="Nothing spent yet" />
              ) : (
                <BreakdownChart rows={breakdown("expense")} valueLabel="Spent" />
              )}
            </Panel>
          )}
          {!q && kind !== "expense" && (
            <Panel title="Income by source">
              {breakdown("income").length === 0 ? (
                <EmptyState title="Nothing earned yet" />
              ) : (
                <BreakdownChart rows={breakdown("income")} valueLabel="Received" />
              )}
            </Panel>
          )}
          {scheduled.length > 0 && (
            <Panel
              title={`Still to come · ${scheduled.length}`}
              action={
                <span className="font-mono text-xs text-muted-foreground">
                  <Money value={scheduledNet} signed />
                </span>
              }
            >
              <OccurrenceList items={scheduled} today={today} />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
