"use client";

import { useId, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CURRENCIES,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
  type CashFlowKind,
  type RecurrenceFrequency,
} from "@/lib/finance/constants";
import { todayManila } from "@/lib/finance/dates";
import { saveRecurring } from "../_actions/recurring";
import { FormField, FormFooter, useFormAction } from "./form";

export interface RecurringDTO {
  id: string;
  amount: number;
  currency: string;
  categoryId: number;
  description: string;
  account: string | null;
  notes: string | null;
  frequency: RecurrenceFrequency;
  startOn: string;
  secondDay: number | null;
  endOn: string | null;
  autoPost: boolean;
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function RecurringForm({
  kind,
  categories,
  accounts,
  item,
}: {
  kind: CashFlowKind;
  categories: { id: number; name: string; archived: boolean }[];
  accounts: string[];
  item?: RecurringDTO;
}) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveRecurring);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(item?.frequency ?? "monthly");
  const [ends, setEnds] = useState(item?.endOn ? "on" : "never");
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const expense = kind === "expense";
  const today = todayManila();
  const options = categories.filter((c) => !c.archived || c.id === item?.categoryId);

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      <input type="hidden" name="kind" value={kind} />
      {item && <input type="hidden" name="id" value={item.id} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("description")} label="Description" error={error("description")} wide>
          <Input
            id={id("description")}
            name="description"
            maxLength={200}
            placeholder={expense ? "Netflix, rent, Meralco…" : "Salary"}
            defaultValue={item?.description}
            aria-invalid={Boolean(error("description"))}
          />
        </FormField>
        <FormField id={id("amount")} label="Amount" error={error("amount")} description={expense ? "Estimate it for bills that vary." : undefined}>
          <Input
            id={id("amount")}
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            defaultValue={item?.amount}
            aria-invalid={Boolean(error("amount"))}
          />
        </FormField>
        <FormField id={id("currency")} label="Currency" error={error("currency")}>
          <Select name="currency" defaultValue={item?.currency ?? "PHP"}>
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
        <FormField id={id("frequency")} label="Repeats" error={error("frequency")}>
          <Select name="frequency" value={frequency} onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}>
            <SelectTrigger id={id("frequency")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCE_FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {RECURRENCE_FREQUENCY_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          id={id("start")}
          label={item ? "Starts" : "First date"}
          error={error("startOn")}
          description={item ? "Changes apply to upcoming entries." : "Pick a past date to fill in entries since then."}
        >
          <DatePicker id={id("start")} name="startOn" defaultValue={item?.startOn ?? today} today={today} aria-invalid={Boolean(error("startOn"))} />
        </FormField>
        {frequency === "semimonthly" && (
          <FormField id={id("second")} label="Second day" error={error("secondDay")} description="The other day each month, e.g. 15th & 30th.">
            <Select name="secondDay" defaultValue={item?.secondDay ? String(item.secondDay) : "auto"}>
              <SelectTrigger id={id("second")} className="w-full" aria-invalid={Boolean(error("secondDay"))}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">15 days after</SelectItem>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d === 31 ? "Last day" : d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        <FormField id={id("category")} label="Category" error={error("categoryId")}>
          <Select name="categoryId" defaultValue={item ? String(item.categoryId) : undefined}>
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
        <FormField id={id("account")} label={expense ? "Paid with" : "Received in"} error={error("account")}>
          <Input id={id("account")} name="account" list={id("accounts")} maxLength={60} placeholder="GCash" defaultValue={item?.account ?? undefined} />
          <datalist id={id("accounts")}>
            {accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </FormField>
        <FormField id={id("posting")} label="When it's due" error={error("posting")}>
          <Select name="posting" defaultValue={item && !item.autoPost ? "confirm" : "auto"}>
            <SelectTrigger id={id("posting")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Add it automatically</SelectItem>
              <SelectItem value="confirm">Ask me to confirm</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField id={id("ends")} label="Ends">
          <Select value={ends} onValueChange={setEnds}>
            <SelectTrigger id={id("ends")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">Never</SelectItem>
              <SelectItem value="on">On a date</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        {ends === "on" && (
          <FormField id={id("end")} label="Last date" error={error("endOn")}>
            <DatePicker id={id("end")} name="endOn" defaultValue={item?.endOn ?? undefined} today={today} aria-invalid={Boolean(error("endOn"))} />
          </FormField>
        )}
        <FormField id={id("notes")} label="Notes" error={error("notes")} wide>
          <Input id={id("notes")} name="notes" maxLength={500} placeholder="Optional" defaultValue={item?.notes ?? undefined} />
        </FormField>
        <FormFooter state={state} pending={pending}>
          {item ? "Save" : expense ? "Add recurring expense" : "Add recurring income"}
        </FormFooter>
      </FieldGroup>
    </form>
  );
}
