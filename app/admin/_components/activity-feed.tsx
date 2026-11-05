"use client";

import { useEffect, useRef } from "react";
import Form from "next/form";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { ArrowLeft, ArrowRight, GraduationCap, Repeat, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CashFlowKind } from "@/lib/finance/constants";
import { dayLabel, monthLabel } from "@/lib/finance/dates";
import { filingNote } from "@/lib/finance/notes";
import { deleteCashFlow, restoreCashFlow } from "../_actions/cash-flows";
import { CashFlowForm, type FormCategory } from "./cash-flow-form";
import { CategoryPicker } from "./category-picker";
import { useDashboardFilters } from "./dashboard-filters";
import { EditableRow } from "./row-actions";
import { EmptyState, Money, Panel, Pct } from "./ui";

/** One cash-flow entry as the feed needs it. */
export interface ActivityEntry {
  id: string;
  kind: CashFlowKind;
  occurredOn: string;
  description: string;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  account: string | null;
  notes: string | null;
  amount: number;
  currency: string;
  amountPhp: number;
  recurringId: string | null;
}

export interface ActivityCategory {
  id: number;
  kind: CashFlowKind;
  name: string;
  color: string;
  monthlyBudget: number | null;
}

const KINDS = [
  { value: "all", label: "All" },
  { value: "expense", label: "Spending" },
  { value: "income", label: "Income" },
] as const;

/**
 * The month's entries (or a search across all months), grouped by day. Type and category filter
 * on the client — the Spending panel sets the category too — so switching is instant.
 */
export function ActivityFeed({
  entries,
  search,
  month,
  current,
  coverageNote,
  lastRecordedMonth,
  today,
  categories,
  formCategories,
  accounts,
  totals,
  className,
}: {
  entries: ActivityEntry[];
  /** Set when the list is a search across all months (`capped`: only the newest results came back). */
  search: { q: string; capped: number | null } | null;
  /** The month on show and this month (YYYY-MM). */
  month: string;
  current: string;
  coverageNote?: string;
  /** A month that actually contains records, rather than an empty previous month. */
  lastRecordedMonth?: string;
  today: string;
  categories: ActivityCategory[];
  formCategories: Record<CashFlowKind, FormCategory[]>;
  accounts: string[];
  /** The month's PHP totals, for what one category adds up to. */
  totals: { expense: number | null; income: number | null; byCategory: Record<number, number | null> };
  className?: string;
}) {
  const filters = useDashboardFilters();
  const searchInput = useRef<HTMLInputElement>(null);
  // "/" jumps to the search box from anywhere on the page (not while typing elsewhere).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      event.preventDefault();
      searchInput.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // A category filter implies its kind.
  const category = categories.find((c) => c.id === filters.category) ?? null;
  const kind = category?.kind ?? filters.kind;
  const visible = entries.filter((e) => (!kind || e.kind === kind) && (!category || e.categoryId === category.id));
  // Always signed, so a filter doesn't change how the same entry reads; a day's total is its net cash flow.
  const signedAmount = (e: ActivityEntry) => (e.kind === "expense" ? -e.amountPhp : e.amountPhp);
  const sum = (k: CashFlowKind) => visible.filter((e) => e.kind === k).reduce((a, e) => a + e.amountPhp, 0);

  const byDay = new Map<string, ActivityEntry[]>();
  for (const e of visible) byDay.set(e.occurredOn, [...(byDay.get(e.occurredOn) ?? []), e]);

  const toolbar = (
    <div className="flex flex-col gap-2">
      {/* Always mounted, so screen readers hear the new count when a filter changes. */}
      <p role="status" className="sr-only">
        {visible.length} {visible.length === 1 ? "entry" : "entries"} shown
      </p>
      <Form action="/admin" role="search">
        {filters.month && <input type="hidden" name="month" value={filters.month} />}
        {filters.kind && <input type="hidden" name="kind" value={filters.kind} />}
        {category && <input type="hidden" name="category" value={category.id} />}
        <ButtonGroup className="w-full">
          <Input
            key={search?.q ?? ""}
            name="q"
            type="search"
            defaultValue={search?.q ?? ""}
            ref={searchInput}
            placeholder="Search all months…"
            aria-keyshortcuts="/"
            aria-label="Search entries"
            autoComplete="off"
          />
          <SearchButton />
        </ButtonGroup>
      </Form>
      {(search || category) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <Button asChild variant="outline" size="xs" touch>
              <Link href={filters.hrefWith({ q: null })} aria-label={`Back to ${monthLabel(month)}; clear search for ${search.q}`}>
                <ArrowLeft /> Back to {monthLabel(month, "short")}
              </Link>
            </Button>
          )}
          {category && (
            <Button size="xs" touch onClick={() => filters.set({ category: null })} aria-label={`Show all categories, not only ${category.name}`}>
              <Swatch color={category.color} size="sm" />
              {category.name}
              <X />
            </Button>
          )}
          <p className="font-mono text-xs text-muted-foreground">
            {search ? (
              <>
                “{search.q}” · {visible.length} {visible.length === 1 ? "result" : "results"}
                {search.capped != null && ` · newest ${search.capped}`} · out <Money value={sum("expense")} /> · in <Money value={sum("income")} />
              </>
            ) : category?.kind === "expense" ? (
              <CategorySummary spent={totals.byCategory[category.id] ?? (coverageNote ? null : 0)} of={totals.expense} budget={category.monthlyBudget} share="spending" />
            ) : category ? (
              <CategorySummary spent={totals.byCategory[category.id] ?? (coverageNote ? null : 0)} of={totals.income} budget={null} share="income" />
            ) : null}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <Panel
      fill
      id="activity"
      focusableHeading
      className={className}
      title={
        <>
          {search ? "Search · all months" : "Activity"} <span className="font-mono text-xs text-muted-foreground">· {visible.length}</span>
        </>
      }
      action={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={kind ?? "all"}
          onValueChange={(value) => value && filters.set({ kind: value === "all" ? null : (value as CashFlowKind), category: null })}
          aria-label="Entry type"
        >
          {KINDS.map((k) => (
            <ToggleGroupItem key={k.value} value={k.value}>
              {k.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
      toolbar={toolbar}
    >
      {visible.length === 0 ? (
        <EmptyState
          size="sm"
          title={search || entries.length > 0 ? "No matching entries" : `No records for ${monthLabel(month)}${category ? ` · ${category.name}` : ""}`}
          action={!search && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {entries.length > 0 ? (
                <Button variant="outline" size="sm" touch onClick={() => filters.set({ kind: null, category: null })}>Clear filters</Button>
              ) : (
                <>
                  {coverageNote && month <= current && <Button asChild size="sm" touch><Link href="/admin/connections">Import statements <ArrowRight /></Link></Button>}
                  {lastRecordedMonth && <Button asChild variant="outline" size="sm" touch><Link href={filters.monthHref(lastRecordedMonth)}>View {monthLabel(lastRecordedMonth, "short")}</Link></Button>}
                </>
              )}
            </div>
          )}
        >
          {search ? (
            "Try another word — search covers descriptions, notes, accounts and categories."
          ) : (
            entries.length > 0 ? "Try another type or category filter." : month > current ? "This is a future month. No activity has been recorded yet." : coverageNote ? "Import your bank statements to fill in this month. Missing records are not zero totals." : month === current ? "Transactions show up here once they're recorded." : "No entries were recorded for this month."
          )}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day} aria-label={day === today ? "Today" : dayLabel(day)}>
              {/* Sticks while its day scrolls by; the background spans the panel's padding so rows don't show beside it. */}
              <h3 className="z-20 -mx-4 bg-card px-4 pt-1 font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase xl:sticky xl:top-0">
                <span className="flex justify-between border-b-2 border-border pb-1.5">
                  <span>{day === today ? "Today" : dayLabel(day)}</span>
                  <Money value={list.reduce((a, e) => a + signedAmount(e), 0)} signed />
                </span>
              </h3>
              <ItemGroup>
                {list.map((e) => (
                  <EditableRow
                    key={e.id}
                    size="xs"
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
                    extra={
                      <CategoryPicker
                        entryId={e.id}
                        description={e.description}
                        current={{ id: e.categoryId, name: e.categoryName, color: e.categoryColor }}
                        options={formCategories[e.kind]}
                      />
                    }
                    media={
                      <ItemMedia>
                        <Swatch color={e.categoryColor} />
                      </ItemMedia>
                    }
                    aside={
                      <span className="flex flex-col items-end font-mono text-sm">
                        <Money
                          value={e.kind === "expense" ? -e.amount : e.amount}
                          currency={e.currency}
                          signed
                          tone={e.kind === "income"}
                        />
                        {e.currency !== "PHP" && (
                          <span className="text-xs text-muted-foreground">
                            <Money value={signedAmount(e)} signed />
                          </span>
                        )}
                      </span>
                    }
                  >
                    <ItemContent>
                      <ItemTitle>
                        {e.description}
                        {e.recurringId && <Repeat aria-label="Recurring" className="size-3 text-muted-foreground" />}
                        <FiledBy notes={e.notes} />
                      </ItemTitle>
                      <Details entry={e} withDate={search != null} />
                    </ItemContent>
                  </EditableRow>
                ))}
              </ItemGroup>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Submits the search; spins while the results load (a search covers all months, so it asks the server). */
function SearchButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="icon" aria-label="Search" disabled={pending}>
      {pending ? <Spinner /> : <Search />}
    </Button>
  );
}

/**
 * Account and the person's own note on one line (the date too in search results). The category
 * has its own picker on wide screens, so it only joins the line on phones.
 */
function Details({ entry: e, withDate }: { entry: ActivityEntry; withDate: boolean }) {
  const note = filingNote(e.notes) ? null : e.notes;
  const parts = [withDate ? dayLabel(e.occurredOn) : null, e.account, note].filter(Boolean).join(" · ");
  return (
    <ItemDescription clamp={1} title={[e.categoryName, parts].filter(Boolean).join(" · ")}>
      <span className="sm:hidden">
        {e.categoryName}
        {parts && " · "}
      </span>
      {parts}
    </ItemDescription>
  );
}

/** How the importer filed it, as an icon (the reason shows on hover) instead of a sentence in every row. */
function FiledBy({ notes }: { notes: string | null }) {
  const filed = filingNote(notes);
  if (!filed || filed.by === "import") return null;
  const label = filed.by === "ai" ? `Filed by AI: ${filed.reason}` : `Taught: ${filed.reason}`;
  const Icon = filed.by === "ai" ? Sparkles : GraduationCap;
  return (
    <span title={label} className="inline-flex text-muted-foreground">
      <Icon aria-label={label} className="size-3" />
    </span>
  );
}

/** "₱8,200 · 23% of spending · 82% of budget" for the selected category's month. */
function CategorySummary({ spent, of, budget, share }: { spent: number | null; of: number | null; budget: number | null; share: string }) {
  if (spent == null) return <>No recorded data for this category.</>;
  return (
    <>
      <Money value={spent} /> · <Pct value={of != null && of > 0 ? spent / of : null} /> of {share}
      {budget != null && budget > 0 && (
        <>
          {" · "}
          <Pct value={spent / budget} /> of <Money value={budget} /> budget
        </>
      )}
    </>
  );
}
