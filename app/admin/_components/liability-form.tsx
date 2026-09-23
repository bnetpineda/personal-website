"use client";

import { useId, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Swatch } from "@/components/ui/swatch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CURRENCIES, LIABILITY_KIND_LABELS, LIABILITY_KINDS, type LiabilityKind } from "@/lib/finance/constants";
import { todayManila } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/format";
import { payLiability, saveLiability, undoPayment } from "../_actions/liabilities";
import type { FormCategory } from "./cash-flow-form";
import { FormField, FormFooter, useFormAction } from "./form";

export interface LiabilityDTO {
  id: string;
  kind: LiabilityKind;
  name: string;
  lender: string | null;
  balance: number;
  currency: string;
  creditLimit: number | null;
  interestRate: number | null;
  dueDay: number | null;
  minPayment: number | null;
  notes: string | null;
}

export function LiabilityForm({ liability }: { liability?: LiabilityDTO }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveLiability);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      {liability && <input type="hidden" name="id" value={liability.id} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("kind")} label="Type" error={error("kind")}>
          <Select name="kind" defaultValue={liability?.kind ?? "credit_card"}>
            <SelectTrigger id={id("kind")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIABILITY_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {LIABILITY_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id={id("currency")} label="Currency" error={error("currency")}>
          <Select name="currency" defaultValue={liability?.currency ?? "PHP"}>
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
        <FormField id={id("name")} label="Name" error={error("name")}>
          <Input id={id("name")} name="name" maxLength={120} placeholder="BPI Amore card" defaultValue={liability?.name} aria-invalid={Boolean(error("name"))} />
        </FormField>
        <FormField id={id("lender")} label="Lender" error={error("lender")} description="Optional">
          <Input id={id("lender")} name="lender" maxLength={80} placeholder="BPI" defaultValue={liability?.lender ?? undefined} />
        </FormField>
        <FormField id={id("balance")} label="Balance owed" error={error("balance")}>
          <Input id={id("balance")} name="balance" inputMode="decimal" defaultValue={liability?.balance} aria-invalid={Boolean(error("balance"))} />
        </FormField>
        <FormField id={id("limit")} label="Credit limit" error={error("creditLimit")} description="Cards: shows utilization">
          <Input id={id("limit")} name="creditLimit" inputMode="decimal" defaultValue={liability?.creditLimit ?? undefined} />
        </FormField>
        <FormField id={id("rate")} label="Interest rate (%)" error={error("interestRate")} description="As quoted (monthly or yearly)">
          <Input id={id("rate")} name="interestRate" inputMode="decimal" defaultValue={liability?.interestRate ?? undefined} />
        </FormField>
        <FormField id={id("due")} label="Due day" error={error("dueDay")} description="Day of the month, 1–31">
          <Input id={id("due")} name="dueDay" inputMode="numeric" defaultValue={liability?.dueDay ?? undefined} aria-invalid={Boolean(error("dueDay"))} />
        </FormField>
        <FormField id={id("min")} label="Minimum payment" error={error("minPayment")}>
          <Input id={id("min")} name="minPayment" inputMode="decimal" defaultValue={liability?.minPayment ?? undefined} />
        </FormField>
        <FormField id={id("notes")} label="Notes" error={error("notes")}>
          <Input id={id("notes")} name="notes" maxLength={500} defaultValue={liability?.notes ?? undefined} />
        </FormField>
        <FormFooter state={state} pending={pending}>
          {liability ? "Save" : "Add debt"}
        </FormFooter>
      </FieldGroup>
    </form>
  );
}

export interface PaymentDebt {
  id: string;
  name: string;
  kind: LiabilityKind;
  currency: string;
  balance: number;
  minPayment: number | null;
}

/**
 * "Pay": lowers the balance and can log the payment as an expense. Off by default for
 * credit cards — purchases made with the card are usually logged already, so the bill
 * payment would count them twice.
 */
export function PaymentForm({
  debt,
  categories,
  accounts,
  defaults,
}: {
  debt: PaymentDebt;
  categories: FormCategory[];
  accounts: string[];
  defaults: { categoryId?: number | null; account?: string | null };
}) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(payLiability, {
    undo: (s) => (s.undo ? () => undoPayment(s.undo!) : undefined),
  });
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const today = todayManila();
  const options = categories.filter((c) => !c.archived);
  const guess = options.find((c) => /debt|loan|card|bill/i.test(c.name));
  const [logExpense, setLogExpense] = useState(debt.kind !== "credit_card");
  const [categoryId, setCategoryId] = useState(String(defaults.categoryId ?? guess?.id ?? ""));

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      <input type="hidden" name="id" value={debt.id} />
      <input type="hidden" name="logExpense" value={logExpense ? "on" : ""} />
      {logExpense && <input type="hidden" name="categoryId" value={categoryId} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={id("amount")}
          label={`Amount paid (${debt.currency})`}
          error={error("amount")}
          description={`Owed now: ${formatMoney(debt.balance, debt.currency)}`}
        >
          <Input
            id={id("amount")}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            defaultValue={debt.minPayment ?? undefined}
            aria-invalid={Boolean(error("amount"))}
          />
        </FormField>
        <FormField id={id("date")} label="Paid on" error={error("occurredOn")}>
          <DatePicker id={id("date")} name="occurredOn" defaultValue={today} today={today} aria-invalid={Boolean(error("occurredOn"))} />
        </FormField>

        <Field orientation="horizontal" className="sm:col-span-2">
          <Checkbox id={id("log")} checked={logExpense} onCheckedChange={(checked) => setLogExpense(checked === true)} />
          <FieldContent>
            <FieldLabel htmlFor={id("log")}>Also log it as an expense</FieldLabel>
            <FieldDescription>
              {debt.kind === "credit_card"
                ? "Leave off if you already log what you buy with this card — it would count twice."
                : "Adds the payment to Transactions, linked to this debt."}
            </FieldDescription>
          </FieldContent>
        </Field>

        {logExpense && (
          <>
            <Field data-invalid={error("categoryId") ? true : undefined} className="sm:col-span-2">
              <FieldLabel id={id("category")}>Category</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                spacing={2}
                value={categoryId}
                onValueChange={(value) => value && setCategoryId(value)}
                aria-labelledby={id("category")}
                className="flex-wrap"
              >
                {options.map((c) => (
                  <ToggleGroupItem key={c.id} value={String(c.id)}>
                    <Swatch color={c.color} />
                    {c.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {error("categoryId") && <FieldError>{error("categoryId")}</FieldError>}
            </Field>
            <FormField id={id("account")} label="Paid from" error={error("account")} wide>
              <Input id={id("account")} name="account" list={id("accounts")} maxLength={60} placeholder="BPI Savings" defaultValue={defaults.account ?? undefined} />
              <datalist id={id("accounts")}>
                {accounts.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </FormField>
          </>
        )}

        <FormFooter state={state} pending={pending}>
          Record payment
        </FormFooter>
      </FieldGroup>
    </form>
  );
}
