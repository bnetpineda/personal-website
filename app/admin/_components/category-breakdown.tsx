"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Swatch } from "@/components/ui/swatch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CashFlowKind } from "@/lib/finance/constants";
import { useDashboardFilters } from "./dashboard-filters";
import { dashboardCategoryFilter } from "./nav";
import { EmptyState, Money, Panel, Pct } from "./ui";

export interface BreakdownItem {
  id: number;
  label: string;
  color: string;
  /** null: no recorded amount while the month's statements are incomplete. */
  value: number | null;
  /** With a budget the bar shows value/budget (amber ≥ 85%, red when over). */
  budget: number | null;
}

/**
 * The month by category, spending or income. Tapping a category filters Activity to it (tap again
 * to clear); on phones the page scrolls down to the list.
 */
export function CategoryBreakdown({ expense, income, coverageNote, action }: { expense: BreakdownItem[]; income: BreakdownItem[]; coverageNote?: string; action?: ReactNode }) {
  const filters = useDashboardFilters();
  const categoryKind = income.some((i) => i.id === filters.category) ? "income" : expense.some((i) => i.id === filters.category) ? "expense" : null;
  const tab = categoryKind ?? filters.kind ?? "all";

  const pick = (id: number, kind: CashFlowKind, keyboard: boolean) => {
    filters.set(dashboardCategoryFilter(filters.category, { id, kind }));
    // On smaller screens, move both the viewport and keyboard focus into the filtered results.
    if (!window.matchMedia("(min-width: 80rem)").matches) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("activity")?.scrollIntoView({ behavior: keyboard || reduced ? "instant" : "smooth" });
      document.getElementById("activity-heading")?.focus({ preventScroll: true });
    }
  };

  const rows = (kind: CashFlowKind) => <Rows rows={kind === "expense" ? expense : income} active={filters.category} onPick={(id, keyboard) => pick(id, kind, keyboard)} empty={kind === "expense" ? "No spending recorded" : "No income recorded"} />;

  return (
    <Tabs value={tab} onValueChange={(value) => filters.set({ kind: value === "all" ? null : value as CashFlowKind, category: null })} className="h-full">
      <Panel
        fill
        id="categories"
        title="By category"
        action={action}
        toolbar={
          <TabsList aria-label="Category breakdown type" className="w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="expense">Spending</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        }
      >
        {coverageNote && <p className="mb-3 text-xs text-muted-foreground" title={coverageNote}>Recorded categories only</p>}
        <TabsContent value="all">
          {expense.length === 0 && income.length === 0 ? <EmptyState size="sm" title="No categories recorded" /> : (
            <div className="flex flex-col gap-4">
              {expense.length > 0 && <div className="flex flex-col gap-1"><h3 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Spending</h3>{rows("expense")}</div>}
              {income.length > 0 && <div className="flex flex-col gap-1"><h3 className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Income</h3>{rows("income")}</div>}
            </div>
          )}
        </TabsContent>
        <TabsContent value="expense">
          {rows("expense")}
        </TabsContent>
        <TabsContent value="income">
          {rows("income")}
        </TabsContent>
      </Panel>
    </Tabs>
  );
}

/** Budget progress when a budget exists, otherwise share of the largest row. */
function Rows({ rows, active, onPick, empty }: { rows: BreakdownItem[]; active: number | null; onPick: (id: number, keyboard: boolean) => void; empty: string }) {
  if (rows.length === 0) return <EmptyState size="sm" title={empty} />;
  const max = Math.max(...rows.map((r) => r.value ?? 0), 0);
  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((row) => {
        const budget = row.budget != null && row.budget > 0 ? row.budget : null;
        const ratio = row.value == null ? null : budget ? row.value / budget : max > 0 ? row.value / max : 0;
        const variant = budget && ratio != null ? (ratio > 1 ? "destructive" : ratio >= 0.85 ? "warning" : "default") : "default";
        const pressed = active === row.id;
        return (
          <li key={row.id} className="flex flex-col">
            <button
              type="button"
              aria-pressed={pressed}
              onClick={(event) => onPick(row.id, event.detail === 0)}
              className={cn(
                "-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                pressed && "bg-muted"
              )}
            >
              <span className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Swatch color={row.color} />
                  <span className="sr-only">Show Activity for </span>
                  <span className={cn("truncate", pressed && "font-bold underline underline-offset-4")}>{row.label}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {row.value == null ? <span aria-label="No recorded data">—</span> : <Money value={row.value} />}
                  {budget ? (
                    <>
                      {" / "}
                      <Money value={budget} />
                    </>
                  ) : total > 0 && row.value != null ? (
                    <>
                      {" · "}
                      <Pct value={row.value / total} />
                    </>
                  ) : null}
                </span>
              </span>
              {ratio != null && <Progress aria-hidden value={Math.min(ratio, 1) * 100} variant={variant} indicatorColor={budget ? undefined : row.color} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
