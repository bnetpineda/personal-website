"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Plus, Sparkles, WandSparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Category, ImportedEntry } from "@/lib/db/schema";
import { PROVIDER_META } from "@/lib/finance/connections/types";
import { canPost, transferEligible } from "@/lib/finance/imports/review";
import type { FormState } from "@/lib/finance/schemas";
import type { WiseBalancePreview } from "@/lib/finance/imports/wise-balances";
import { importWiseStatement, matchImportedTransfer, previewWiseImport, reopenImportedEntry, reviewImportedEntry,
  runAiCategorization, runCategoryRules, saveCategoryRule, setRuleEnabled, type ImportPreview } from "../_actions/imports";
import { FormField, FormFooter, FormSheet, notify, useFormAction } from "./form";
import { Money } from "./ui";

export function NativeAmount({ value, currency, crypto = false }: { value: number; currency: string; crypto?: boolean }) {
  return crypto ? <span className="tabular-nums group-data-[private=true]/shell:blur-sm">{value !== 0 && Math.abs(value) < 1e-12 ? value.toExponential(6) : value.toLocaleString("en-US", { maximumFractionDigits: 12 })} {currency}</span>
    : <Money value={value} currency={currency} signed />;
}

export function ImportWiseButton() {
  return <FormSheet trigger={<Button variant="outline"><FileUp />Import Wise CSV</Button>} title="Import Wise statement"
    description="Preview an English balance statement before adding it to your private inbox."><WiseImportForm /></FormSheet>;
}
function WiseImportForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<FormState | null>(null);
  const run = (commit: boolean) => {
    if (!ref.current?.reportValidity()) return;
    const data = new FormData(ref.current);
    startTransition(async () => {
      try {
        if (commit) {
          const saved = await importWiseStatement(data); setResult(saved); notify(saved);
          if (saved.ok) { setPreview(null); ref.current?.reset(); }
        } else { setResult(null); setPreview(await previewWiseImport(data)); }
      } catch { setResult({ ok: false, message: "Import could not finish. Retry safely; duplicate entries will be skipped." }); }
    });
  };
  return <form ref={ref} onSubmit={(e) => { e.preventDefault(); run(false); }} onChange={(e) => { if ((e.target as HTMLInputElement).name === "file") { setPreview(null); setResult(null); } }} className="flex flex-col gap-6">
    <p className="text-sm text-muted-foreground">In Wise, download a currency balance statement as CSV. Use English headings and DD-MM-YYYY, DD/MM/YYYY or ISO dates. Up to 750 KB and 2,000 rows. A Running Balance column lets you update the matching cash holding after preview.</p>
    <FieldGroup>
      <FormField id="wise-file" label="Balance statement CSV"><Input id="wise-file" name="file" type="file" accept=".csv,text/csv" required disabled={pending} /></FormField>
      <FormField id="wise-fees" label="How are fees shown?" description="Choose the format used when you downloaded the statement. Preview the split before importing.">
        <Select name="feeMode" required disabled={pending} onValueChange={() => { setPreview(null); setResult(null); }}><SelectTrigger id="wise-fees"><SelectValue placeholder="Choose statement format" /></SelectTrigger>
          <SelectContent><SelectItem value="included">Amount includes Total fees — split them out</SelectItem><SelectItem value="separate">Fees already have separate accounting rows</SelectItem></SelectContent>
        </Select>
      </FormField>
    </FieldGroup>
    {preview?.ok && <>
      {preview.balanceWarning && <Alert variant="warning"><AlertTitle>Transactions only</AlertTitle><AlertDescription>{preview.balanceWarning}</AlertDescription></Alert>}
      {Boolean(preview.balances?.length) && <div className="flex flex-col gap-4">
        <Field orientation="horizontal"><Checkbox id="wise-update-balances" name="updateBalances" defaultChecked disabled={pending} /><FieldLabel htmlFor="wise-update-balances">Apply statement closing balances to Holdings</FieldLabel></Field>
        <p className="text-sm text-muted-foreground">Balances are as of the last transaction shown, not a live Wise balance. Older statements cannot replace newer saved balances. Choose an existing cash holding to avoid counting the same money twice.</p>
        {preview.balances?.map((balance) => <WiseBalanceTarget key={`${balance.currency}:${balance.asOf}`} balance={balance} disabled={pending} />)}
      </div>}
      <Alert variant={preview.conflicts ? "destructive" : "default"}><AlertTitle>Import preview</AlertTitle><AlertDescription>
        {preview.total} entries, including fee splits · {preview.duplicates} already imported.
        {preview.conflicts ? ` ${preview.conflicts} records conflict with a previous import. Check the fee format or statement before continuing.` : " Saved category rules will apply. Other entries will wait for review."}
      </AlertDescription></Alert>
      <Table><TableHeader><TableRow><TableHead>Date / description</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
        <TableBody>{preview.entries?.map((e) => <TableRow key={e.externalId}><TableCell>{e.occurredOn}<br />{e.description}<br /><span className="text-xs text-muted-foreground">{e.kind}</span></TableCell><TableCell className="text-right"><Money value={e.amount} currency={e.currency} signed /></TableCell></TableRow>)}</TableBody>
      </Table><p className="text-xs text-muted-foreground">Showing the first 10 entries. Re-importing the same statement preserves previous reviews.</p>
      <Button type="button" disabled={pending || Boolean(preview.conflicts)} onClick={() => run(true)}>{pending && <Spinner />}Import statement</Button>
    </>}
    {(result?.message || (preview && !preview.ok && preview.message)) && <p role="status" className="text-sm">{result?.message || preview?.message}</p>}
    <Button type="submit" variant="outline" disabled={pending}>{pending && <Spinner />}Preview CSV</Button>
  </form>;
}

function WiseBalanceTarget({ balance, disabled }: { balance: WiseBalancePreview; disabled: boolean }) {
  const [selected, setSelected] = useState(balance.selected);
  const choice = balance.choices.find((c) => c.id === selected);
  return <div className="flex flex-col gap-2">
    <p className="font-mono text-sm">{balance.currency} · <Money value={balance.amount} currency={balance.currency} /> · {balance.asOf}</p>
    <input type="hidden" name={`version:${balance.currency}`} value={choice?.updatedAt ?? ""} />
    <FormField id={`wise-holding-${balance.currency}`} label={`${balance.currency} cash holding`}>
      <Select name={`holding:${balance.currency}`} value={selected} onValueChange={setSelected} disabled={disabled}>
        <SelectTrigger id={`wise-holding-${balance.currency}`}><SelectValue placeholder="Choose the existing holding" /></SelectTrigger>
        <SelectContent>{balance.choices.length ? balance.choices.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>) : <SelectItem value="new">Create Wise {balance.currency} cash holding</SelectItem>}</SelectContent>
      </Select>
    </FormField>
    {choice && <p className="text-sm text-muted-foreground">Currently <Money value={choice.amount} currency={balance.currency} />{choice.asOf ? ` · statement dated ${choice.asOf}` : ""}{choice.asOf && choice.asOf > balance.asOf ? " · Newer balance will be kept." : ""}</p>}
  </div>;
}

function ReviewForm({ entry, categories }: { entry: ImportedEntry; categories: Category[] }) {
  const { state, pending, onSubmit, formKey } = useFormAction(reviewImportedEntry);
  const postable = canPost(entry);
  const [decision, setDecision] = useState(postable && entry.kind !== "transfer" ? "post" : "reviewed");
  const options = categories.filter((c) => !c.archived && c.kind === (entry.amount > 0 ? "income" : "expense"));
  return <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-6">
    <input type="hidden" name="id" value={entry.id} />
    <p>{entry.occurredOn} · {PROVIDER_META[entry.provider].name}</p>
    <p className="font-mono"><NativeAmount value={entry.amount} currency={entry.currency} crypto={entry.provider === "binance"} /></p>
    <FieldGroup>
      <FormField id="review-decision" label="How should this be recorded?">
        <Select name="decision" value={decision} onValueChange={setDecision} disabled={pending}><SelectTrigger id="review-decision"><SelectValue /></SelectTrigger>
          <SelectContent>{postable && <SelectItem value="post">Post as {entry.amount > 0 ? "income" : "expense"}</SelectItem>}
            <SelectItem value="reviewed">Keep in investment history only</SelectItem>
            {["transfer", "payment", "other"].includes(entry.kind) && <SelectItem value="transfer">Transfer to / from my own account</SelectItem>}
            <SelectItem value="ignored">Ignore — duplicate or not relevant</SelectItem></SelectContent>
        </Select>
      </FormField>
      {decision === "post" && <>
        <FormField id="review-category" label="Category"><Select name="categoryId" defaultValue={entry.categoryId ? String(entry.categoryId) : undefined} required disabled={pending}>
          <SelectTrigger id="review-category"><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent>{options.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select></FormField>
        <p className="text-sm text-muted-foreground">The PHP amount uses the exchange rate at posting. A matching amount on the same date will be held for review.</p>
        <Field orientation="horizontal"><Checkbox id="allow-duplicate" name="allowDuplicate" /><FieldLabel htmlFor="allow-duplicate">I checked Transactions; allow another entry with the same date and amount</FieldLabel></Field>
      </>}
    </FieldGroup>
    <p className="text-sm text-muted-foreground">Transfers stay out of budgets. Ignored entries also stay out of earnings. Use “Link transfer” when both sides are imported; fees are reviewed separately.</p>
    <FormFooter state={state} pending={pending}>Save review</FormFooter>
  </form>;
}
function TransferForm({ entry, candidates, selected }: { entry: ImportedEntry; candidates: ImportedEntry[]; selected?: string }) {
  const { state, pending, onSubmit, formKey } = useFormAction(matchImportedTransfer);
  const options = candidates.filter((c) => transferEligible(entry, c));
  return <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-6">
    <input type="hidden" name="first" value={entry.id} />
    <p>{PROVIDER_META[entry.provider].name} · {entry.occurredOn} · <NativeAmount value={entry.amount} currency={entry.currency} crypto={entry.provider === "binance"} /></p>
    <FormField id="transfer-second" label="The other side of this transfer"><Select name="second" defaultValue={selected} required disabled={pending}>
      <SelectTrigger id="transfer-second"><SelectValue placeholder="Choose a movement" /></SelectTrigger><SelectContent>{options.map((c) => <SelectItem key={c.id} value={c.id}>
        {PROVIDER_META[c.provider].name} · {c.occurredOn} · <NativeAmount value={c.amount} currency={c.currency} crypto={c.provider === "binance"} /> · {c.description}
      </SelectItem>)}</SelectContent></Select></FormField>
    <Alert><AlertTitle>Confirm both are your accounts</AlertTitle><AlertDescription>Link only movements of your own money. Different currencies and amounts are allowed for FX conversions. Principal is excluded from income and spending; separately imported fees remain expenses. Neither provider balance is changed.</AlertDescription></Alert>
    {!options.length && <p role="status" className="text-sm">No eligible opposite movement within seven days in the latest 500 pending entries. Review it as an own-account transfer if the other account is not imported.</p>}
    <FormFooter state={state} pending={pending}>Confirm transfer</FormFooter>
  </form>;
}
export function TransferButton({ entry, candidates, selected }: { entry: ImportedEntry; candidates: ImportedEntry[]; selected?: string }) {
  return <FormSheet trigger={<Button variant="outline" size="sm">Link transfer</Button>} title="Link your transfer" description={entry.description}>
    <TransferForm entry={entry} candidates={candidates} selected={selected} /></FormSheet>;
}
export function ReviewButton({ entry, categories }: { entry: ImportedEntry; categories: Category[] }) {
  return <FormSheet trigger={<Button size="sm">Review</Button>} title="Review imported entry" description={entry.description}><ReviewForm entry={entry} categories={categories} /></FormSheet>;
}
export function ImportAction({ action, children }: { action: () => Promise<FormState>; children: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => {
    try { notify(await action()); } catch { notify({ ok: false, message: "Couldn't save that change. Try again." }); }
  })}>{pending && <Spinner />}{children}</Button>;
}
export function ReopenImportButton({ id }: { id: string }) { return <ImportAction action={() => reopenImportedEntry(id)}>Reopen review</ImportAction>; }
export function RuleToggle({ id, enabled }: { id: string; enabled: boolean }) { return <ImportAction action={() => setRuleEnabled(id, !enabled)}>{enabled ? "Pause" : "Resume"}</ImportAction>; }
export function ApplyRulesButton() { return <ImportAction action={runCategoryRules}><WandSparkles />Apply rules</ImportAction>; }
export function AiCategorizeButton() { return <ImportAction action={runAiCategorization}><Sparkles />Categorize with AI</ImportAction>; }

export function AddRuleButton({ categories }: { categories: Category[] }) {
  return <FormSheet trigger={<Button variant="outline" size="sm"><Plus />Category rule</Button>} title="Add category rule"
    description="The most specific matching text wins. Conflicting rules and possible duplicates stay in the inbox."><RuleForm categories={categories} /></FormSheet>;
}
function RuleForm({ categories }: { categories: Category[] }) {
  const { state, pending, onSubmit, formKey } = useFormAction(saveCategoryRule);
  const [kind, setKind] = useState("expense");
  return <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-6"><FieldGroup>
    <FormField id="rule-text" label="Description contains"><Input id="rule-text" name="contains" placeholder="e.g. Spotify" minLength={2} maxLength={120} required /></FormField>
    <FormField id="rule-provider" label="Provider"><Select name="provider" defaultValue="any"><SelectTrigger id="rule-provider"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="any">Any provider</SelectItem><SelectItem value="wise">Wise</SelectItem><SelectItem value="ibkr">IBKR</SelectItem>
    </SelectContent></Select></FormField>
    <FormField id="rule-kind" label="Entry type"><Select name="kind" value={kind} onValueChange={setKind}><SelectTrigger id="rule-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></FormField>
    <FormField id="rule-category" label="Category"><Select key={kind} name="categoryId" required><SelectTrigger id="rule-category"><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent>
      {categories.filter((c) => !c.archived && c.kind === kind).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
    </SelectContent></Select></FormField>
    <Field orientation="horizontal"><Checkbox id="rule-auto" name="autoPost" /><FieldLabel htmlFor="rule-auto">Automatically post matching income or expenses</FieldLabel></Field>
  </FieldGroup><p className="text-sm text-muted-foreground">Leave automatic posting off to suggest a category. Rules skip transfers, trades, unknown entry types and crypto amounts. Pause an old rule before replacing it.</p><FormFooter state={state} pending={pending}>Save rule</FormFooter></form>;
}
