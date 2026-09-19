import {
  getAccounts,
  getCashFlows,
  getCategories,
  getCategoryTotals,
  getLastEntryDefaults,
  type CashFlowRow,
} from "@/lib/dal";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { budgetProgress } from "@/lib/finance/calc";
import type { CashFlowKind } from "@/lib/finance/constants";
import { addMonths, currentMonth, dayLabel, isMonth, monthLabel, todayManila } from "@/lib/finance/dates";
import { formatPct } from "@/lib/finance/format";
import { deleteCashFlow } from "../_actions/cash-flows";
import { CashFlowForm } from "./cash-flow-form";
import { RowActions } from "./row-actions";
import { Breakdown, EmptyState, Money, MonthPicker, PageHeader, Panel, StatCards } from "./ui";

/** Shared page for /admin/expenses and /admin/income. */
export async function CashFlowPage({ kind, month: rawMonth }: { kind: CashFlowKind; month?: string }) {
  const now = new Date();
  const today = todayManila(now);
  const current = currentMonth(now);
  const month = isMonth(rawMonth) ? rawMonth : current;
  const expense = kind === "expense";
  const basePath = expense ? "/admin/expenses" : "/admin/income";

  const [entries, categories, totals, prevTotals, accounts, last] = await Promise.all([
    getCashFlows(kind, month),
    getCategories(kind),
    getCategoryTotals(kind, month),
    getCategoryTotals(kind, addMonths(month, -1)),
    getAccounts(),
    getLastEntryDefaults(kind),
  ]);

  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  const prevTotal = [...prevTotals.values()].reduce((a, b) => a + b, 0);
  // Only spending in budgeted categories counts against the budget total.
  const budgeted = categories.filter((c) => !c.archived && (c.monthlyBudget ?? 0) > 0);
  const budget = budgetProgress(
    budgeted.reduce((sum, c) => sum + (totals.get(c.id) ?? 0), 0),
    budgeted.reduce((sum, c) => sum + c.monthlyBudget!, 0)
  );
  const formCategories = categories.map(({ id, name, archived }) => ({ id, name, archived }));

  const rows = categories
    .filter((c) => (totals.get(c.id) ?? 0) > 0 || (expense && !c.archived && (c.monthlyBudget ?? 0) > 0))
    .map((c) => ({ key: c.id, label: c.name, color: c.color, value: totals.get(c.id) ?? 0, budget: expense ? c.monthlyBudget : null }))
    .sort((a, b) => b.value - a.value);

  const byDay = new Map<string, CashFlowRow[]>();
  for (const e of entries) byDay.set(e.occurredOn, [...(byDay.get(e.occurredOn) ?? []), e]);

  return (
    <>
      <PageHeader eyebrow={expense ? "Money out" : "Money in"} title={expense ? "Expenses" : "Income"}>
        <MonthPicker month={month} current={current} basePath={basePath} />
      </PageHeader>

      <StatCards
        items={[
          { label: `${expense ? "Spent" : "Earned"} · ${monthLabel(month, "short")}`, value: <Money value={total} />, primary: true },
          {
            label: `vs ${monthLabel(addMonths(month, -1), "short")}`,
            value: <Money value={total - prevTotal} signed />,
            hint: prevTotal > 0 ? formatPct((total - prevTotal) / prevTotal, { signed: true }) : "—",
          },
          expense
            ? {
                label: "Budget used",
                value: budget ? formatPct(budget.ratio) : "—",
                hint: budget ? <Money value={budget.remaining} signed /> : "Set budgets in Settings",
              }
            : { label: "Entries", value: entries.length },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel title={expense ? "Add expense" : "Add income"}>
            <CashFlowForm
              kind={kind}
              categories={formCategories}
              accounts={accounts}
              defaults={{
                occurredOn: month === current ? today : `${month}-01`,
                categoryId: last?.categoryId,
                account: last?.account,
                currency: last?.currency,
              }}
            />
          </Panel>
        </div>
        <div className="lg:col-span-2">
          <Panel title={expense ? "By category" : "By source"}>
            {rows.length === 0 ? <EmptyState title="Nothing this month" /> : <Breakdown rows={rows} />}
          </Panel>
        </div>
      </div>

      <div className="mt-6">
        <Panel title={`${monthLabel(month)} · ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}>
          {entries.length === 0 ? (
            <EmptyState title="No entries">{expense ? "Log your first expense above." : "Log salary, freelance or other income above."}</EmptyState>
          ) : (
            <div className="flex flex-col gap-6">
              {[...byDay.entries()].map(([day, list]) => (
                <section key={day} className="flex flex-col gap-2">
                  <h3 className="flex justify-between border-b-2 border-border pb-2 font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
                    <span>{day === today ? "Today" : dayLabel(day)}</span>
                    <Money value={list.reduce((a, e) => a + e.amountPhp, 0)} />
                  </h3>
                  <ItemGroup>
                    {list.map((e) => (
                      <Item key={e.id} size="sm">
                        <ItemMedia>
                          <Swatch color={e.categoryColor} />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>{e.description}</ItemTitle>
                          <ItemDescription>{[e.categoryName, e.account, e.notes].filter(Boolean).join(" · ")}</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <div className="flex flex-col items-end font-mono text-sm">
                            <Money value={e.amount} currency={e.currency} />
                            {e.currency !== "PHP" && (
                              <span className="text-xs text-muted-foreground">
                                <Money value={e.amountPhp} />
                              </span>
                            )}
                          </div>
                          <RowActions
                            name={e.description}
                            editTitle={expense ? "Edit expense" : "Edit income"}
                            editForm={
                              <CashFlowForm
                                kind={kind}
                                categories={formCategories}
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
                          />
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                </section>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
