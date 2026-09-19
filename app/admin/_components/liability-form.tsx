"use client";

import { useId } from "react";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES, LIABILITY_KIND_LABELS, LIABILITY_KINDS, type LiabilityKind } from "@/lib/finance/constants";
import { saveLiability } from "../_actions/liabilities";
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
