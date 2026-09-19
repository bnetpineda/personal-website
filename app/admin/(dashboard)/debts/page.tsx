import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getFx, getLiabilities } from "@/lib/dal";
import type { Liability } from "@/lib/db/schema";
import { fxToPhp } from "@/lib/finance/calc";
import { LIABILITY_KIND_LABELS } from "@/lib/finance/constants";
import { dayLabel, nextDueDate, todayManila } from "@/lib/finance/dates";
import { formatPct } from "@/lib/finance/format";
import { deleteLiability, setLiabilityArchived } from "../../_actions/liabilities";
import { FormSheet } from "../../_components/form";
import { LiabilityForm, type LiabilityDTO } from "../../_components/liability-form";
import { RowActions } from "../../_components/row-actions";
import { EmptyState, Money, PageHeader, StatCards } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Debts",
};

function toDTO(l: Liability): LiabilityDTO {
  return {
    id: l.id,
    kind: l.kind,
    name: l.name,
    lender: l.lender,
    balance: l.balance,
    currency: l.currency,
    creditLimit: l.creditLimit,
    interestRate: l.interestRate,
    dueDay: l.dueDay,
    minPayment: l.minPayment,
    notes: l.notes,
  };
}

export default async function DebtsPage() {
  const [rows, fx] = await Promise.all([getLiabilities(), getFx()]);
  const today = todayManila();
  const active = rows.filter((l) => !l.archived);
  const archived = rows.filter((l) => l.archived);

  const php = (amount: number, currency: string) => amount * (fxToPhp(fx, currency) ?? 0);
  const totalOwed = active.reduce((sum, l) => sum + php(l.balance, l.currency), 0);
  const minDue = active.reduce((sum, l) => sum + php(l.minPayment ?? 0, l.currency), 0);
  const cards = active.filter((l) => (l.creditLimit ?? 0) > 0);
  const cardBalance = cards.reduce((sum, l) => sum + php(l.balance, l.currency), 0);
  const cardLimit = cards.reduce((sum, l) => sum + php(l.creditLimit!, l.currency), 0);

  const debtCard = (l: Liability) => {
    const utilization = l.creditLimit && l.creditLimit > 0 ? l.balance / l.creditLimit : null;
    const due = l.dueDay ? nextDueDate(l.dueDay, today) : null;
    const facts = [
      { label: "Next due", value: due ? `${dayLabel(due.date)} · ${due.inDays === 0 ? "today" : `in ${due.inDays} d`}` : "—" },
      { label: "Minimum", value: l.minPayment != null ? <Money value={l.minPayment} currency={l.currency} /> : "—" },
      { label: "Interest", value: l.interestRate != null ? `${l.interestRate}%` : "—" },
      { label: "Notes", value: l.notes || "—" },
    ];
    return (
      <Card key={l.id}>
        <CardHeader>
          <CardTitle>{l.name}</CardTitle>
          <CardDescription>{[LIABILITY_KIND_LABELS[l.kind], l.lender, l.archived ? "Paid off" : null].filter(Boolean).join(" · ")}</CardDescription>
          <CardAction>
            <RowActions
              name={l.name}
              editForm={<LiabilityForm liability={toDTO(l)} />}
              archived={l.archived}
              onToggleArchive={setLiabilityArchived.bind(null, l.id, !l.archived)}
              onDelete={deleteLiability.bind(null, l.id)}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="font-display text-3xl">
              <Money value={l.balance} currency={l.currency} />
            </p>
            {l.currency !== "PHP" && (
              <p className="font-mono text-xs text-muted-foreground">
                ≈ <Money value={php(l.balance, l.currency)} />
              </p>
            )}
          </div>
          {utilization != null && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Utilization {formatPct(utilization)}</span>
                <span>
                  of <Money value={l.creditLimit!} currency={l.currency} />
                </span>
              </div>
              <Progress
                aria-label={`${l.name} utilization`}
                value={Math.min(utilization, 1) * 100}
                variant={utilization > 0.9 ? "destructive" : utilization > 0.5 ? "warning" : "default"}
              />
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {facts.map((f) => (
              <div key={f.label}>
                <dt className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{f.label}</dt>
                <dd className="font-semibold">{f.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Liabilities" title="Debts">
        <FormSheet
          title="Add debt"
          description="Credit cards, loans and buy-now-pay-later. Update the balance whenever you pay."
          trigger={
            <Button>
              <Plus /> Add debt
            </Button>
          }
        >
          <LiabilityForm />
        </FormSheet>
      </PageHeader>

      <StatCards
        items={[
          { label: "Total owed", value: <Money value={totalOwed} />, primary: true },
          { label: "Minimum payments", value: <Money value={minDue} />, hint: "per month" },
          {
            label: "Card utilization",
            value: cardLimit > 0 ? formatPct(cardBalance / cardLimit) : "—",
            hint: cardLimit > 0 ? <Money value={cardLimit} compact /> : undefined,
          },
        ]}
      />

      {active.length === 0 ? (
        <EmptyState title="Debt-free">Nothing owed — or add a card or loan to track it against your net worth.</EmptyState>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{active.map(debtCard)}</div>
      )}

      {archived.length > 0 && (
        <section className="mt-10 flex flex-col gap-4">
          <h2 className="font-mono text-xs font-bold tracking-widest text-muted-foreground uppercase">Archived · paid off</h2>
          <div className="grid gap-6 opacity-70 md:grid-cols-2 xl:grid-cols-3">{archived.map(debtCard)}</div>
        </section>
      )}
    </>
  );
}
