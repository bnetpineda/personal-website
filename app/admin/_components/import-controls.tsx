"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { FileUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { Category } from "@/lib/db/schema";
import type { FormState } from "@/lib/finance/form-state";
import { importStatements, setRuleEnabled } from "../_actions/imports";
import { saveRule } from "../_actions/rules";
import { FormField, FormFooter, FormSheet, notify, useFormAction } from "./form";
import { entryKindLabel } from "./labels";
import { Money, PrivateFigure } from "./ui";

export function NativeAmount({ value, currency, crypto = false }: { value: number; currency: string; crypto?: boolean }) {
  return crypto ? <PrivateFigure>{`${value !== 0 && Math.abs(value) < 1e-8 ? value.toExponential(2) : value.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${currency}`}</PrivateFigure>
    : <Money value={value} currency={currency} />;
}

/** Passwords typed this page visit, so the next upload doesn't ask again. Never saved or sent anywhere but the import. */
const typedPasswords: string[] = [];

/**
 * Sends statements from any bank to the one import (the server tells the banks apart). A locked PDF
 * asks for its password, then sends the same files again with every password typed so far: one
 * upload can mix banks that each use their own.
 */
function useStatementImport() {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState(0);
  const [locked, setLocked] = useState<{ files: File[]; error?: string } | null>(null);
  const send = (files: File[], extra?: string) => {
    if (!files.length) return;
    const passwords = extra ? [...typedPasswords, extra] : [...typedPasswords];
    const data = new FormData();
    for (const file of files) data.append("file", file);
    for (const password of passwords) data.append("password", password);
    setCount(files.length);
    startTransition(async () => {
      try {
        const result = await importStatements(data);
        if (result.needsPassword) setLocked({ files, error: extra ? result.message : undefined });
        else {
          if (result.ok && extra && !typedPasswords.includes(extra)) typedPasswords.push(extra);
          setLocked(null);
          notify(result);
        }
      } catch { notify({ ok: false, message: "Import could not finish. Retry safely; entries already imported are skipped." }); }
    });
  };
  const unlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const secret = new FormData(event.currentTarget).get("password");
    if (locked && typeof secret === "string" && secret) send(locked.files, secret);
  };
  const dialog = <PasswordDialog locked={locked} pending={pending} onClose={() => setLocked(null)} onSubmit={unlock} />;
  return { pending, count, send, dialog };
}

function PasswordDialog({ locked, pending, onClose, onSubmit }: {
  locked: { files: File[]; error?: string } | null; pending: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fieldId = useId();
  const several = Boolean(locked && locked.files.length > 1);
  return (
    <Dialog open={locked != null} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Statement password</DialogTitle>
          <DialogDescription>
            The bank locks {several ? "one of these PDFs" : "this PDF"}. The password only opens it for this import and is never saved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
  );
}

const STATEMENT_FILES = ".csv,.pdf,text/csv,application/pdf";

/**
 * Opens the file picker straight away. Any mix of Wise CSVs and MariBank or GoTyme PDFs works, picked
 * or dropped on the button; `accept` only narrows what the picker shows first.
 */
export function ImportStatementsButton({ label = "Import statements", accept = STATEMENT_FILES, size = "sm" }: {
  label?: string; accept?: string;
  /** "xs" next to an alert on the dashboard. */
  size?: "sm" | "xs";
}) {
  const input = useRef<HTMLInputElement>(null);
  const { pending, count, send, dialog } = useStatementImport();
  const pick = (files: File[]) => { send(files); if (input.current) input.current.value = ""; };
  return <>
    <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => pick([...(e.target.files ?? [])])} />
    <Button variant="outline" size={size} disabled={pending} onClick={() => input.current?.click()}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (!pending) pick([...e.dataTransfer.files]); }}>
      {pending ? <><Spinner />Importing {count} {count === 1 ? "file" : "files"}…</> : <><FileUp />{label}</>}
    </Button>
    {dialog}
  </>;
}

export function ImportWiseButton({ size }: { size?: "sm" | "xs" }) {
  return <ImportStatementsButton size={size} label="Import CSVs" accept=".csv,text/csv" />;
}

export function ImportMariBankButton({ size }: { size?: "sm" | "xs" }) {
  return <ImportStatementsButton size={size} label="Import PDFs" accept=".pdf,application/pdf" />;
}

export function ImportGoTymeButton({ size }: { size?: "sm" | "xs" }) {
  return <ImportStatementsButton size={size} label="Import PDFs" accept=".pdf,application/pdf" />;
}

/**
 * Drop statements anywhere on the page to import them. Only a drag that carries files shows the
 * overlay, so dragging text or a link around the page is left alone.
 */
export function StatementDropZone() {
  const { pending, count, send, dialog } = useStatementImport();
  const [over, setOver] = useState(false);
  const latest = useRef(send);
  useEffect(() => { latest.current = send; });
  useEffect(() => {
    let depth = 0;
    const carriesFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes("Files"));
    const enter = (e: DragEvent) => { if (!carriesFiles(e)) return; depth++; setOver(true); };
    const leave = (e: DragEvent) => { if (!carriesFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setOver(false); };
    const overPage = (e: DragEvent) => { if (carriesFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      latest.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overPage);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overPage);
      window.removeEventListener("drop", drop);
    };
  }, []);
  return <>
    {(over || pending) && (
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6" role="status" aria-live="polite">
        <Card>
          <CardContent>
            <Empty size="sm">
              <EmptyHeader>
                <EmptyMedia variant="icon">{pending ? <Spinner /> : <FileUp />}</EmptyMedia>
                <EmptyTitle>{pending ? `Importing ${count} ${count === 1 ? "file" : "files"}…` : "Drop statements to import"}</EmptyTitle>
                <EmptyDescription>Wise CSVs and MariBank or GoTyme PDFs, any mix. Each file is checked against its own totals.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>
    )}
    {dialog}
  </>;
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
export interface RuleDTO {
  id: string;
  contains: string;
  provider: string | null;
  kind: "income" | "expense";
  categoryId: number;
}

/** Adds a rule, or edits `rule`. Validation errors show beside each field, like every other admin form. */
export function RuleForm({ categories, rule }: { categories: Category[]; rule?: RuleDTO }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveRule);
  const [kind, setKind] = useState<string>(state.values?.kind ?? rule?.kind ?? "expense");
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const value = (name: string, fallback?: string) => state.values?.[name] ?? fallback;
  return <form key={formKey} onSubmit={onSubmit} noValidate className="flex flex-col gap-6"><FieldGroup>
    {rule && <input type="hidden" name="id" value={rule.id} />}
    <FormField id={id("text")} label="Description contains" error={error("contains")}>
      <Input id={id("text")} name="contains" placeholder="e.g. Spotify" maxLength={120} defaultValue={value("contains", rule?.contains)} aria-invalid={Boolean(error("contains"))} />
    </FormField>
    <FormField id={id("provider")} label="Account" error={error("provider")}><Select name="provider" defaultValue={value("provider", rule?.provider ?? "any")}><SelectTrigger id={id("provider")} aria-invalid={Boolean(error("provider"))}><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="any">Any account</SelectItem><SelectItem value="wise">Wise</SelectItem><SelectItem value="maribank">MariBank</SelectItem><SelectItem value="gotyme">GoTyme</SelectItem><SelectItem value="ibkr">IBKR</SelectItem>
    </SelectContent></Select></FormField>
    <FormField id={id("kind")} label="Entry type" error={error("kind")}><Select name="kind" value={kind} onValueChange={setKind}><SelectTrigger id={id("kind")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">{entryKindLabel("expense")}</SelectItem><SelectItem value="income">{entryKindLabel("income")}</SelectItem></SelectContent></Select></FormField>
    <FormField id={id("category")} label="Category" error={error("categoryId")}><Select key={kind} name="categoryId" defaultValue={kind === (rule?.kind ?? "expense") ? value("categoryId", rule ? String(rule.categoryId) : undefined) : undefined}><SelectTrigger id={id("category")} aria-invalid={Boolean(error("categoryId"))}><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent>
      {categories.filter((c) => (!c.archived || c.id === rule?.categoryId) && c.kind === kind).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
    </SelectContent></Select></FormField>
  </FieldGroup><p className="text-sm text-muted-foreground">Rules skip transfers, trades, unknown entry types and crypto amounts. Matching entries post to the category straight away.</p><FormFooter state={state} pending={pending}>Save rule</FormFooter></form>;
}
