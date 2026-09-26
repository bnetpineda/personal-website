"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { Category } from "@/lib/db/schema";
import type { FormState } from "@/lib/finance/schemas";
import { importMariBankStatements, importWiseStatements, saveCategoryRule, setRuleEnabled } from "../_actions/imports";
import { FormField, FormFooter, FormSheet, notify, useFormAction } from "./form";
import { Money } from "./ui";

export function NativeAmount({ value, currency, crypto = false }: { value: number; currency: string; crypto?: boolean }) {
  return crypto ? <span className="tabular-nums group-data-[private=true]/shell:blur-sm">{value !== 0 && Math.abs(value) < 1e-12 ? value.toExponential(6) : value.toLocaleString("en-US", { maximumFractionDigits: 12 })} {currency}</span>
    : <Money value={value} currency={currency} signed />;
}

/** Opens the file picker straight away. Picking or dropping several statements imports them all. */
function ImportStatementsButton({ label, accept, pattern, empty, action }: {
  label: string; accept: string; pattern: RegExp; empty: string; action: (data: FormData) => Promise<FormState>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(0);
  const upload = (picked: File[]) => {
    const files = picked.filter((file) => pattern.test(file.name));
    if (!files.length) { notify({ ok: false, message: empty }); return; }
    const data = new FormData();
    for (const file of files) data.append("file", file);
    setCount(files.length);
    startTransition(async () => {
      try { notify(await action(data)); }
      catch { notify({ ok: false, message: "Import could not finish. Retry safely; entries already imported are skipped." }); }
      if (input.current) input.current.value = "";
    });
  };
  return <>
    <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => upload([...(e.target.files ?? [])])} />
    <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!pending) upload([...e.dataTransfer.files]); }}>
      {pending ? <><Spinner />Importing {count} {count === 1 ? "file" : "files"}…</> : <><FileUp />{label}</>}
    </Button>
  </>;
}

export function ImportWiseButton() {
  return <ImportStatementsButton label="Import Wise CSVs" accept=".csv,text/csv" pattern={/\.csv$/i} empty="Choose Wise statement CSV files." action={importWiseStatements} />;
}

export function ImportMariBankButton() {
  return <ImportStatementsButton label="Import MariBank PDFs" accept=".pdf,application/pdf" pattern={/\.pdf$/i} empty="Choose MariBank statement PDF files." action={importMariBankStatements} />;
}

export function ImportAction({ action, children }: { action: () => Promise<FormState>; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => {
    try { notify(await action()); } catch { notify({ ok: false, message: "Couldn't save that change. Try again." }); }
  })}>{pending && <Spinner />}{children}</Button>;
}
export function RuleToggle({ id, enabled }: { id: string; enabled: boolean }) { return <ImportAction action={() => setRuleEnabled(id, !enabled)}>{enabled ? "Pause" : "Resume"}</ImportAction>; }

export function AddRuleButton({ categories }: { categories: Category[] }) {
  return <FormSheet trigger={<Button variant="outline" size="sm"><Plus />Category rule</Button>} title="Add category rule"
    description="Matching income and expenses post straight to this category before AI sees them. The most specific text wins."><RuleForm categories={categories} /></FormSheet>;
}
function RuleForm({ categories }: { categories: Category[] }) {
  const { state, pending, onSubmit, formKey } = useFormAction(saveCategoryRule);
  const [kind, setKind] = useState("expense");
  return <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-6"><FieldGroup>
    <FormField id="rule-text" label="Description contains"><Input id="rule-text" name="contains" placeholder="e.g. Spotify" minLength={2} maxLength={120} required /></FormField>
    <FormField id="rule-provider" label="Provider"><Select name="provider" defaultValue="any"><SelectTrigger id="rule-provider"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="any">Any provider</SelectItem><SelectItem value="wise">Wise</SelectItem><SelectItem value="maribank">MariBank</SelectItem><SelectItem value="ibkr">IBKR</SelectItem>
    </SelectContent></Select></FormField>
    <FormField id="rule-kind" label="Entry type"><Select name="kind" value={kind} onValueChange={setKind}><SelectTrigger id="rule-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></FormField>
    <FormField id="rule-category" label="Category"><Select key={kind} name="categoryId" required><SelectTrigger id="rule-category"><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent>
      {categories.filter((c) => !c.archived && c.kind === kind).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
    </SelectContent></Select></FormField>
  </FieldGroup><p className="text-sm text-muted-foreground">Rules skip transfers, trades, unknown entry types and crypto amounts. Pause an old rule before replacing it.</p><FormFooter state={state} pending={pending}>Save rule</FormFooter></form>;
}
