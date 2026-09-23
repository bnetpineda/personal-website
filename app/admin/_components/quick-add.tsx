"use client";

import { useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EntrySuggestion } from "@/lib/dal";
import { CASH_FLOW_KINDS, type CashFlowKind } from "@/lib/finance/constants";
import { CashFlowForm, type CashFlowFormProps, type FormCategory } from "./cash-flow-form";
import { FormSheetContent } from "./form";
import { useAdminUi } from "./shell";

export interface QuickAddProps {
  categories: Record<CashFlowKind, FormCategory[]>;
  accounts: string[];
  suggestions: EntrySuggestion[];
  defaults: Record<CashFlowKind, CashFlowFormProps["defaults"]>;
}

/**
 * Add an expense or income from any admin page: the header "Add" button (desktop), the
 * floating + (phones), the E / I keys, the command menu, or the home-screen shortcuts
 * (`/admin?add=expense`).
 */
export function QuickAdd({ categories, accounts, suggestions, defaults }: QuickAddProps) {
  const { adding, setAdding } = useAdminUi();

  // Home-screen shortcut: open once, then drop the param so a reload doesn't reopen it.
  useEffect(() => {
    const url = new URL(window.location.href);
    const kind = url.searchParams.get("add");
    if (!CASH_FLOW_KINDS.includes(kind as CashFlowKind)) return;
    setAdding(kind as CashFlowKind);
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url);
  }, [setAdding]);

  return (
    <>
      <div className="fixed right-4 bottom-24 z-40 mb-safe lg:hidden">
        <Button size="lg" onClick={() => setAdding("expense")}>
          <Plus /> Add
        </Button>
      </div>
      <Sheet open={adding != null} onOpenChange={(open) => !open && setAdding(null)}>
        <FormSheetContent
          title={adding === "income" ? "Add income" : "Add expense"}
          description="Amount and category are all it needs."
          onClose={() => setAdding(null)}
        >
          {adding && (
            <div className="flex flex-col gap-6">
              <ToggleGroup
                type="single"
                variant="outline"
                value={adding}
                onValueChange={(value) => value && setAdding(value as CashFlowKind)}
                aria-label="Entry type"
              >
                <ToggleGroupItem value="expense">Expense</ToggleGroupItem>
                <ToggleGroupItem value="income">Income</ToggleGroupItem>
              </ToggleGroup>
              <CashFlowForm
                key={adding}
                kind={adding}
                categories={categories[adding]}
                accounts={accounts}
                suggestions={suggestions.filter((s) => s.kind === adding)}
                defaults={defaults[adding]}
                autoFocus
              />
            </div>
          )}
        </FormSheetContent>
      </Sheet>
    </>
  );
}

/** Page-header "Add" button that opens quick add for one kind. */
export function AddEntryButton({ kind, label }: { kind: CashFlowKind; label?: string }) {
  const { setAdding } = useAdminUi();
  return (
    <Button onClick={() => setAdding(kind)}>
      <Plus /> {label ?? (kind === "expense" ? "Add expense" : "Add income")}
    </Button>
  );
}
