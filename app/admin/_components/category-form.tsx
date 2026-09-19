"use client";

import { useId } from "react";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SwatchPicker } from "@/components/ui/swatch";
import { CATEGORY_COLORS, type CashFlowKind } from "@/lib/finance/constants";
import { saveCategory } from "../_actions/categories";
import { FormField, FormFooter, useFormAction } from "./form";

export interface CategoryDTO {
  id: number;
  kind: CashFlowKind;
  name: string;
  color: string;
  monthlyBudget: number | null;
}

export function CategoryForm({ kind, category }: { kind: CashFlowKind; category?: CategoryDTO }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveCategory);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const current = category?.color ?? CATEGORY_COLORS[0];
  const palette = CATEGORY_COLORS.some((c) => c.toLowerCase() === current.toLowerCase()) ? CATEGORY_COLORS : [current, ...CATEGORY_COLORS];

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      <input type="hidden" name="kind" value={kind} />
      {category && <input type="hidden" name="id" value={category.id} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("name")} label="Name" error={error("name")} wide={kind !== "expense"}>
          <Input id={id("name")} name="name" maxLength={40} defaultValue={category?.name} aria-invalid={Boolean(error("name"))} />
        </FormField>
        {kind === "expense" && (
          <FormField id={id("budget")} label="Monthly budget (PHP)" error={error("monthlyBudget")} description="Blank = no budget">
            <Input id={id("budget")} name="monthlyBudget" inputMode="decimal" defaultValue={category?.monthlyBudget ?? undefined} />
          </FormField>
        )}
        <Field data-invalid={error("color") ? true : undefined} className="sm:col-span-2">
          <FieldLabel id={id("color")}>Color</FieldLabel>
          <SwatchPicker name="color" colors={palette} defaultValue={current} aria-labelledby={id("color")} />
          {error("color") && <FieldError>{error("color")}</FieldError>}
        </Field>
        <FormFooter state={state} pending={pending}>
          {category ? "Save" : "Add category"}
        </FormFooter>
      </FieldGroup>
    </form>
  );
}
