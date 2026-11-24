"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { CashFlowKind } from "@/lib/finance/constants";
import type { AddEntryData } from "./add-entry";
import { CashFlowForm } from "./cash-flow-form";

/** The Add sheet's body. Loaded on first open (see ./add-entry), so pages don't ship the form up front. */
export function AddEntryForm({ kind, onKind, categories, accounts, suggestions, defaults, viewedMonth }: AddEntryData & { kind: CashFlowKind; onKind: (kind: CashFlowKind) => void; viewedMonth?: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ToggleGroup
        type="single"
        variant="outline"
        value={kind}
        onValueChange={(value) => value && onKind(value as CashFlowKind)}
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
        viewedMonth={viewedMonth}
        autoFocus
      />
    </div>
  );
}
