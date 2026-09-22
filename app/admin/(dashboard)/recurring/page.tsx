import type { Metadata } from "next";
import { Pause, Play, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { getAccounts, getCategories, getFx, getRecurring, type RecurringRow } from "@/lib/dal";
import { fxToPhp } from "@/lib/finance/calc";
import type { CashFlowKind } from "@/lib/finance/constants";
import { addDays, todayManila } from "@/lib/finance/dates";
import { describeSchedule, dueOccurrences, monthlyEquivalent, upcomingOccurrences } from "@/lib/finance/recurrence";
import { deleteRecurring, setRecurringPaused, skipRecurring } from "../../_actions/recurring";
import { CashFlowForm } from "../../_components/cash-flow-form";
import { DueActions } from "../../_components/due-actions";
import { FormSheet } from "../../_components/form";
import { OccurrenceList, whenLabel } from "../../_components/recurring";
import { RecurringForm, type RecurringDTO } from "../../_components/recurring-form";
import { RowActions } from "../../_components/row-actions";
import { EmptyState, Money, PageHeader, Panel, StatCards } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Recurring",
};

function toDTO(r: RecurringRow): RecurringDTO {
  return {
    id: r.id,
    amount: r.amount,
    currency: r.currency,
    categoryId: r.categoryId,
    description: r.description,
    account: r.account,
    notes: r.notes,
    frequency: r.frequency,
    startOn: r.startOn,
    secondDay: r.secondDay,
    endOn: r.endOn,
    autoPost: r.autoPost,
  };
}

export default async function RecurringPage() {
  const today = todayManila();
  const [rows, incomeCategories, expenseCategories, accounts, fx] = await Promise.all([
    getRecurring(),
    getCategories("income"),
    getCategories("expense"),
    getAccounts(),
    getFx(),
  ]);

  const formCategories = { income: incomeCategories, expense: expenseCategories };
  const categoriesFor = (kind: CashFlowKind) => formCategories[kind].map(({ id, name, archived }) => ({ id, name, archived }));

  const live = rows.filter((r) => !r.paused && r.nextOn != null);
  const perMonth = (kind: CashFlowKind) =>
    live
      .filter((r) => r.kind === kind)
      .reduce((sum, r) => sum + monthlyEquivalent(r.amount, r.frequency) * (fxToPhp(fx, r.currency) ?? 0), 0);
  const income = perMonth("income");
  const expenses = perMonth("expense");

  const due = dueOccurrences(rows, today);
  const upcoming = upcomingOccurrences(rows, today, today, addDays(today, 30));

  const addButton = (kind: CashFlowKind) => (
    <FormSheet
      title={kind === "expense" ? "New recurring expense" : "New recurring income"}
      description={kind === "expense" ? "Rent, bills, subscriptions, loan payments…" : "Salary, allowance, rent you collect…"}
      trigger={
        <Button variant={kind === "expense" ? "default" : "outline"}>
          <Plus /> {kind === "expense" ? "Expense" : "Income"}
        </Button>
      }
    >
      <RecurringForm kind={kind} categories={categoriesFor(kind)} accounts={accounts} />
    </FormSheet>
  );

  const list = (kind: CashFlowKind) => {
    const items = rows.filter((r) => r.kind === kind);
    if (items.length === 0) {
      return (
        <EmptyState title="Nothing yet">
          {kind === "expense" ? "Add rent, bills and subscriptions so they log themselves." : "Add your salary so it logs itself on payday."}
        </EmptyState>
      );
    }
    return (
      <ItemGroup>
        {items.map((r) => {
          const status = r.paused ? "Paused" : r.nextOn == null ? "Ended" : null;
          return (
            <Item key={r.id} size="sm">
              <ItemMedia>
                <Swatch color={r.categoryColor} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>
                  {r.description}
                  {status && <Badge variant="outline">{status}</Badge>}
                  {!status && !r.autoPost && <Badge variant="outline">Confirm</Badge>}
                </ItemTitle>
                <ItemDescription>
                  {[describeSchedule(r), r.categoryName, r.account, !status && r.nextOn ? `Next ${whenLabel(r.nextOn, today)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <div className="flex flex-col items-end font-mono text-sm">
                  <Money value={r.amount} currency={r.currency} />
                  {r.frequency !== "monthly" && (
                    <span className="text-xs text-muted-foreground">
                      ≈ <Money value={monthlyEquivalent(r.amount, r.frequency)} currency={r.currency} />/mo
                    </span>
                  )}
                </div>
                <RowActions
                  name={r.description}
                  editTitle={kind === "expense" ? "Edit recurring expense" : "Edit recurring income"}
                  editForm={<RecurringForm kind={kind} categories={categoriesFor(kind)} accounts={accounts} item={toDTO(r)} />}
                  actions={[
                    r.paused
                      ? { label: "Resume", icon: <Play />, run: setRecurringPaused.bind(null, r.id, false) }
                      : { label: "Pause", icon: <Pause />, run: setRecurringPaused.bind(null, r.id, true) },
                  ]}
                  onDelete={deleteRecurring.bind(null, r.id)}
                  deleteWarning="Entries it already added stay. Nothing new will be added."
                />
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Scheduled" title="Recurring">
        {addButton("income")}
        {addButton("expense")}
      </PageHeader>

      <StatCards
        items={[
          { label: "Net per month", value: <Money value={income - expenses} signed />, primary: true },
          { label: "Income per month", value: <Money value={income} />, hint: `${live.filter((r) => r.kind === "income").length} active` },
          { label: "Fixed costs per month", value: <Money value={expenses} />, hint: `${live.filter((r) => r.kind === "expense").length} active` },
        ]}
      />

      {due.length > 0 && (
        <div className="mb-6">
          <Panel title={`Needs confirming · ${due.length}`}>
            <ItemGroup>
              {due.map(({ item: r, date }) => (
                <Item key={`${r.id}-${date}`} size="sm">
                  <ItemMedia>
                    <Swatch color={r.categoryColor} />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{r.description}</ItemTitle>
                    <ItemDescription>
                      {whenLabel(date, today)} · <Money value={r.amount} currency={r.currency} />
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <DueActions
                      name={r.description}
                      onSkip={skipRecurring.bind(null, r.id, date)}
                      form={
                        <CashFlowForm
                          kind={r.kind}
                          categories={categoriesFor(r.kind)}
                          accounts={accounts}
                          recurring={{ id: r.id, on: date }}
                          defaults={{
                            occurredOn: date,
                            amount: r.amount,
                            currency: r.currency,
                            categoryId: r.categoryId,
                            description: r.description,
                            account: r.account,
                            notes: r.notes,
                          }}
                        />
                      }
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </Panel>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <Panel title="Income">{list("income")}</Panel>
          <Panel title="Expenses">{list("expense")}</Panel>
        </div>
        <div className="lg:col-span-2">
          <Panel title="Next 30 days">
            {upcoming.length === 0 ? <EmptyState title="Nothing scheduled" /> : <OccurrenceList items={upcoming} today={today} />}
          </Panel>
        </div>
      </div>
    </>
  );
}
