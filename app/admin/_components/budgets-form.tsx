"use client";

import { useId } from "react";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/finance/format";
import { updateBudgets } from "../_actions/categories";
import { FormField, FormFooter, useFormAction } from "./form";
import { EmptyState } from "./ui";

export interface BudgetRowDTO {
  id: number;
  name: string;
  budget: number | null;
  /** Spent this month, shown as a hint. */
  spent: number;
}

/** Every expense category's monthly budget in one form (blank = no budget). */
export function BudgetsForm({ categories }: { categories: BudgetRowDTO[] }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(updateBudgets);
  const uid = useId();

  if (categories.length === 0) {
    return <EmptyState title="No expense categories">Add categories in Settings first.</EmptyState>;
  }

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      <FieldGroup className="grid gap-4">
        {categories.map((c) => {
          const name = `budget:${c.id}`;
          return (
            <FormField
              key={c.id}
              id={`${uid}-${c.id}`}
              label={`${c.name} (PHP)`}
              error={error(name)}
              description={c.spent > 0 ? `${formatMoney(c.spent)} spent this month` : "Nothing spent this month"}
            >
              <Input
                id={`${uid}-${c.id}`}
                name={name}
                inputMode="decimal"
                placeholder="No budget"
                defaultValue={c.budget ?? undefined}
                aria-invalid={Boolean(error(name))}
              />
            </FormField>
          );
        })}
        <FormFooter state={state} pending={pending}>
          Save budgets
        </FormFooter>
      </FieldGroup>
    </form>
  );
}
