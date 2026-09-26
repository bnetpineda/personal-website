import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { ArrowRight, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { getAccounts, getCategories, getConnections, getFx, getImportedIncome, getMonthlyTotals, getStatementBalances, getRecentCashFlows, getRecurring, getSnapshots } from "@/lib/dal";
import { computeNetWorth, monthlySeries, savingsRate } from "@/lib/finance/calc";
import type { CashFlowKind } from "@/lib/finance/constants";
import { PROVIDER_META, includedPositions, isConnectionStale } from "@/lib/finance/connections/types";
import { addDays, currentMonth, dayLabel, monthLabel, timeAgo, todayManila } from "@/lib/finance/dates";
import { getNotifications } from "@/lib/finance/notifications-dal";
import { dueOccurrences } from "@/lib/finance/recurrence";
import { importedIncomeSince, monthlyIncome, repeatPayers } from "@/lib/finance/repeat-income";
import { statementPositions } from "@/lib/finance/statement-balances";
import { ensureTodaySnapshot } from "@/lib/finance/service";
import { deleteCashFlow, restoreCashFlow } from "../_actions/cash-flows";
import { CashFlowForm, type FormCategory } from "../_components/cash-flow-form";
import { SyncConnectionsButton } from "../_components/connection-controls";
import { DismissNotificationButton } from "../_components/notification-controls";
import { DuePanel } from "../_components/recurring";
import { EditableRow } from "../_components/row-actions";
import { EmptyState, MissingFxAlert, Money, PageHeader, Panel, Pct, StatCards } from "../_components/ui";

export const metadata: Metadata = {
  title: "Home",
};
export const maxDuration = 120;

export default async function HomePage() {
  const now = new Date();
  const today = todayManila(now);
  const month = currentMonth(now);

  const [connections, fx, snapshots, monthly, recent, recurring, allCategories, accounts, alerts, received, balances] = await Promise.all([
    getConnections(),
    getFx(),
    getSnapshots(),
    getMonthlyTotals(month, 1),
    getRecentCashFlows(8),
    getRecurring(),
    getCategories(),
    getAccounts(),
    getNotifications(),
    getImportedIncome(importedIncomeSince(today)),
    getStatementBalances(),
  ]);
  const formCategories: Record<CashFlowKind, FormCategory[]> = { expense: [], income: [] };
  for (const c of allCategories) formCategories[c.kind].push({ id: c.id, name: c.name, color: c.color, archived: c.archived });

  // Backfill today's history point after responding, in case the daily cron hasn't run yet.
  after(async () => {
    try {
      await ensureTodaySnapshot();
    } catch (err) {
      console.error("[admin] ensureTodaySnapshot failed", err);
    }
  });

  const nw = computeNetWorth([], [], fx, [...includedPositions(connections), ...statementPositions(balances)]);
  // Banks without an API: their latest statement's closing balances, one row per bank.
  const banks = [...new Set(balances.map((b) => b.provider))].map((provider) => {
    const mine = balances.filter((b) => b.provider === provider);
    return { provider, total: computeNetWorth([], [], fx, statementPositions(mine)), asOf: mine.map((b) => b.asOf).sort().at(-1)!, currencies: mine.map((b) => b.currency) };
  });
  const [thisMonth] = monthlySeries(month, 1, monthly);
  const rate = savingsRate(thisMonth.income, thisMonth.expense);
  const monthAgo = [...snapshots].reverse().find((s) => s.snapshotDate <= addDays(today, -30));
  const change = monthAgo ? nw.netWorthPhp - monthAgo.netWorthPhp : null;

  // What you earn per month now, read from imported statements and income schedules.
  const payers = repeatPayers(received);
  const income = monthlyIncome(fx, recurring, payers);

  const due = dueOccurrences(recurring, today);
  const needsYou = alerts.filter((a) => !a.dismissed);

  return (
    <>
      <PageHeader eyebrow="Finance" title="Home">
        <SyncConnectionsButton disabled={!connections.some((c) => c.enabled)} />
      </PageHeader>

      <MissingFxAlert currencies={[...new Set([...nw.missingFx, ...income.missing])]} />

      <StatCards
        items={[
          {
            label: "Net worth",
            value: <Money value={nw.netWorthPhp} />,
            hint: change != null ? <><Money value={change} signed /> vs 30 days ago</> : "vs 30 days ago: —",
            primary: true,
          },
          {
            label: "Monthly income",
            value: <Money value={income.total} />,
            hint: payers.length ? `${payers.slice(0, 2).map((p) => p.name).join(", ")}${payers.length > 2 ? ` +${payers.length - 2} more` : ""} · last paid ${dayLabel(payers.map((p) => p.lastOn).sort().at(-1)!)}` : "Import a statement to see it",
          },
          { label: `In · ${monthLabel(month, "short")}`, value: <Money value={thisMonth.income} /> },
          {
            label: `Out · ${monthLabel(month, "short")}`,
            value: <Money value={thisMonth.expense} />,
            hint: rate != null ? <>Saved <Pct value={rate} /></> : "Savings rate: —",
          },
        ]}
      />

      {needsYou.length > 0 && (
        <div className="mb-6">
          <Panel title={`Needs you · ${needsYou.length}`}>
            <ItemGroup>
              {needsYou.map((a) => (
                <Item key={a.key} size="sm">
                  <ItemContent>
                    <ItemTitle>
                      {a.title}
                      <Badge variant={a.severity}>{a.severity === "destructive" ? "Urgent" : "Check"}</Badge>
                    </ItemTitle>
                    <ItemDescription>{a.detail}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button asChild variant="outline" size="sm">
                      <Link href={a.href}>Review</Link>
                    </Button>
                    <DismissNotificationButton alertKey={a.key} dismissed={false} />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </Panel>
        </div>
      )}

      {due.length > 0 && (
        <div className="mb-6">
          <DuePanel due={due} today={today} categories={formCategories} accounts={accounts} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Accounts"
          action={
            connections.length + banks.length > 0 ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/holdings">
                  Holdings <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/connections">
                  <Link2 /> Connect
                </Link>
              </Button>
            )
          }
        >
          {connections.length + banks.length === 0 ? (
            <EmptyState title="No accounts connected">Connect Binance or IBKR once and balances update by themselves every day. Wise comes in as statement CSVs.</EmptyState>
          ) : (
            <ItemGroup>
              {connections.map((c) => {
                const total = computeNetWorth([], [], fx, c.snapshot?.positions ?? []);
                const attention = Boolean(c.error || c.historyError || isConnectionStale(c, now));
                const status = !c.enabled
                  ? "Sync paused"
                  : c.lastSyncedAt
                    ? `Synced ${timeAgo(c.lastSyncedAt, now)}`
                    : "Not synced yet";
                return (
                  <Item key={c.provider} size="sm" asChild>
                    <Link href="/admin/connections">
                      <ItemContent>
                        <ItemTitle>
                          {PROVIDER_META[c.provider].name}
                          {attention && <Badge variant="warning">Check</Badge>}
                        </ItemTitle>
                        <ItemDescription>
                          {status}
                          {!c.includeInNetWorth && " · not in net worth"}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <span className="font-mono text-sm">{c.snapshot ? <Money value={total.netWorthPhp} /> : "—"}</span>
                      </ItemActions>
                    </Link>
                  </Item>
                );
              })}
              {banks.map((b) => (
                <Item key={b.provider} size="sm" asChild>
                  <Link href="/admin/connections">
                    <ItemContent>
                      <ItemTitle>{PROVIDER_META[b.provider].name}</ItemTitle>
                      <ItemDescription>Statement balance · {dayLabel(b.asOf)} · {b.currencies.join(", ")}</ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <span className="font-mono text-sm"><Money value={b.total.netWorthPhp} /></span>
                    </ItemActions>
                  </Link>
                </Item>
              ))}
            </ItemGroup>
          )}
        </Panel>

        <Panel
          title="Recent"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/transactions">
                All <ArrowRight />
              </Link>
            </Button>
          }
        >
          {recent.length === 0 ? (
            <EmptyState title="Nothing yet">Synced and imported transactions show up here once they&apos;re filed.</EmptyState>
          ) : (
            <ItemGroup>
              {recent.map((r) => (
                <EditableRow
                  key={r.id}
                  name={r.description}
                  editTitle={r.kind === "expense" ? "Edit expense" : "Edit income"}
                  editForm={
                    <CashFlowForm
                      kind={r.kind}
                      categories={formCategories[r.kind]}
                      accounts={accounts}
                      defaults={{ occurredOn: r.occurredOn }}
                      entry={{
                        id: r.id,
                        occurredOn: r.occurredOn,
                        amount: r.amount,
                        currency: r.currency,
                        categoryId: r.categoryId,
                        description: r.description,
                        account: r.account,
                        notes: r.notes,
                      }}
                    />
                  }
                  onDelete={deleteCashFlow.bind(null, r.id)}
                  onRestore={restoreCashFlow}
                  media={
                    <ItemMedia>
                      <Swatch color={r.categoryColor} />
                    </ItemMedia>
                  }
                  aside={
                    <span className="font-mono text-sm">
                      <Money value={r.kind === "expense" ? -r.amountPhp : r.amountPhp} signed tone />
                    </span>
                  }
                >
                  <ItemContent>
                    <ItemTitle>{r.description}</ItemTitle>
                    <ItemDescription>
                      {dayLabel(r.occurredOn)} · {r.categoryName}
                    </ItemDescription>
                  </ItemContent>
                </EditableRow>
              ))}
            </ItemGroup>
          )}
        </Panel>
      </div>
    </>
  );
}
