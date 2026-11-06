"use client";

import { useId } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASSET_CLASSES, ASSET_CLASS_META, CURRENCIES, LIABILITY_KINDS, LIABILITY_KIND_LABELS, type AssetClass, type LiabilityKind } from "@/lib/finance/constants";
import { deleteDebt, deleteManualAccount, saveDebt, saveManualAccount, setDebtArchived, setManualAccountArchived } from "../_actions/balances";
import { FormField, FormFooter, FormSheet, useFormAction } from "./form";
import { EditableRow } from "./row-actions";
import { EmptyState, Money } from "./ui";

/* Accounts no connection syncs: things you own (manual accounts) and what you owe (debts). */

export interface ManualAccountDTO {
  id: string;
  name: string;
  assetClass: AssetClass;
  value: number;
  currency: string;
  platform: string | null;
  notes: string | null;
  archived: boolean;
  /** "Updated Oct 3, 2026": a manual value is only as current as its last edit. */
  updated: string;
  stale: boolean;
}

export interface DebtDTO {
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
  archived: boolean;
  updated: string;
  stale: boolean;
}

function CurrencySelect({ id, defaultValue }: { id: string; defaultValue?: string }) {
  return (
    <Select name="currency" defaultValue={defaultValue ?? "PHP"}>
      <SelectTrigger id={id} className="w-full">
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
  );
}

export function ManualAccountForm({ account }: { account?: ManualAccountDTO }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveManualAccount);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      {account && <input type="hidden" name="id" value={account.id} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("name")} label="Name" error={error("name")} wide>
          <Input id={id("name")} name="name" maxLength={120} placeholder="GCash, emergency cash, car…" defaultValue={state.values?.name ?? account?.name} aria-invalid={Boolean(error("name"))} />
        </FormField>
        <FormField id={id("value")} label="Worth today" error={error("value")}>
          <Input id={id("value")} name="value" inputMode="decimal" defaultValue={state.values?.value ?? account?.value} aria-invalid={Boolean(error("value"))} />
        </FormField>
        <FormField id={id("currency")} label="Currency" error={error("currency")}>
          <CurrencySelect id={id("currency")} defaultValue={state.values?.currency ?? account?.currency} />
        </FormField>
        <FormField id={id("class")} label="Type" error={error("assetClass")}>
          <Select name="assetClass" defaultValue={state.values?.assetClass ?? account?.assetClass ?? "cash"}>
            <SelectTrigger id={id("class")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_CLASSES.map((c) => (
                <SelectItem key={c} value={c}>
                  {ASSET_CLASS_META[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id={id("platform")} label="Where it is" error={error("platform")} description="Optional">
          <Input id={id("platform")} name="platform" maxLength={80} placeholder="GCash" defaultValue={state.values?.platform ?? account?.platform ?? undefined} />
        </FormField>
        <FormField id={id("notes")} label="Notes" error={error("notes")} wide>
          <Input id={id("notes")} name="notes" maxLength={500} defaultValue={state.values?.notes ?? account?.notes ?? undefined} />
        </FormField>
        <FormFooter state={state} pending={pending}>
          {account ? "Save" : "Add account"}
        </FormFooter>
      </FieldGroup>
    </form>
  );
}

export function DebtForm({ debt }: { debt?: DebtDTO }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveDebt);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const value = (name: keyof DebtDTO) => state.values?.[name] ?? (debt?.[name] == null ? undefined : String(debt[name]));
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      {debt && <input type="hidden" name="id" value={debt.id} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("name")} label="Name" error={error("name")} wide>
          <Input id={id("name")} name="name" maxLength={120} placeholder="BPI credit card" defaultValue={value("name")} aria-invalid={Boolean(error("name"))} />
        </FormField>
        <FormField id={id("balance")} label="Balance owed" error={error("balance")}>
          <Input id={id("balance")} name="balance" inputMode="decimal" defaultValue={value("balance")} aria-invalid={Boolean(error("balance"))} />
        </FormField>
        <FormField id={id("currency")} label="Currency" error={error("currency")}>
          <CurrencySelect id={id("currency")} defaultValue={value("currency")} />
        </FormField>
        <FormField id={id("kind")} label="Type" error={error("kind")}>
          <Select name="kind" defaultValue={value("kind") ?? "credit_card"}>
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
        <FormField id={id("lender")} label="Lender" error={error("lender")} description="Optional">
          <Input id={id("lender")} name="lender" maxLength={80} defaultValue={value("lender")} />
        </FormField>
        <FormField id={id("limit")} label="Credit limit" error={error("creditLimit")} description="Cards: shows how much is used">
          <Input id={id("limit")} name="creditLimit" inputMode="decimal" defaultValue={value("creditLimit")} aria-invalid={Boolean(error("creditLimit"))} />
        </FormField>
        <FormField id={id("rate")} label="Interest rate (%)" error={error("interestRate")} description="As the lender quotes it">
          <Input id={id("rate")} name="interestRate" inputMode="decimal" defaultValue={value("interestRate")} aria-invalid={Boolean(error("interestRate"))} />
        </FormField>
        <FormField id={id("due")} label="Due day" error={error("dueDay")} description="Day of the month, 1 to 31">
          <Input id={id("due")} name="dueDay" inputMode="numeric" defaultValue={value("dueDay")} aria-invalid={Boolean(error("dueDay"))} />
        </FormField>
        <FormField id={id("min")} label="Minimum payment" error={error("minPayment")}>
          <Input id={id("min")} name="minPayment" inputMode="decimal" defaultValue={value("minPayment")} aria-invalid={Boolean(error("minPayment"))} />
        </FormField>
        <FormField id={id("notes")} label="Notes" error={error("notes")} wide>
          <Input id={id("notes")} name="notes" maxLength={500} defaultValue={value("notes")} />
        </FormField>
        <FormFooter state={state} pending={pending}>
          {debt ? "Save" : "Add debt"}
        </FormFooter>
      </FieldGroup>
    </form>
  );
}

/** Manual accounts and debts side by side on Accounts, each with its own Add. */
export function ManualBalances({ accounts, debts }: { accounts: ManualAccountDTO[]; debts: DebtDTO[] }) {
  return (
    <section aria-label="Manual accounts and debts" className="mb-6 grid gap-4 lg:grid-cols-2">
      <Card id="manual" className="scroll-mt-24">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Other accounts</CardTitle>
            <CardDescription>What you own that nothing syncs. Update the value when it changes.</CardDescription>
          </div>
          <FormSheet title="Add an account" description="It counts in net worth at the value you enter, until you update or archive it." trigger={<Button variant="outline" size="sm"><Plus /> Add account</Button>}>
            <ManualAccountForm />
          </FormSheet>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <EmptyState size="sm" title="None yet">Cash at home, e-wallets, a car or property: add them so net worth covers everything you own.</EmptyState>
          ) : (
            <ItemGroup>
              {accounts.map((a) => (
                <EditableRow
                  key={a.id}
                  name={a.name}
                  editTitle={`Edit ${a.name}`}
                  editDescription="Saving a new value also brings an archived account back into net worth."
                  editForm={<ManualAccountForm account={a} />}
                  archived={a.archived}
                  onToggleArchive={() => setManualAccountArchived(a.id, !a.archived)}
                  onDelete={() => deleteManualAccount(a.id)}
                  deleteWarning="It stops counting in net worth. Archive it instead to keep it for later."
                  aside={<span className="font-mono text-sm"><Money value={a.value} currency={a.currency} /></span>}
                >
                  <ItemContent>
                    <ItemTitle>{a.name}{a.archived && <span className="text-xs font-normal text-muted-foreground">Archived · not in net worth</span>}</ItemTitle>
                    <ItemDescription clamp={1}>
                      {[ASSET_CLASS_META[a.assetClass].label, a.platform, a.updated].filter(Boolean).join(" · ")}
                      {a.stale && !a.archived && <span className="text-warning"> · worth checking</span>}
                    </ItemDescription>
                  </ItemContent>
                </EditableRow>
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>

      <Card id="debts" className="scroll-mt-24">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>Debts</CardTitle>
            <CardDescription>Credit cards, loans and buy now, pay later. Their balances come off net worth.</CardDescription>
          </div>
          <FormSheet title="Add a debt" description="Its balance comes off net worth until you update or archive it." trigger={<Button variant="outline" size="sm"><Plus /> Add debt</Button>}>
            <DebtForm />
          </FormSheet>
        </CardHeader>
        <CardContent>
          {debts.length === 0 ? (
            <EmptyState size="sm" title="No debts">Add a card or loan and net worth takes it off. Nothing here means nothing owed is tracked, not that nothing is owed.</EmptyState>
          ) : (
            <ItemGroup>
              {debts.map((d) => {
                const used = d.creditLimit ? d.balance / d.creditLimit : null;
                return (
                  <EditableRow
                    key={d.id}
                    name={d.name}
                    editTitle={`Edit ${d.name}`}
                    editDescription="Update the balance after each statement or payment."
                    editForm={<DebtForm debt={d} />}
                    archived={d.archived}
                    onToggleArchive={() => setDebtArchived(d.id, !d.archived)}
                    onDelete={() => deleteDebt(d.id)}
                    deleteWarning="It stops coming off net worth. Archive it instead once it's paid off."
                    aside={<span className="font-mono text-sm"><Money value={-d.balance} currency={d.currency} /></span>}
                  >
                    <ItemContent>
                      <ItemTitle>{d.name}{d.archived && <span className="text-xs font-normal text-muted-foreground">Archived · not in net worth</span>}</ItemTitle>
                      <ItemDescription clamp={1}>
                        {[LIABILITY_KIND_LABELS[d.kind], d.lender, d.dueDay ? `due day ${d.dueDay}` : null, d.updated].filter(Boolean).join(" · ")}
                        {d.stale && !d.archived && <span className="text-warning"> · worth checking</span>}
                      </ItemDescription>
                      {used != null && !d.archived && (
                        <span className="block group-data-[private=true]/shell:blur-sm">
                          <Progress thin aria-label={`${Math.round(used * 100)}% of the credit limit used`} value={Math.min(used, 1) * 100} variant={used > 0.9 ? "destructive" : used >= 0.3 ? "warning" : "default"} />
                        </span>
                      )}
                    </ItemContent>
                  </EditableRow>
                );
              })}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
