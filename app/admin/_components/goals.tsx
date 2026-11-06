"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GOAL_MEASURES, GOAL_MEASURE_LABELS, type GoalMeasure } from "@/lib/finance/constants";
import type { GoalProgress } from "@/lib/finance/goals";
import { deleteGoal, saveGoal, setGoalArchived } from "../_actions/goals";
import { FormField, FormFooter, FormSheet, useFormAction } from "./form";
import { Masked } from "./privacy";
import { EditableRow } from "./row-actions";
import { EmptyState, Money, Pct } from "./ui";

export interface GoalDTO {
  id: string;
  name: string;
  measure: GoalMeasure;
  target: number;
  saved: number | null;
  targetOn: string | null;
  archived: boolean;
  progress: GoalProgress;
  /** "by Dec 31, 2027" */
  due: string | null;
}

const MEASURE_HINT: Record<GoalMeasure, string> = {
  emergency_fund: "Months of your average spending that your cash covers. Six is a common target.",
  net_worth: "Everything you own minus what you owe, as on the Overview.",
  cash: "Bank balances, e-wallets and cash in your accounts.",
  investments: "Everything that isn't cash, across your accounts.",
  manual: "You enter what's saved so far and update it yourself.",
};

const months = (n: number) => `${n.toLocaleString("en-PH", { maximumFractionDigits: 1 })} ${n === 1 ? "month" : "months"}`;

export function GoalForm({ goal }: { goal?: GoalDTO }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveGoal);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const [measure, setMeasure] = useState<GoalMeasure>((state.values?.measure as GoalMeasure) ?? goal?.measure ?? "emergency_fund");
  const [targetOn, setTargetOn] = useState(state.values?.targetOn ?? goal?.targetOn ?? "");
  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("name")} label="Name" error={error("name")} wide>
          <Input id={id("name")} name="name" maxLength={80} placeholder="Emergency fund" defaultValue={state.values?.name ?? goal?.name} aria-invalid={Boolean(error("name"))} />
        </FormField>
        <FormField id={id("measure")} label="Tracks" error={error("measure")} description={MEASURE_HINT[measure]} wide>
          <Select name="measure" value={measure} onValueChange={(v) => setMeasure(v as GoalMeasure)}>
            <SelectTrigger id={id("measure")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOAL_MEASURES.map((m) => (
                <SelectItem key={m} value={m}>
                  {GOAL_MEASURE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id={id("target")} label={measure === "emergency_fund" ? "Target, in months" : "Target, in PHP"} error={error("target")}>
          <Input id={id("target")} name="target" inputMode="decimal" placeholder={measure === "emergency_fund" ? "6" : undefined} defaultValue={state.values?.target ?? goal?.target} aria-invalid={Boolean(error("target"))} />
        </FormField>
        <FormField id={id("targetOn")} label="By" error={error("targetOn")} description="Optional: shows what to save each month">
          <DatePicker id={id("targetOn")} name="targetOn" value={targetOn} onValueChange={setTargetOn} />
        </FormField>
        {measure === "manual" && (
          <FormField id={id("saved")} label="Saved so far, in PHP" error={error("saved")} wide>
            <Input id={id("saved")} name="saved" inputMode="decimal" defaultValue={state.values?.saved ?? goal?.saved ?? undefined} aria-invalid={Boolean(error("saved"))} />
          </FormField>
        )}
        <FormFooter state={state} pending={pending}>
          {goal ? "Save" : "Add goal"}
        </FormFooter>
      </FieldGroup>
    </form>
  );
}

export function AddGoalButton() {
  return (
    <FormSheet title="Add a goal" description="Progress updates by itself from your accounts, unless you track the amount by hand." trigger={<Button size="sm"><Plus /> Add goal</Button>}>
      <GoalForm />
    </FormSheet>
  );
}

function Figure({ value, unit }: { value: number; unit: GoalProgress["unit"] }) {
  return unit === "months" ? <span className="tabular-nums group-data-[private=true]/shell:blur-sm"><Masked text={months(value)} /></span> : <Money value={value} />;
}

export function GoalList({ goals }: { goals: GoalDTO[] }) {
  if (!goals.length) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No goals yet" action={<AddGoalButton />}>
            Start with an emergency fund: how many months of spending your cash would cover.
          </EmptyState>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="gap-0 py-2">
      <ItemGroup>
        {goals.map((g) => {
          const p = g.progress;
          return (
            <EditableRow
              key={g.id}
              name={g.name}
              editForm={<GoalForm goal={g} />}
              archived={g.archived}
              onToggleArchive={() => setGoalArchived(g.id, !g.archived)}
              onDelete={() => deleteGoal(g.id)}
              aside={
                <span className="flex shrink-0 flex-col items-end font-mono text-sm">
                  {p.current == null ? <span className="text-muted-foreground">—</span> : <Figure value={p.current} unit={p.unit} />}
                  <span className="text-xs text-muted-foreground">of <Figure value={p.target} unit={p.unit} /></span>
                </span>
              }
            >
              <ItemContent>
                <ItemTitle>
                  {g.name}
                  {g.archived && <span className="text-xs font-normal text-muted-foreground">Archived</span>}
                  {p.reached && !g.archived && <span className="text-xs font-normal text-success">Reached</span>}
                </ItemTitle>
                <ItemDescription clamp={2}>
                  {GOAL_MEASURE_LABELS[g.measure]}
                  {g.due && ` · ${g.due}`}
                  {p.missing ? ` · ${p.missing}` : p.ratio != null && <> · <Pct value={Math.min(p.ratio, 9.99)} /></>}
                  {p.perMonth != null && <> · save <Money value={p.perMonth} compact /> a month</>}
                  {p.unit === "months" && p.remaining != null && p.remaining > 0 && <> · <Figure value={p.remaining} unit="months" /> to go</>}
                </ItemDescription>
                {p.ratio != null && !g.archived && (
                  <span className="block group-data-[private=true]/shell:blur-sm">
                    <Progress thin aria-hidden value={Math.min(p.ratio, 1) * 100} variant={p.reached ? "success" : "default"} />
                  </span>
                )}
              </ItemContent>
            </EditableRow>
          );
        })}
      </ItemGroup>
    </Card>
  );
}
