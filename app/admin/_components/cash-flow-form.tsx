"use client";

import { useId } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES, type CashFlowKind } from "@/lib/finance/constants";
import { todayManila } from "@/lib/finance/dates";
import { saveCashFlow } from "../_actions/cash-flows";
import { FormField, FormFooter, useFormAction } from "./form";

export interface CashFlowFormProps {
  kind: CashFlowKind;
  categories: { id: number; name: string; archived: boolean }[];
  accounts: string[];
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
}

export function CashFlowForm({ kind, categories, accounts, defaults, entry, recurring }: CashFlowFormProps) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveCashFlow);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const expense = kind === "expense";
  const options = categories.filter((c) => !c.archived || c.id === entry?.categoryId);
  const categoryDefault = entry?.categoryId ?? defaults.categoryId;

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      <input type="hidden" name="kind" value={kind} />
      {entry && <input type="hidden" name="id" value={entry.id} />}
      {recurring && (
        <>
          <input type="hidden" name="recurringId" value={recurring.id} />
          <input type="hidden" name="recurringOn" value={recurring.on} />
        </>
      )}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("amount")} label="Amount" error={error("amount")}>
          <Input
            id={id("amount")}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            defaultValue={entry?.amount ?? defaults.amount}
            aria-invalid={Boolean(error("amount"))}
          />
        </FormField>
        <FormField id={id("currency")} label="Currency" error={error("currency")}>
          <Select name="currency" defaultValue={entry?.currency ?? defaults.currency ?? "PHP"}>
            <SelectTrigger id={id("currency")} className="w-full">
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
        </FormField>
        <FormField id={id("date")} label="Date" error={error("occurredOn")}>
          <DatePicker
            id={id("date")}
            name="occurredOn"
            defaultValue={entry?.occurredOn ?? defaults.occurredOn}
            today={todayManila()}
            aria-invalid={Boolean(error("occurredOn"))}
          />
        </FormField>
        <FormField id={id("category")} label="Category" error={error("categoryId")}>
          <Select name="categoryId" defaultValue={categoryDefault ? String(categoryDefault) : undefined}>
            <SelectTrigger id={id("category")} className="w-full" aria-invalid={Boolean(error("categoryId"))}>
              <SelectValue placeholder="Pick one…" />
            </SelectTrigger>
            <SelectContent>
              {options.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id={id("description")} label="Description" error={error("description")} wide>
          <Input
            id={id("description")}
            name="description"
            maxLength={200}
            placeholder={expense ? "Groceries at SM" : "September salary"}
            defaultValue={entry?.description ?? defaults.description}
            aria-invalid={Boolean(error("description"))}
          />
        </FormField>
        <FormField id={id("account")} label={expense ? "Paid with" : "Received in"} error={error("account")}>
          <Input
            id={id("account")}
            name="account"
            list={id("accounts")}
            maxLength={60}
            placeholder="GCash"
            defaultValue={(entry ? entry.account : defaults.account) ?? undefined}
          />
          <datalist id={id("accounts")}>
            {accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </FormField>
        <FormField id={id("notes")} label="Notes" error={error("notes")}>
          <Input id={id("notes")} name="notes" maxLength={500} placeholder="Optional" defaultValue={(entry ? entry.notes : defaults.notes) ?? undefined} />
        </FormField>
        <FormFooter state={state} pending={pending}>
          {entry ? "Save" : recurring ? "Post" : expense ? "Add expense" : "Add income"}
        </FormFooter>
      </FieldGroup>
    </form>
  );
}
