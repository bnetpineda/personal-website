"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { FileUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { Category } from "@/lib/db/schema";
import type { FormState } from "@/lib/finance/schemas";
import { importGoTymeStatements, importMariBankStatements, importWiseStatements, saveCategoryRule, setRuleEnabled } from "../_actions/imports";
import { FormField, FormFooter, FormSheet, notify, useFormAction } from "./form";
import { Money, PrivateFigure } from "./ui";

export function NativeAmount({ value, currency, crypto = false }: { value: number; currency: string; crypto?: boolean }) {
  return crypto ? <PrivateFigure>{`${value !== 0 && Math.abs(value) < 1e-8 ? value.toExponential(2) : value.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${currency}`}</PrivateFigure>
    : <Money value={value} currency={currency} />;
}

/**
 * Opens the file picker straight away. Picking or dropping several statements imports them all.
 * A locked PDF asks for its password, then sends the same files again. The password stays in this
 * page's memory so the next upload doesn't ask again; it is never saved.
 */
function ImportStatementsButton({ label, accept, pattern, empty, action, bank, size = "sm" }: {
  label: string; accept: string; pattern: RegExp; empty: string; action: (data: FormData) => Promise<FormState>;
  /** Names the bank in the password prompt. */
  bank?: string;
  /** "xs" next to an alert on the dashboard. */
  size?: "sm" | "xs";
}) {
  const input = useRef<HTMLInputElement>(null);
  const password = useRef<string>(undefined);
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(0);
  const [locked, setLocked] = useState<{ files: File[]; error?: string } | null>(null);
  const fieldId = useId();
  const send = (files: File[], secret = password.current) => {
    const data = new FormData();
    for (const file of files) data.append("file", file);
    if (secret) data.append("password", secret);
    setCount(files.length);
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result.needsPassword) {
          password.current = undefined;
          setLocked({ files, error: secret ? result.message : undefined });
        } else {
          if (result.ok) password.current = secret;
          setLocked(null);
          notify(result);
        }
      } catch { notify({ ok: false, message: "Import could not finish. Retry safely; entries already imported are skipped." }); }
      if (input.current) input.current.value = "";
    });
  };
  const upload = (picked: File[]) => {
    const files = picked.filter((file) => pattern.test(file.name));
    if (!files.length) { notify({ ok: false, message: empty }); return; }
    send(files);
  };
  const unlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const secret = new FormData(event.currentTarget).get("password");
    if (locked && typeof secret === "string" && secret) send(locked.files, secret);
  };
  return <>
    <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => upload([...(e.target.files ?? [])])} />
    <Button variant="outline" size={size} disabled={pending} onClick={() => input.current?.click()}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!pending) upload([...e.dataTransfer.files]); }}>
      {pending ? <><Spinner />Importing {count} {count === 1 ? "file" : "files"}…</> : <><FileUp />{label}</>}
    </Button>
    <Dialog open={locked != null} onOpenChange={(open) => { if (!open && !pending) setLocked(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Statement password</DialogTitle>
          <DialogDescription>
            {bank ?? "The bank"} locks {locked && locked.files.length > 1 ? "these PDFs" : "this PDF"}. The password only opens {locked && locked.files.length > 1 ? "them" : "it"} for this import and is never saved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={unlock} className="flex flex-col gap-4">
          <FormField id={fieldId} label="Password" error={locked?.error}>
            <Input id={fieldId} name="password" type="password" autoComplete="off" required maxLength={128} autoFocus aria-invalid={Boolean(locked?.error)} />
          </FormField>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Cancel</Button></DialogClose>
            <Button type="submit" disabled={pending}>{pending && <Spinner />}Import</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}

export function ImportWiseButton({ size }: { size?: "sm" | "xs" }) {
  return <ImportStatementsButton size={size} label="Import CSVs" accept=".csv,text/csv" pattern={/\.csv$/i} empty="Choose Wise statement CSV files." action={importWiseStatements} />;
}

export function ImportMariBankButton({ size }: { size?: "sm" | "xs" }) {
  return <ImportStatementsButton size={size} label="Import PDFs" accept=".pdf,application/pdf" pattern={/\.pdf$/i} empty="Choose MariBank statement PDF files." bank="MariBank" action={importMariBankStatements} />;
}

export function ImportGoTymeButton({ size }: { size?: "sm" | "xs" }) {
  return <ImportStatementsButton size={size} label="Import PDFs" accept=".pdf,application/pdf" pattern={/\.pdf$/i} empty="Choose GoTyme statement PDF files." bank="GoTyme" action={importGoTymeStatements} />;
}

export function ImportAction({ action, label, children }: { action: () => Promise<FormState>; label?: string; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" size="sm" disabled={pending} aria-label={label} onClick={() => startTransition(async () => {
    try { notify(await action()); } catch { notify({ ok: false, message: "Couldn't save that change. Try again." }); }
  })}>{pending && <Spinner />}{children}</Button>;
}
/** Named after its rule, so a list of them doesn't read as a column of identical "Pause" buttons. */
export function RuleToggle({ id, enabled, name }: { id: string; enabled: boolean; name: string }) {
  return <ImportAction label={`${enabled ? "Pause" : "Resume"} rule “${name}”`} action={() => setRuleEnabled(id, !enabled)}>{enabled ? "Pause" : "Resume"}</ImportAction>;
}

export function AddRuleButton({ categories }: { categories: Category[] }) {
  return <FormSheet trigger={<Button variant="outline" size="sm"><Plus />Category rule</Button>} title="Add category rule"
    description="Matching income and expenses post straight to this category before AI sees them. The most specific text wins."><RuleForm categories={categories} /></FormSheet>;
}
function RuleForm({ categories }: { categories: Category[] }) {
  const { state, pending, onSubmit, formKey } = useFormAction(saveCategoryRule);
  const [kind, setKind] = useState("expense");
  return <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-6"><FieldGroup>
    <FormField id="rule-text" label="Description contains"><Input id="rule-text" name="contains" placeholder="e.g. Spotify" minLength={2} maxLength={120} required /></FormField>
    <FormField id="rule-provider" label="Account"><Select name="provider" defaultValue="any"><SelectTrigger id="rule-provider"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="any">Any account</SelectItem><SelectItem value="wise">Wise</SelectItem><SelectItem value="maribank">MariBank</SelectItem><SelectItem value="gotyme">GoTyme</SelectItem><SelectItem value="ibkr">IBKR</SelectItem>
    </SelectContent></Select></FormField>
    <FormField id="rule-kind" label="Entry type"><Select name="kind" value={kind} onValueChange={setKind}><SelectTrigger id="rule-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></FormField>
    <FormField id="rule-category" label="Category"><Select key={kind} name="categoryId" required><SelectTrigger id="rule-category"><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent>
      {categories.filter((c) => !c.archived && c.kind === kind).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
    </SelectContent></Select></FormField>
  </FieldGroup><p className="text-sm text-muted-foreground">Rules skip transfers, trades, unknown entry types and crypto amounts. Pause an old rule before replacing it.</p><FormFooter state={state} pending={pending}>Save rule</FormFooter></form>;
}
