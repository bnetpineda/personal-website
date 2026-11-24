"use client";

import { useId, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { assumedMinimum, comparePayoff, type PayoffPlan, type PlanDebt } from "@/lib/finance/debt";
import { monthLabel } from "@/lib/finance/dates";
import { InfoNote, Money } from "./ui";

/** A debt as the planner sees it: in PHP, at today's rate. */
export type PlannerDebt = PlanDebt;

function duration(months: number) {
  const years = Math.floor(months / 12), rest = months % 12;
  const parts = [years && `${years} ${years === 1 ? "year" : "years"}`, rest && `${rest} ${rest === 1 ? "month" : "months"}`].filter(Boolean);
  return parts.join(" ") || "this month";
}

function Strategy({ title, hint, plan, best }: { title: string; hint: string; plan: PayoffPlan & { saved: number | null; monthsSooner: number | null }; best: boolean }) {
  return (
    <Card variant="quiet" size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">{title}{best && <Badge variant="success">Least interest</Badge>}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {!plan.feasible ? (
          <p>These payments never catch up with the interest. Add more each month.</p>
        ) : (
          <>
            <p>
              <span className="font-display text-lg uppercase">Debt-free {plan.debtFreeMonth ? monthLabel(plan.debtFreeMonth, "long") : "now"}</span>
              <br />
              <span className="text-muted-foreground">In {duration(plan.months)}{plan.monthsSooner ? `, ${plan.monthsSooner} ${plan.monthsSooner === 1 ? "month" : "months"} sooner than minimums only` : ""}.</span>
            </p>
            <p>Interest paid: <Money value={plan.totalInterest} />{plan.saved != null && plan.saved > 0 && <> · saves <Money value={plan.saved} /></>}</p>
            <ol className="flex list-decimal flex-col gap-1 pl-5">
              {plan.order.map((d) => <li key={d.id}>{d.name}{d.paidOffMonth && <span className="text-muted-foreground"> · paid off {monthLabel(d.paidOffMonth, "short")}</span>}</li>)}
            </ol>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The debts' payoff plan: a fixed monthly payment (every minimum plus an extra), with a cleared
 * debt's payment rolled onto the next. Avalanche pays the highest rate first, snowball the smallest
 * balance. Everything is worked out in the browser, so changing the extra answers at once.
 */
export function DebtPlanner({ debts, missingFx, today, className }: { debts: PlannerDebt[]; missingFx: string[]; today: string; className?: string }) {
  const uid = useId();
  const [extra, setExtra] = useState("");
  const [ratePer, setRatePer] = useState<"year" | "month">("year");
  const extraAmount = Math.max(0, Number(extra.replace(/[,\s₱]/g, "")) || 0);
  const result = useMemo(() => comparePayoff(debts, { extra: extraAmount, ratePer, startMonth: today.slice(0, 7) }), [debts, extraAmount, ratePer, today]);
  const best = result.avalanche.feasible && result.snowball.feasible && result.avalanche.totalInterest < result.snowball.totalInterest - 0.5;
  const minimums = debts.reduce((sum, d) => sum + (d.minPayment && d.minPayment > 0 ? d.minPayment : assumedMinimum(d, ratePer)), 0);
  return (
    <Card id="payoff" className={className}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>Payoff plan</CardTitle>
          <CardDescription>How soon your debts are gone at a steady monthly payment, and which order costs less.</CardDescription>
        </div>
        <InfoNote label="How it's worked out" title="About the payoff plan">
          <p>Each month adds interest, pays every debt&apos;s minimum, then puts the extra on one debt. When a debt is paid off, its payment moves to the next.</p>
          <p>A debt with no minimum saved is assumed to pay its interest plus 1% of the balance, at least ₱500. Debts in other currencies are converted at today&apos;s rate.</p>
          <p>This is an estimate from your saved balances and rates, not the lender&apos;s schedule.</p>
        </InfoNote>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${uid}-extra`}>Extra each month (PHP)</FieldLabel>
            <Input id={`${uid}-extra`} inputMode="decimal" autoComplete="off" placeholder="0" value={extra} onChange={(event) => setExtra(event.target.value)} />
            <FieldDescription>On top of the minimums{minimums > 0 ? <> (<Money value={minimums} /> a month)</> : null}.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel id={`${uid}-rate`}>Interest rates are quoted</FieldLabel>
            <ToggleGroup type="single" variant="outline" size="sm" value={ratePer} onValueChange={(value) => value && setRatePer(value as "year" | "month")} aria-labelledby={`${uid}-rate`}>
              <ToggleGroupItem value="year">Per year</ToggleGroupItem>
              <ToggleGroupItem value="month">Per month</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>Credit cards in the Philippines usually quote a monthly rate.</FieldDescription>
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Strategy title="Avalanche" hint="Highest interest rate first" plan={result.avalanche} best={best} />
          <Strategy title="Snowball" hint="Smallest balance first" plan={result.snowball} best={false} />
        </div>
        <p className="text-sm text-muted-foreground">
          {result.minimum.feasible
            ? <>Minimums only: debt-free {result.minimum.debtFreeMonth ? monthLabel(result.minimum.debtFreeMonth, "long") : "now"}, with <Money value={result.minimum.totalInterest} /> in interest.</>
            : "Minimums only never pay these off: the interest grows faster."}
          {missingFx.length > 0 && ` Left out for now (no exchange rate): ${missingFx.join(", ")}.`}
        </p>
      </CardContent>
    </Card>
  );
}
