"use client";

import { useId, useState } from "react";
import { ButtonGroup } from "@/components/ui/button-group";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Swatch } from "@/components/ui/swatch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { EntrySuggestion } from "@/lib/dal";
import { CURRENCIES, type CashFlowKind } from "@/lib/finance/constants";
import { addDays, todayManila } from "@/lib/finance/dates";
import { deleteCashFlow, saveCashFlow } from "../_actions/cash-flows";
import { FormField, FormFooter, useFormAction } from "./form";

export interface FormCategory {
  id: number;
  name: string;
  color: string;
  archived: boolean;
}

export interface CashFlowFormProps {
  kind: CashFlowKind;
  categories: FormCategory[];
  accounts: string[];
  /** Past descriptions for this kind; picking one fills in its category and account. */
  suggestions?: EntrySuggestion[];
  defaults: {
    occurredOn: string;
    currency?: string | null;
    categoryId?: number | null;
    account?: string | null;
    amount?: number;
    description?: string;
    notes?: string | null;
  };
  /** Posting a due occurrence of a recurring item (links the entry and advances the item). */
  recurring?: { id: string; on: string };
  entry?: {
    id: string;
    occurredOn: string;
    amount: number;
    currency: string;
    categoryId: number;
    description: string;
    account: string | null;
    notes: string | null;
  };
  /** Focus the amount on open (the add sheet). */
  autoFocus?: boolean;
}

export function CashFlowForm({ kind, categories, accounts, suggestions = [], defaults, entry, recurring, autoFocus }: CashFlowFormProps) {
  // A fresh entry can be taken back from the toast; posting a recurring item or editing can't.
  // Fields remount (formKey) only after a successful save, so typed values survive errors.
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveCashFlow, {
    undo: (s) => (!entry && !recurring && s.id ? () => deleteCashFlow(s.id!) : undefined),
  });
  return (
    <CashFlowFields
      key={formKey}
      kind={kind}
      categories={categories}
      accounts={accounts}
      suggestions={suggestions}
      defaults={defaults}
      entry={entry}
      recurring={recurring}
      autoFocus={autoFocus}
      onSubmit={onSubmit}
      footer={
        <FormFooter state={state} pending={pending}>
          {entry ? "Save" : recurring ? "Post" : kind === "expense" ? "Add expense" : "Add income"}
        </FormFooter>
      }
      error={error}
    />
  );
}

function CashFlowFields({
  kind,
  categories,
  accounts,
  suggestions,
  defaults,
  entry,
  recurring,
  autoFocus,
  onSubmit,
  footer,
  error,
}: Omit<CashFlowFormProps, "suggestions"> & {
  suggestions: EntrySuggestion[];
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  footer: React.ReactNode;
  error: (name: string) => string | undefined;
}) {
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const expense = kind === "expense";
  const today = todayManila();
  const yesterday = addDays(today, -1);
  const options = categories.filter((c) => !c.archived || c.id === entry?.categoryId);

  const initialCategory = String(entry?.categoryId ?? defaults.categoryId ?? "");
  const [categoryId, setCategoryId] = useState(options.some((c) => String(c.id) === initialCategory) ? initialCategory : "");
  const [date, setDate] = useState(entry?.occurredOn ?? defaults.occurredOn);
  const [account, setAccount] = useState((entry ? entry.account : defaults.account) ?? "");
  // Suggestions only fill fields the user hasn't set by hand.
  const [touched, setTouched] = useState({ category: Boolean(entry), account: Boolean(entry) });

  const suggest = (description: string) => {
    const match = suggestions.find((s) => s.description.toLowerCase() === description.trim().toLowerCase());
    if (!match) return;
    if (!touched.category && options.some((c) => c.id === match.categoryId)) setCategoryId(String(match.categoryId));
    if (!touched.account && match.account) setAccount(match.account);
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="categoryId" value={categoryId} />
      {entry && <input type="hidden" name="id" value={entry.id} />}
      {recurring && (
        <>
          <input type="hidden" name="recurringId" value={recurring.id} />
          <input type="hidden" name="recurringOn" value={recurring.on} />
        </>
      )}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("amount")} label="Amount" error={error("amount") ?? error("currency")} wide>
          <ButtonGroup className="w-full">
            <Select name="currency" defaultValue={entry?.currency ?? defaults.currency ?? "PHP"}>
              <SelectTrigger aria-label="Currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id={id("amount")}
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              autoFocus={autoFocus}
              defaultValue={entry?.amount ?? defaults.amount}
              aria-invalid={Boolean(error("amount"))}
            />
          </ButtonGroup>
        </FormField>

        <Field data-invalid={error("categoryId") ? true : undefined} className="sm:col-span-2">
          <FieldLabel id={id("category")}>Category</FieldLabel>
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {expense ? "expense" : "income"} categories yet — add one in Settings.</p>
          ) : (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={2}
              value={categoryId}
              onValueChange={(value) => {
                if (!value) return;
                setCategoryId(value);
                setTouched((t) => ({ ...t, category: true }));
              }}
              aria-labelledby={id("category")}
              aria-invalid={Boolean(error("categoryId"))}
              className="flex-wrap"
            >
              {options.map((c) => (
                <ToggleGroupItem key={c.id} value={String(c.id)}>
                  <Swatch color={c.color} />
                  {c.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {error("categoryId") && <FieldError>{error("categoryId")}</FieldError>}
        </Field>

        <FormField
          id={id("description")}
          label="Description"
          error={error("description")}
          description={entry ? undefined : "Optional — blank uses the category name"}
          wide
        >
          <Input
            id={id("description")}
            name="description"
            list={suggestions.length > 0 ? id("suggestions") : undefined}
            maxLength={200}
            autoComplete="off"
            placeholder={expense ? "Groceries at SM" : "September salary"}
            defaultValue={entry?.description ?? defaults.description}
            onChange={(e) => suggest(e.target.value)}
            aria-invalid={Boolean(error("description"))}
          />
          {suggestions.length > 0 && (
            <datalist id={id("suggestions")}>
              {suggestions.map((s) => (
                <option key={s.description} value={s.description} />
              ))}
            </datalist>
          )}
        </FormField>

        <FormField id={id("date")} label="Date" error={error("occurredOn")}>
          <div className="flex flex-col gap-2">
            <DatePicker
              id={id("date")}
              name="occurredOn"
              value={date}
              onValueChange={setDate}
              today={today}
              aria-invalid={Boolean(error("occurredOn"))}
            />
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={date === today ? "today" : date === yesterday ? "yesterday" : ""}
              onValueChange={(value) => value && setDate(value === "today" ? today : yesterday)}
              aria-label="Quick date"
            >
              <ToggleGroupItem value="today">Today</ToggleGroupItem>
              <ToggleGroupItem value="yesterday">Yesterday</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </FormField>

        <FormField id={id("account")} label={expense ? "Paid with" : "Received in"} error={error("account")}>
          <Input
            id={id("account")}
            name="account"
            list={id("accounts")}
            maxLength={60}
            placeholder="GCash"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setTouched((t) => ({ ...t, account: true }));
            }}
          />
          <datalist id={id("accounts")}>
            {accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </FormField>

        <FormField id={id("notes")} label="Notes" error={error("notes")} wide>
          <Input
            id={id("notes")}
            name="notes"
            maxLength={500}
            placeholder="Optional"
            defaultValue={(entry ? entry.notes : defaults.notes) ?? undefined}
          />
        </FormField>
        {footer}
      </FieldGroup>
    </form>
  );
}
