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
import { Money, Panel } from "./ui";

const SHOWN = 6;

/**
 * Payees the model was not sure about, one row per payee. Choosing a category once files every past
 * payment, saves a rule for the next import, and becomes an example the model learns from.
 */
export function TeachJev({ groups, categories }: { groups: TeachGroup[]; categories: Record<CashFlowKind, FormCategory[]> }) {
  if (groups.length === 0) return null;
  const more = groups.length - SHOWN;
  return (
    <div className="mb-6">
      <Panel title={`Teach Jev · ${groups.length} ${groups.length === 1 ? "payee" : "payees"}`}>
        <p className="mb-4 text-sm text-muted-foreground">
          Jev wasn&apos;t sure about these, so they sit in Other. Pick a category once per payee: past payments move, and future ones are filed the same way.
        </p>
        <ItemGroup>
          {groups.slice(0, SHOWN).map((group) => <TeachRow key={group.key} group={group} categories={categories[group.kind]} />)}
        </ItemGroup>
        {more > 0 && <p className="mt-4 text-sm text-muted-foreground">{more} more after these.</p>}
      </Panel>
    </div>
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
    <Item size="sm">
      <ItemContent>
        <ItemTitle>{group.payee}</ItemTitle>
        <ItemDescription>
          {group.count} {group.count === 1 ? "payment" : "payments"} · <Money value={group.kind === "income" ? group.totalPhp : -group.totalPhp} signed tone /> · last {dayLabel(group.lastOn)}
          {group.guess && ` · Jev leaned ${group.guess}`}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Select value={choice} onValueChange={setChoice} disabled={pending}>
          <SelectTrigger size="sm" aria-label={`Category for ${group.payee}`}><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>{options.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={!choice || pending} onClick={save}>{pending && <Spinner />}Save</Button>
      </ItemActions>
    </Item>
  );
}
