import type { Metadata } from "next";
import { HandCoins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getAccounts, getCategories, getFx, getLastPayments, getLiabilities } from "@/lib/dal";
import type { Liability } from "@/lib/db/schema";
import { fxToPhp, sumInPhp } from "@/lib/finance/calc";
import { LIABILITY_KIND_LABELS } from "@/lib/finance/constants";
import { dayLabel, nextDueDate, todayManila } from "@/lib/finance/dates";
import { deleteLiability, setLiabilityArchived } from "../../_actions/liabilities";
import { FormSheet } from "../../_components/form";
import { LiabilityForm, PaymentForm, type LiabilityDTO } from "../../_components/liability-form";
import { EditableCardHeader } from "../../_components/row-actions";
import { EmptyState, MissingFxAlert, Money, PageHeader, Pct, StatCards } from "../../_components/ui";

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
  const [rows, fx, expenseCategories, accounts, lastPayments] = await Promise.all([
    getLiabilities(),
    getFx(),
    getCategories("expense"),
    getAccounts(),
    getLastPayments(),
  ]);
  const paymentCategories = expenseCategories.map(({ id, name, color, archived }) => ({ id, name, color, archived }));
  const today = todayManila();
  const active = rows.filter((l) => !l.archived);
  const archived = rows.filter((l) => l.archived);

  const owed = sumInPhp(fx, active.map((l) => ({ amount: l.balance, currency: l.currency })));
  const minimums = sumInPhp(fx, active.map((l) => ({ amount: l.minPayment ?? 0, currency: l.currency })));
  const cards = active.filter((l) => (l.creditLimit ?? 0) > 0 && fxToPhp(fx, l.currency) != null);
  const cardBalance = sumInPhp(fx, cards.map((l) => ({ amount: l.balance, currency: l.currency }))).total;
  const cardLimit = sumInPhp(fx, cards.map((l) => ({ amount: l.creditLimit ?? 0, currency: l.currency }))).total;
  const missingFx = [...new Set([...owed.missing, ...minimums.missing])];

  const debtCard = (l: Liability) => {
    const utilization = l.creditLimit && l.creditLimit > 0 ? l.balance / l.creditLimit : null;
    const due = l.dueDay ? nextDueDate(l.dueDay, today) : null;
    const lastPaid = lastPayments.get(l.id);
    const facts = [
      { label: "Next due", value: due ? `${dayLabel(due.date)} · ${due.inDays === 0 ? "today" : `in ${due.inDays} d`}` : "—" },
      { label: "Minimum", value: l.minPayment != null ? <Money value={l.minPayment} currency={l.currency} /> : "—" },
      { label: "Interest", value: l.interestRate != null ? `${l.interestRate}%` : "—" },
      {
        label: "Last paid",
        value: lastPaid ? (
          <>
            <Money value={lastPaid.amount} currency={lastPaid.currency} /> · {dayLabel(lastPaid.occurredOn)}
          </>
        ) : (
          "—"
        ),
      },
      { label: "Notes", value: l.notes || "—" },
    ];
    return (
      <Card key={l.id}>
        <EditableCardHeader
          title={l.name}
          description={[LIABILITY_KIND_LABELS[l.kind], l.lender, l.archived ? "Paid off" : null].filter(Boolean).join(" · ")}
          name={l.name}
          editForm={<LiabilityForm liability={toDTO(l)} />}
          archived={l.archived}
          onToggleArchive={setLiabilityArchived.bind(null, l.id, !l.archived)}
          onDelete={deleteLiability.bind(null, l.id)}
        />
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="font-display text-3xl">
              <Money value={l.balance} currency={l.currency} />
            </p>
            {l.currency !== "PHP" && fxToPhp(fx, l.currency) != null && (
              <p className="font-mono text-xs text-muted-foreground">
                ≈ <Money value={l.balance * fxToPhp(fx, l.currency)!} />
              </p>
            )}
          </div>
          {utilization != null && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between font-mono text-xs text-muted-foreground">
                <span>Utilization <Pct value={utilization} /></span>
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
        {!l.archived && l.balance > 0 && (
          <CardFooter>
            <FormSheet
              title={`Pay ${l.name}`}
              description="Takes the payment off the balance."
              trigger={
                <Button variant="outline" size="sm">
                  <HandCoins /> Pay
                </Button>
              }
            >
              <PaymentForm
                debt={{ id: l.id, name: l.name, kind: l.kind, currency: l.currency, balance: l.balance, minPayment: l.minPayment }}
                categories={paymentCategories}
                accounts={accounts}
                defaults={{ categoryId: lastPaid?.categoryId, account: lastPaid?.account }}
              />
            </FormSheet>
          </CardFooter>
        )}
      </Card>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Liabilities" title="Debts">
        <FormSheet
          title="Add debt"
          description="Credit cards, loans and buy-now-pay-later. Use Pay to reduce the balance. Edit the balance only to correct it."
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
          { label: "Total owed", value: <Money value={owed.total} />, primary: true },
          { label: "Minimum payments", value: <Money value={minimums.total} />, hint: "per month" },
          {
            label: "Card utilization",
            value: cardLimit > 0 ? <Pct value={cardBalance / cardLimit} /> : "—",
            hint: cardLimit > 0 ? <Money value={cardLimit} compact /> : undefined,
          },
        ]}
      />

      <MissingFxAlert currencies={missingFx} />

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
