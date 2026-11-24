"use client";

import { useContext, useId, useState } from "react";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMoney } from "@/lib/finance/format";
import { monthLabel } from "@/lib/finance/dates";
import { updateBudgets, updateMonthBudgets } from "../_actions/categories";
import { FormField, FormFooter, useFormAction } from "./form";
import { PrivacyHiddenContext, maskDigits } from "./privacy";
import { PrivateRegion } from "./shell";
import { EmptyState, Money } from "./ui";

export interface BudgetRowDTO {
  id: number;
  name: string;
  /** The default, every month. */
  budget: number | null;
  /** This month's own budget: a number, null for "none this month", undefined for "uses the default". */
  override?: number | null;
  /** Spent this month, shown as a hint. */
  spent: number;
}

type Scope = "default" | "month";

/**
 * Every expense category's budget in one form (blank = no budget). Defaults apply to every month; a
 * month can set its own (a holiday month, a big purchase) without touching the rest. Both forms stay
 * mounted, so switching between them keeps what you typed in either.
 */
export function BudgetsForm({ categories, month }: { categories: BudgetRowDTO[]; month: string }) {
  const [scope, setScope] = useState<Scope>(categories.some((c) => c.override !== undefined) ? "month" : "default");

  if (categories.length === 0) {
    return <EmptyState title="No expense categories">Add some first, from Manage categories.</EmptyState>;
  }

  return (
    // The sheet is portalled outside the shell, so Hide amounts needs its own boundary here.
    <PrivateRegion>
      <div className="flex flex-col gap-4">
        <ToggleGroup type="single" variant="outline" size="sm" value={scope} onValueChange={(v) => v && setScope(v as Scope)} aria-label="Which budgets">
          <ToggleGroupItem value="default">Every month</ToggleGroupItem>
          <ToggleGroupItem value="month">Only {monthLabel(month, "short")}</ToggleGroupItem>
        </ToggleGroup>
        <ScopeForm scope="default" categories={categories} month={month} hidden={scope !== "default"} />
        <ScopeForm scope="month" categories={categories} month={month} hidden={scope !== "month"} />
      </div>
    </PrivateRegion>
  );
}

function ScopeForm({ scope, categories, month, hidden }: { scope: Scope; categories: BudgetRowDTO[]; month: string; hidden: boolean }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(scope === "default" ? updateBudgets : updateMonthBudgets);
  const amountsHidden = useContext(PrivacyHiddenContext);
  const uid = useId();
  const short = monthLabel(month, "short");
  const money = (value: number) => (amountsHidden ? maskDigits(formatMoney(value)) : formatMoney(value));
  return (
    <div hidden={hidden} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {scope === "default"
          ? "Defaults apply to every month that doesn't set its own."
          : `Just for ${monthLabel(month)}. Leave a field blank to use its default; enter 0 for no budget this month.`}
      </p>
      <form key={formKey} onSubmit={onSubmit} noValidate>
        {scope === "month" && <input type="hidden" name="month" value={month} />}
        <FieldGroup className="grid gap-4">
          {categories.map((c) => {
            const name = scope === "default" ? `budget:${c.id}` : `month:${c.id}`;
            const spent = c.spent > 0 ? <><Money value={c.spent} /> recorded in {short}</> : `No spending recorded in ${short}`;
            const fallback = c.budget == null ? "no default" : <>default <Money value={c.budget} /></>;
            return (
              <FormField key={c.id} id={`${uid}-${c.id}`} label={`${c.name} (PHP)`} error={error(name)} description={scope === "default" ? spent : <>{spent} · {fallback}</>}>
                <Input
                  id={`${uid}-${c.id}`}
                  name={name}
                  inputMode="decimal"
                  placeholder={scope === "default" || c.budget == null ? "No budget" : `Default ${money(c.budget)}`}
                  defaultValue={scope === "default" ? (c.budget ?? undefined) : c.override === undefined ? undefined : (c.override ?? 0)}
                  aria-invalid={Boolean(error(name))}
                />
              </FormField>
            );
          })}
          <FormFooter state={state} pending={pending}>
            {scope === "default" ? "Save defaults" : `Save ${short} budgets`}
          </FormFooter>
        </FieldGroup>
      </form>
    </div>
  );
}
