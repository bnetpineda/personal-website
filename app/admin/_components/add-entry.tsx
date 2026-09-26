"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EntrySuggestion } from "@/lib/dal";
import type { CashFlowKind } from "@/lib/finance/constants";
import { CashFlowForm, type CashFlowFormProps, type FormCategory } from "./cash-flow-form";
import { FormSheetContent } from "./form";

export interface AddEntryProps {
  kind: CashFlowKind;
  categories: Record<CashFlowKind, FormCategory[]>;
  accounts: string[];
  suggestions: EntrySuggestion[];
  defaults: Record<CashFlowKind, CashFlowFormProps["defaults"]>;
}

/** Manual entry for the odd cash payment; synced accounts cover the rest. */
export function AddEntry({ kind: initialKind, categories, accounts, suggestions, defaults }: AddEntryProps) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(initialKind);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus /> Add
        </Button>
      </SheetTrigger>
      <FormSheetContent
        title={kind === "income" ? "Add income" : "Add expense"}
        description="For cash and anything your accounts don't sync."
        onClose={() => setOpen(false)}
      >
        <div className="flex flex-col gap-6">
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(value) => value && setKind(value as CashFlowKind)}
            aria-label="Entry type"
          >
            <ToggleGroupItem value="expense">Expense</ToggleGroupItem>
            <ToggleGroupItem value="income">Income</ToggleGroupItem>
          </ToggleGroup>
          <CashFlowForm
            key={kind}
            kind={kind}
            categories={categories[kind]}
            accounts={accounts}
            suggestions={suggestions.filter((s) => s.kind === kind)}
            defaults={defaults[kind]}
            autoFocus
          />
        </div>
      </FormSheetContent>
    </Sheet>
  );
}
