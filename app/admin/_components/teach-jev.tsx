"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { CashFlowKind } from "@/lib/finance/constants";
import { dayLabel } from "@/lib/finance/dates";
import type { TeachGroup } from "@/lib/finance/imports/teach";
import { teachPayee } from "../_actions/imports";
import type { FormCategory } from "./cash-flow-form";
import { notify } from "./form";
import { Money } from "./ui";

const SHOWN = 6;

/**
 * Payees the model was not sure about, one row per payee. Choosing a category once files every past
 * payment, saves a rule for the next import, and becomes an example the model learns from.
 */
export function TeachList({ groups, categories }: { groups: TeachGroup[]; categories: Record<CashFlowKind, FormCategory[]> }) {
  const [expanded, setExpanded] = useState(false);
  const more = groups.length - SHOWN;
  return (
    <>
      <ItemGroup>
        {(expanded ? groups : groups.slice(0, SHOWN)).map((group) => <TeachRow key={group.key} group={group} categories={categories[group.kind]} />)}
      </ItemGroup>
      {more > 0 && (
        <Button variant="subtle" size="xs" className="mt-2" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show fewer" : `Show ${more} more`}
        </Button>
      )}
    </>
  );
}

function TeachRow({ group, categories }: { group: TeachGroup; categories: FormCategory[] }) {
  const options = categories.filter((c) => !c.archived);
  const guess = options.find((c) => c.name === group.guess);
  const [choice, setChoice] = useState(guess ? String(guess.id) : "");
  const [pending, startTransition] = useTransition();
  const save = () => startTransition(async () => {
    try { notify(await teachPayee(group.payee, group.kind, Number(choice))); }
    catch { notify({ ok: false, message: "Couldn't save that. Try again." }); }
  });
  return (
    <Item size="xs">
      <ItemContent>
        <ItemTitle>{group.payee}</ItemTitle>
        <ItemDescription>
          {group.count} {group.count === 1 ? "payment" : "payments"} · <Money value={group.kind === "income" ? group.totalPhp : -group.totalPhp} signed tone /> · last {dayLabel(group.lastOn)}
          {group.guess && ` · AI's guess: ${group.guess}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Select value={choice} onValueChange={setChoice} disabled={pending}>
          <SelectTrigger size="sm" aria-label={`Category for ${group.payee}`}><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>{options.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={!choice || pending} onClick={save} aria-label={`Save category for ${group.payee}`}>{pending && <Spinner />}Save</Button>
      </ItemActions>
    </Item>
  );
}
