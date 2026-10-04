"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Swatch } from "@/components/ui/swatch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CashFlowKind } from "@/lib/finance/constants";
import { useDashboardFilters } from "./dashboard-filters";
import { EmptyState, Money, Panel, Pct } from "./ui";

export interface BreakdownItem {
  id: number;
  label: string;
  color: string;
  value: number;
  /** With a budget the bar shows value/budget (amber ≥ 85%, red when over). */
  budget: number | null;
}

/**
 * The month by category, spending or income. Tapping a category filters Activity to it (tap again
 * to clear); on phones the page scrolls down to the list.
 */
export function CategoryBreakdown({ expense, income, action }: { expense: BreakdownItem[]; income: BreakdownItem[]; action?: ReactNode }) {
  const filters = useDashboardFilters();
  // The tab follows Activity's type filter (In shows income sources) until a tab is picked here.
  const filterKind = filters.kind ?? (income.some((i) => i.id === filters.category) ? "income" : null);
  const [picked, setPicked] = useState<CashFlowKind | null>(null);
  const [seenKind, setSeenKind] = useState(filterKind);
  if (seenKind !== filterKind) {
    setSeenKind(filterKind);
    setPicked(null);
  }
  const tab = picked ?? (filterKind === "income" ? "income" : "expense");

  const pick = (id: number) => {
    filters.set({ category: filters.category === id ? null : id, kind: null });
    // Wide screens show Activity next to this panel; elsewhere it sits further down the page.
    if (!window.matchMedia("(min-width: 80rem)").matches) document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <Tabs value={tab} onValueChange={(value) => setPicked(value as CashFlowKind)} className="h-full">
      <Panel
        fill
        title="By category"
        action={action}
        toolbar={
          <TabsList className="w-full">
            <TabsTrigger value="expense">Spending</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        }
      >
        <TabsContent value="expense">
          <Rows rows={expense} active={filters.category} onPick={pick} empty="Nothing spent yet" />
        </TabsContent>
        <TabsContent value="income">
          <Rows rows={income} active={filters.category} onPick={pick} empty="Nothing earned yet" />
        </TabsContent>
      </Panel>
    </Tabs>
  );
}

/** Budget progress when a budget exists, otherwise share of the largest row. */
function Rows({ rows, active, onPick, empty }: { rows: BreakdownItem[]; active: number | null; onPick: (id: number) => void; empty: string }) {
  if (rows.length === 0) return <EmptyState size="sm" title={empty} />;
  const max = Math.max(...rows.map((r) => r.value), 0);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <ul className="flex flex-col gap-0.5">
      {rows.map((row) => {
        const budget = row.budget != null && row.budget > 0 ? row.budget : null;
        const ratio = budget ? row.value / budget : max > 0 ? row.value / max : 0;
        const variant = budget ? (ratio > 1 ? "destructive" : ratio >= 0.85 ? "warning" : "default") : "default";
        const pressed = active === row.id;
        return (
          <li key={row.id} className="flex flex-col">
            <button
              type="button"
              aria-pressed={pressed}
              onClick={() => onPick(row.id)}
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
                  <Money value={row.value} />
                  {budget ? (
                    <>
                      {" / "}
                      <Money value={budget} />
                    </>
                  ) : total > 0 ? (
                    <>
                      {" · "}
                      <Pct value={row.value / total} />
                    </>
                  ) : null}
                </span>
              </span>
              <Progress aria-hidden value={Math.min(ratio, 1) * 100} variant={variant} indicatorColor={budget ? undefined : row.color} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
