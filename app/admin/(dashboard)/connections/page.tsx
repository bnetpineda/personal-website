import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getCategories, getConnections, getDebts, getFx, getManualAccounts, getStatementBalances, getStatementImports } from "@/lib/dal";
import { fxToPhp, holdingMetrics } from "@/lib/finance/calc";
import { PROVIDER_META, untriedAccounts } from "@/lib/finance/connections/meta";
import { dayLabel, daysBetween, fullDayLabel, todayManila } from "@/lib/finance/dates";
import { env } from "@/lib/env";
import { ConnectedAccounts } from "../../_components/connected-accounts";
import { SyncConnectionsButton } from "../../_components/connection-controls";
import { ImportStatementsButton } from "../../_components/import-controls";
import type { PlannerDebt } from "../../_components/debt-planner";
import { ManualBalances, type DebtDTO, type ManualAccountDTO } from "../../_components/manual-balances";
import { PageHeader } from "../../_components/ui";

export const metadata: Metadata = { title: "Accounts" };
export const maxDuration = 120;

/** A value typed in by hand this long ago is worth a look. */
const STALE_MANUAL_DAYS = 60;

export default async function ConnectionsPage() {
  const [connections, fx, statements, balances, manual, debts, expenseCategories] = await Promise.all([getConnections(), getFx(), getStatementImports(), getStatementBalances(), getManualAccounts(), getDebts(), getCategories("expense")]);
  const untried = untriedAccounts(connections);
  const today = todayManila();
  const updated = (at: Date) => {
    const day = todayManila(at);
    return { updated: `updated ${fullDayLabel(day)}`, stale: daysBetween(day, today) > STALE_MANUAL_DAYS };
  };
  const manualRows: ManualAccountDTO[] = manual.map((h) => ({
    id: h.id, name: h.name, assetClass: h.assetClass, value: holdingMetrics(h, fx).value, currency: h.currency,
    platform: h.platform, notes: h.notes, archived: h.archived, ...updated(h.priceUpdatedAt ?? h.updatedAt),
  }));
  const debtRows: DebtDTO[] = debts.map((l) => ({
    id: l.id, kind: l.kind, name: l.name, lender: l.lender, balance: l.balance, currency: l.currency, creditLimit: l.creditLimit,
    interestRate: l.interestRate, dueDay: l.dueDay, minPayment: l.minPayment, notes: l.notes, archived: l.archived, ...updated(l.updatedAt),
  }));
  // The payoff plan works in PHP at today's rate; a debt without a rate waits until one loads.
  const missingFx = new Set<string>();
  const planDebts: PlannerDebt[] = debts.filter((l) => !l.archived && l.balance > 0).flatMap((l) => {
    const rate = fxToPhp(fx, l.currency);
    if (rate == null) { missingFx.add(l.currency); return []; }
    return [{ id: l.id, name: l.name, balance: l.balance * rate, rate: l.interestRate, minPayment: l.minPayment == null ? null : l.minPayment * rate }];
  });
  const categories = expenseCategories.map(({ id, name, color, archived }) => ({ id, name, color, archived }));
  return <>
    <PageHeader title="Accounts">
      <Button asChild variant="outline" size="sm"><Link href="/admin/connections/activity"><ListChecks /> Bank activity</Link></Button>
      <ImportStatementsButton />
      <SyncConnectionsButton disabled={!connections.some((c) => c.enabled)} />
    </PageHeader>
    <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
      Connected accounts are set to update every day at 6 AM Manila time. Wise, MariBank and GoTyme update when you upload a statement: pick or drop them anywhere, any mix, and each is matched to its bank. Other accounts and debts keep the value you last entered.
    </p>
    {untried.length > 0 && <Alert variant="warning" className="mb-6"><AlertTitle>Daily sync doesn&apos;t seem to be running</AlertTitle>
      <AlertDescription>Last tried: {untried.map((c) => `${PROVIDER_META[c.provider].name} ${dayLabel(todayManila(c.lastAttemptAt ?? c.lastSyncedAt!))}`).join(", ")}. Sync by hand for now; the daily job needs checking in Vercel.</AlertDescription></Alert>}
    {!env.cronSecret() && <Alert variant="warning" className="mb-6"><AlertTitle>Daily sync needs setup</AlertTitle>
      <AlertDescription>Set CRON_SECRET in the hosting environment to enable the daily job. Manual sync is available after connecting.</AlertDescription></Alert>}
    <ConnectedAccounts connections={connections} fx={fx} statements={statements} balances={balances} />
    <ManualBalances accounts={manualRows} debts={debtRows} categories={categories} today={today} plan={{ debts: planDebts, missingFx: [...missingFx] }} />
  </>;
}
