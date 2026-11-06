"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EntrySuggestion } from "@/lib/dal";
import type { CashFlowKind } from "@/lib/finance/constants";
import { getAddEntryData, getAddEntrySuggestions } from "../_actions/cash-flows";
import { CashFlowForm, type CashFlowFormProps, type FormCategory } from "./cash-flow-form";
import { FormSheetContent, notify } from "./form";

export interface AddEntryData {
  categories: Record<CashFlowKind, FormCategory[]>;
  accounts: string[];
  suggestions: EntrySuggestion[];
  defaults: Record<CashFlowKind, CashFlowFormProps["defaults"]>;
}

export interface AddEntryProps extends Omit<AddEntryData, "suggestions"> {
  kind: CashFlowKind;
  viewedMonth?: string;
}

const requestedKind = (value: string | null): CashFlowKind | null => (value === "expense" || value === "income" ? value : null);

function AddEntryForm({ kind, onKind, categories, accounts, suggestions, defaults, viewedMonth }: AddEntryData & { kind: CashFlowKind; onKind: (kind: CashFlowKind) => void; viewedMonth?: string }) {
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

/**
 * Manual entry for the odd cash payment; synced accounts cover the rest. `?add=expense` or
 * `?add=income` (the ⌘K menu, from any page) opens it, then the parameter is dropped.
 */
export function AddEntry({ kind: initialKind, viewedMonth, ...data }: AddEntryProps) {
  const requested = useSearchParams().get("add");
  const [open, setOpen] = useState(requestedKind(requested) != null);
  const [kind, setKind] = useState(requestedKind(requested) ?? initialKind);
  const [seen, setSeen] = useState(requested);
  // Past entries to suggest from are the heaviest part of the form, so they load when it first opens.
  const [suggestions, setSuggestions] = useState<EntrySuggestion[] | null>(null);
  useEffect(() => {
    if (!open || suggestions) return;
    getAddEntrySuggestions().then(setSuggestions).catch(() => setSuggestions([]));
  }, [open, suggestions]);
  if (requested !== seen) {
    setSeen(requested);
    const asked = requestedKind(requested);
    if (asked) {
      setKind(asked);
      setOpen(true);
    }
  }
  useEffect(() => {
    if (!requested) return;
    const rest = new URLSearchParams(window.location.search);
    rest.delete("add");
    const query = rest.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [requested]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus /> Add
        </Button>
      </SheetTrigger>
      <FormSheetContent
        title={kind === "income" ? "Add income" : "Add expense"}
        description="For cash and anything your accounts don't sync."
        onClose={() => setOpen(false)}
      >
        <AddEntryForm {...data} suggestions={suggestions ?? []} kind={kind} onKind={setKind} viewedMonth={viewedMonth} />
      </FormSheetContent>
    </Sheet>
  );
}

/** The same sheet on every other page, in place: its data loads when it opens, so those pages don't pay for it. */
export function AddEntryAnywhere() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CashFlowKind>("expense");
  const [data, setData] = useState<AddEntryData | null>(null);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next || data) return;
    getAddEntryData().then(setData).catch(() => {
      setOpen(false);
      notify({ ok: false, message: "Couldn't open the form. Try again." });
    });
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus /> Add
        </Button>
      </SheetTrigger>
      <FormSheetContent
        title={kind === "income" ? "Add income" : "Add expense"}
        description="For cash and anything your accounts don't sync."
        onClose={() => setOpen(false)}
      >
        {data ? <AddEntryForm {...data} kind={kind} onKind={setKind} /> : <div role="status" aria-label="Loading" className="flex justify-center py-8"><Spinner /></div>}
      </FormSheetContent>
    </Sheet>
  );
}
