"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Swatch } from "@/components/ui/swatch";
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
  const showExpense = filters.kind !== "income" && expense.length > 0;
  const showIncome = filters.kind !== "expense" && income.length > 0;

  const pick = (id: number, keyboard: boolean) => {
    filters.set(dashboardCategoryFilter(filters.category, { id }));
    // On smaller screens, move both the viewport and keyboard focus into the filtered results.
    if (!window.matchMedia("(min-width: 80rem)").matches) {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById("activity")?.scrollIntoView({ behavior: keyboard || reduced ? "instant" : "smooth" });
      document.getElementById("activity-heading")?.focus({ preventScroll: true });
    }
  };

  const heading = "font-mono text-xs tracking-wider text-muted-foreground uppercase";

  return (
    <Panel fill id="categories" title="By category" action={action} className="h-full">
      {!showExpense && !showIncome ? (
        <EmptyState size="sm" title={filters.kind === "expense" ? "No spending recorded" : filters.kind === "income" ? "No income recorded" : "No categories recorded"} />
      ) : (
        <div className="flex flex-col gap-1.5">
          {showExpense && <div><h3 className={heading} title={coverageNote}>Spending</h3><Rows rows={expense} active={filters.category} onPick={pick} /></div>}
          {showIncome && <div><h3 className={heading} title={coverageNote}>Income</h3><Rows rows={income} active={filters.category} onPick={pick} /></div>}
        </div>
      )}
    </Panel>
  );
}

/** In a busy month the rest fold behind "N more", so the biggest categories are never the ones scrolled out of view. */
const FOLD_AFTER = 6;

/** A hairline for budget progress; without a budget the percentage says it all and the row stays one line. */
function Rows({ rows, active, onPick }: { rows: BreakdownItem[]; active: number | null; onPick: (id: number, keyboard: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  // Over budget, or the filtered category, always shows, even when folded.
  const folds = rows.length > FOLD_AFTER + 1;
  const shown = !folds || expanded ? rows : rows.filter((row, i) => i < FOLD_AFTER || row.id === active || (row.budget != null && row.value != null && row.value > row.budget));
  const hidden = rows.length - shown.length;
  return (
    <ul className="flex flex-col">
      {shown.map((row) => {
        const budget = row.budget != null && row.budget > 0 ? row.budget : null;
        const ratio = row.value == null ? null : budget ? row.value / budget : total > 0 ? row.value / total : 0;
        const variant = budget && ratio != null ? (ratio > 1 ? "destructive" : ratio >= 0.85 ? "warning" : "default") : "default";
        const pressed = active === row.id;
        return (
          <li key={row.id} className="flex flex-col">
            <button
              type="button"
              aria-pressed={pressed}
              onClick={(event) => onPick(row.id, event.detail === 0)}
              className={cn(
                "-mx-2 flex flex-col justify-center gap-0.5 rounded-md px-2 py-0.5 text-left outline-none pointer-coarse:min-h-11 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                pressed && "bg-muted"
              )}
            >
              <span className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Swatch color={row.color} />
                  <span className="sr-only">Show Activity for </span>
                  <span className={cn("truncate", pressed && "font-bold underline underline-offset-4")}>{row.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground">
                  <span>
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
                  <ChevronRight aria-hidden className="size-3" />
                </span>
              </span>
              {/* A bar gives the proportion away, so it hides with the amounts. */}
              {budget && ratio != null && <span className="block group-data-[private=true]/shell:blur-sm"><Progress thin aria-hidden value={Math.min(ratio, 1) * 100} variant={variant} /></span>}
            </button>
          </li>
        );
      })}
      {folds && (hidden > 0 || expanded) && (
        <li>
          <Button variant="subtle" size="xs" className="-mx-2" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show fewer" : `${hidden} more`}
          </Button>
        </li>
      )}
    </ul>
  );
}
