import type { Metadata } from "next";
import { Pause, Play, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { CalendarPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  getAccounts,
  getCategories,
  getFx,
  getGoals,
  getImportedFlows,
  getManualAccounts,
  getMonthlyTotals,
  getRecurring,
  getStatementBalances,
  getStatementImports,
  type RecurringRow,
} from "@/lib/dal";
import { computeNetWorth, fxToPhp, monthlySeries, sumInPhp } from "@/lib/finance/calc";
import type { CashFlowKind } from "@/lib/finance/constants";
import { dashboardMonth } from "@/lib/finance/dashboard";
import { addDays, addMonths, dayLabel, shortDayLabel, todayManila } from "@/lib/finance/dates";
import { cashForecast, unscheduledSpending } from "@/lib/finance/forecast";
import { averageMonthlySpending } from "@/lib/finance/goals";
import { describeSchedule, dueOccurrences, monthlyEquivalent, upcomingOccurrences } from "@/lib/finance/recurrence";
import { importedIncomeSince, nextMonthSameDay, repeatPayers, subscriptions, typicalIncome } from "@/lib/finance/repeat-income";
import { statementPositions } from "@/lib/finance/statement-balances";
import { deleteRecurring, setRecurringPaused } from "../../_actions/recurring";
import { CashForecastChart } from "../../_components/cash-forecast";
import type { FormCategory } from "../../_components/cash-flow-form";
import { FormSheet } from "../../_components/form";
import { DuePanel, OccurrenceList, whenLabel } from "../../_components/recurring";
import { RecurringForm, type RecurringDTO } from "../../_components/recurring-form";
import { EditableRow } from "../../_components/row-actions";
import { TERMS } from "../../_components/labels";
import { EmptyState, InfoNote, MissingFxAlert, Money, PageHeader, Panel, StatCards } from "../../_components/ui";

/** How far ahead the cash forecast looks. */
const FORECAST_DAYS = 90;
/** The monthly date on or after `today`, stepping on from `day` a month at a time. */
function firstOnOrAfter(day: string, today: string): string {
  let next = day;
  while (next < today) next = nextMonthSameDay(next);
  return next;
}

/** Spending is averaged over this many closed months, as on Goals. */
const SPENDING_MONTHS = 6;

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

/** Server Actions run under the calling page's limit (⌘K can sync from any page); see lib/finance/deadline.ts. */
export const maxDuration = 120;

export default async function RecurringPage() {
  const today = todayManila();
  const current = today.slice(0, 7);
  const lastClosed = addMonths(current, -1);
  const [rows, incomeCategories, expenseCategories, accounts, fx, received, charged, monthly, statements, balances, manual, goals] = await Promise.all([
    getRecurring(),
    getCategories("income"),
    getCategories("expense"),
    getAccounts(),
    getFx(),
    getImportedFlows("income", importedIncomeSince(today)),
    // Card and bank payments only: exchange fees and trade commissions repeat too, but aren't subscriptions.
    getImportedFlows("expense", importedIncomeSince(today), ["payment"]),
    getMonthlyTotals(lastClosed, SPENDING_MONTHS),
    getStatementImports(),
    getStatementBalances(),
    getManualAccounts(),
    getGoals(),
  ]);

  const toForm = (list: typeof incomeCategories): FormCategory[] => list.map(({ id, name, color, archived }) => ({ id, name, color, archived }));
  const formCategories: Record<CashFlowKind, FormCategory[]> = { income: toForm(incomeCategories), expense: toForm(expenseCategories) };
  const categoriesFor = (kind: CashFlowKind) => formCategories[kind];

  const live = rows.filter((r) => !r.paused && r.nextOn != null);
  const perMonth = (kind: CashFlowKind) =>
    sumInPhp(fx, live.filter((r) => r.kind === kind).map((r) => ({ amount: monthlyEquivalent(r.amount, r.frequency), currency: r.currency })));
  const payers = repeatPayers(received, current);
  // The same estimate as the Overview, so the two pages never disagree about monthly income.
  const income = typicalIncome(fx, rows, payers);
  const scheduledExpenses = perMonth("expense");
  // Charges seen every month in imports, unless a schedule already covers them: they're fixed costs too.
  const subs = subscriptions(charged, current, rows.filter((r) => r.kind === "expense").map((r) => r.description));
  const subsMonthly = sumInPhp(fx, subs.map((s) => ({ amount: s.typical, currency: s.currency })));
  const expenses = { total: scheduledExpenses.total + subsMonthly.total, missing: [...scheduledExpenses.missing, ...subsMonthly.missing] };
  const hasFixed = live.some((r) => r.kind === "expense") || subs.length > 0;

  const due = dueOccurrences(rows, today);
  const upcoming = upcomingOccurrences(rows, today, today, addDays(today, 30));

  // ---- where cash is heading ----
  // Cash you can spend: bank statement balances and cash accounts entered by hand (not exchange balances).
  const cashNow = computeNetWorth(manual.filter((h) => !h.archived && h.assetClass === "cash"), [], fx, statementPositions(balances));
  const hasCash = balances.length > 0 || manual.some((h) => !h.archived && h.assetClass === "cash");
  const spending = averageMonthlySpending(monthlySeries(lastClosed, SPENDING_MONTHS, monthly).map((p) => dashboardMonth(p, statements, current)));
  const forecastMissing = new Set<string>(cashNow.missingFx);
  const scheduled = upcomingOccurrences(rows, today, addDays(today, 1), addDays(today, FORECAST_DAYS)).flatMap(({ item, date }) => {
    const rate = fxToPhp(fx, item.currency);
    if (rate == null) {
      forecastMissing.add(item.currency);
      return [];
    }
    return [{ date, amountPhp: (item.kind === "expense" ? -1 : 1) * item.amount * rate }];
  });
  const importedPay = typicalIncome(fx, [], payers);
  for (const c of importedPay.missing) forecastMissing.add(c);
  const forecast = hasCash
    ? cashForecast({
        today,
        days: FORECAST_DAYS,
        cash: cashNow.byClass.cash ?? 0,
        scheduled,
        income: { low: importedPay.low, average: importedPay.average, high: importedPay.high },
        spending: unscheduledSpending(spending, scheduledExpenses.total),
      })
    : null;
  const emergency = goals.find((g) => !g.archived && g.measure === "emergency_fund");
  const floor = emergency && spending ? emergency.target * spending : null;
  const dips = forecast && floor != null ? forecast.points.find((p) => p.low < floor) : undefined;
  const missingFx = [...new Set([...income.missing, ...expenses.missing, ...forecastMissing])];

  const addButton = (kind: CashFlowKind) => (
    <FormSheet
      title={kind === "expense" ? "New recurring expense" : "New recurring income"}
      description={kind === "expense" ? "Rent, bills, subscriptions, loan payments…" : "Salary, allowance, rent you collect…"}
      trigger={
        <Button variant="outline">
          <Plus /> Schedule {kind === "expense" ? "expense" : "income"}
        </Button>
      }
    >
      <RecurringForm kind={kind} categories={categoriesFor(kind)} accounts={accounts} />
    </FormSheet>
  );

  const list = (kind: CashFlowKind) => {
    const items = rows.filter((r) => r.kind === kind);
    const imported = kind === "income" ? payers : [];
    if (items.length === 0 && imported.length === 0) {
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
            <EditableRow
              key={r.id}
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
              media={
                <ItemMedia>
                  <Swatch color={r.categoryColor} />
                </ItemMedia>
              }
              aside={
                <span className="flex flex-col items-end font-mono text-sm">
                  <Money value={r.amount} currency={r.currency} />
                  {r.frequency !== "monthly" && (
                    <span className="text-xs text-muted-foreground">
                      ≈ <Money value={monthlyEquivalent(r.amount, r.frequency)} currency={r.currency} />/mo
                    </span>
                  )}
                </span>
              }
            >
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
            </EditableRow>
          );
        })}
        {imported.map((p) => (
          <Item key={p.key}>
            <ItemMedia>
              <Swatch color={p.categoryColor} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                {p.name}
                <Badge variant="outline">Imported</Badge>
              </ItemTitle>
              <ItemDescription>
                {[`${p.payments} payments`, p.categoryName, `Last ${dayLabel(p.lastOn)}`].join(" · ")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="flex flex-col items-end font-mono text-sm">
                {/* The average is what the estimate adds up. */}
                <Money value={p.average} currency={p.currency} />
                <span className="text-xs text-muted-foreground">
                  avg / mo · latest <Money value={p.monthly} currency={p.currency} />
                </span>
              </span>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    );
  };

  return (
    <>
      <PageHeader title="Recurring">
        {addButton("income")}
        {addButton("expense")}
      </PageHeader>

      <StatCards
        items={[
          // With no fixed costs added, net would just repeat income and read like money left over.
          ...(hasFixed ? [{ label: "Estimated net / mo", value: <Money value={income.average - expenses.total} signed />, primary: true }] : []),
          { label: "Estimated income / mo", value: <Money value={income.average} />, primary: !hasFixed, hint: [live.some((r) => r.kind === "income") && `${live.filter((r) => r.kind === "income").length} scheduled`, payers.length > 0 && `${payers.length} from imports`].filter(Boolean).join(" · ") || "None yet" },
          {
            label: "Fixed costs per month",
            value: hasFixed ? <Money value={expenses.total} /> : "—",
            hint: hasFixed
              ? [live.some((r) => r.kind === "expense") && `${live.filter((r) => r.kind === "expense").length} scheduled`, subs.length > 0 && `${subs.length} seen every month`].filter(Boolean).join(" · ")
              : "None scheduled or seen in imports yet",
          },
        ]}
      />

      <MissingFxAlert currencies={missingFx} />

      {due.length > 0 && (
        <div className="mb-6">
          <DuePanel due={due} today={today} categories={formCategories} accounts={accounts} />
        </div>
      )}

      <div className="mb-6">
        <Panel
          id="forecast"
          title={`Cash · next ${FORECAST_DAYS} days`}
          action={
            <InfoNote title="How the forecast works">
              <p>It starts from the cash in your bank statements and the cash accounts you entered by hand. Exchange and broker balances aren&apos;t counted.</p>
              <p>Schedules land on their dates. Pay from imported payers and the rest of your spending are spread evenly over each month: spending is your average over the last {SPENDING_MONTHS} complete months, minus what schedules already cover.</p>
              <p>The band runs from the pace of your lowest-paid month to your highest. It&apos;s a projection, not a promise.</p>
              {floor != null && <p>The dashed line is your emergency fund goal: {emergency!.target} months of spending.</p>}
            </InfoNote>
          }
          toolbar={
            forecast ? (
              <p className="text-xs text-muted-foreground">
                Now <Money value={forecast.points[0].expected} compact /> · expected <Money value={forecast.end.expected} compact /> by {shortDayLabel(forecast.end.date)} · low <Money value={forecast.end.low} compact /> · high <Money value={forecast.end.high} compact />
                {forecast.lowest.low < forecast.points[0].low && <> · lowest <Money value={forecast.lowest.low} compact /> on {shortDayLabel(forecast.lowest.date)}</>}
              </p>
            ) : undefined
          }
        >
          {forecast ? (
            <div className="flex flex-col gap-3">
              {spending == null && (
                <Alert variant="warning">
                  <AlertTitle>Spending isn&apos;t taken off yet</AlertTitle>
                  <AlertDescription>It needs two complete months of statements, so for now only schedules come off and the lines run high.</AlertDescription>
                </Alert>
              )}
              {dips && (
                <Alert variant="warning">
                  <AlertTitle>Cash may dip below your emergency fund</AlertTitle>
                  <AlertDescription>
                    At your lowest-paid months&apos; pace it falls under <Money value={floor!} compact /> around {dayLabel(dips.date)}.
                  </AlertDescription>
                </Alert>
              )}
              <CashForecastChart points={forecast.points} floor={floor} />
            </div>
          ) : (
            <EmptyState size="sm" title="No cash balance yet">Import a bank statement or add a cash account to see where your cash is heading.</EmptyState>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <Panel title="Income">{list("income")}</Panel>
          <Panel title={TERMS.spending}>{list("expense")}</Panel>
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Panel title="Next 30 days">
            {upcoming.length === 0 ? <EmptyState title="Nothing scheduled">{payers.length > 0 && "Pay that arrives through imports isn't scheduled; it's counted in the estimate above."}</EmptyState> : <OccurrenceList items={upcoming} today={today} />}
          </Panel>
          <Panel
            id="seen-every-month"
            title="Seen every month"
            action={
              <InfoNote title="Charges that repeat">
                <p>Imported charges of about the same amount, about once a month, in at least two of the last six complete months. They count in fixed costs above.</p>
                <p>Make one a schedule to see it in the next 30 days. It asks before adding each charge, so when your statement import already has it, skip it.</p>
              </InfoNote>
            }
          >
            {subs.length === 0 ? (
              <EmptyState size="sm" title="None spotted">Subscriptions paid by card show up here once two months of statements have them.</EmptyState>
            ) : (
              <ItemGroup>
                {subs.map((s) => (
                  <Item key={s.key} size="sm">
                    <ItemMedia>
                      <Swatch color={s.categoryColor} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{s.name}</ItemTitle>
                      <ItemDescription>{[`${s.payments} charges`, s.categoryName, s.nextOn >= today ? `Next about ${shortDayLabel(s.nextOn)}` : `Last ${shortDayLabel(s.lastOn)}`].join(" · ")}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <span className="font-mono text-sm">
                        <Money value={s.typical} currency={s.currency} />
                      </span>
                      <FormSheet
                        title="Schedule this charge"
                        description="Set to ask before adding each charge: skip it when your statement import already has it."
                        trigger={
                          <Button variant="outline" size="icon-sm" aria-label={`Make ${s.name} a schedule`}>
                            <CalendarPlus />
                          </Button>
                        }
                      >
                        <RecurringForm
                          kind="expense"
                          categories={categoriesFor("expense")}
                          accounts={accounts}
                          defaults={{
                            amount: s.typical,
                            currency: s.currency,
                            categoryId: s.categoryId ?? categoriesFor("expense")[0]?.id ?? 0,
                            description: s.name,
                            account: s.account ?? null,
                            notes: null,
                            frequency: "monthly",
                            // A past date would backfill charges the imports already have.
                            startOn: firstOnOrAfter(s.nextOn, today),
                            secondDay: null,
                            endOn: null,
                            autoPost: false,
                          }}
                        />
                      </FormSheet>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
