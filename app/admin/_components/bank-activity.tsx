"use client";

import { useId, useState, useTransition } from "react";
import { ArrowLeftRight, EyeOff, MoreHorizontal, ReceiptText, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Swatch } from "@/components/ui/swatch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FormState } from "@/lib/finance/schemas";
import { fileBankEntry, postBankEntry, unlinkBankTransfer } from "../_actions/bank-activity";
import type { FormCategory } from "./cash-flow-form";
import { FormFooter, FormSheetContent, notify, useFormAction } from "./form";

function PostForm({ id, categories }: { id: string; categories: FormCategory[] }) {
  const { state, pending, onSubmit, error } = useFormAction(postBankEntry);
  const uid = useId();
  const [categoryId, setCategoryId] = useState(state.values?.categoryId ?? "");
  return (
    <form onSubmit={onSubmit} noValidate>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <FieldGroup className="grid gap-4">
        <Field data-invalid={error("categoryId") ? true : undefined}>
          <FieldLabel id={`${uid}-category`}>Category</FieldLabel>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories of this kind yet. Add one on Categories first.</p>
          ) : (
            <ToggleGroup type="single" variant="outline" size="sm" spacing={2} value={categoryId} onValueChange={(value) => value && setCategoryId(value)}
              aria-labelledby={`${uid}-category`} aria-invalid={Boolean(error("categoryId"))} className="flex-wrap">
              {categories.map((c) => (
                <ToggleGroupItem key={c.id} value={String(c.id)}>
                  <Swatch color={c.color} />
                  {c.name}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          {error("categoryId") && <FieldError>{error("categoryId")}</FieldError>}
        </Field>
        <FormFooter state={state} pending={pending}>Post to Transactions</FormFooter>
      </FieldGroup>
    </form>
  );
}

/**
 * Re-file one bank import: post it in a category, file it as a transfer between your accounts,
 * ignore it, or unlink it from a wrong transfer partner. Only moves that change something are offered.
 */
export function RefileActions({ id, description, income, choices, categories }: {
  id: string;
  description: string;
  /** Money in: posts as income. */
  income: boolean;
  choices: { post: boolean; transfer: boolean; ignore: boolean; unlink: boolean };
  /** Active categories of the entry's kind. */
  categories: FormCategory[];
}) {
  const [posting, setPosting] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<FormState>) => startTransition(async () => {
    try { notify(await action()); }
    catch { notify({ ok: false, message: "Couldn't re-file that entry. Try again." }); }
  });
  if (!choices.post && !choices.transfer && !choices.ignore && !choices.unlink) return null;
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Re-file ${description}`} disabled={pending}>
            {pending ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>File as</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {choices.post && <DropdownMenuItem onSelect={() => setPosting(true)}><ReceiptText /> {income ? "Income" : "Spending"}…</DropdownMenuItem>}
          {choices.transfer && <DropdownMenuItem onSelect={() => run(() => fileBankEntry(id, "transfer"))}><ArrowLeftRight /> Transfer between my accounts</DropdownMenuItem>}
          {choices.ignore && <DropdownMenuItem onSelect={() => run(() => fileBankEntry(id, "ignore"))}><EyeOff /> Ignore</DropdownMenuItem>}
          {choices.unlink && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => run(() => unlinkBankTransfer(id))}><Unlink /> Unlink from its pair</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {choices.post && (
        <Sheet open={posting} onOpenChange={setPosting}>
          <FormSheetContent title={income ? "File as income" : "File as spending"} description={`${description} goes to Transactions in the category you pick.`} onClose={() => setPosting(false)}>
            <PostForm id={id} categories={categories} />
          </FormSheetContent>
        </Sheet>
      )}
    </>
  );
}
