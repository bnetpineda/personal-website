import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getConnections, getFx, getStatementBalances, getStatementImports } from "@/lib/dal";
import { PROVIDER_META, untriedAccounts } from "@/lib/finance/connections/types";
import { dayLabel, todayManila } from "@/lib/finance/dates";
import { env } from "@/lib/env";
import { ConnectedAccounts } from "../../_components/connected-accounts";
import { SyncConnectionsButton } from "../../_components/connection-controls";
import { PageHeader } from "../../_components/ui";

export const metadata: Metadata = { title: "Accounts" };
export const maxDuration = 120;

export default async function ConnectionsPage() {
  const [connections, fx, statements, balances] = await Promise.all([getConnections(), getFx(), getStatementImports(), getStatementBalances()]);
  const untried = untriedAccounts(connections);
  return <>
    <PageHeader title="Accounts">
      <SyncConnectionsButton disabled={!connections.some((c) => c.enabled)} />
    </PageHeader>
    <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
      Connected accounts are set to update every day at 6 AM Manila time. Wise and MariBank update when you upload a statement.
    </p>
    {untried.length > 0 && <Alert variant="warning" className="mb-6"><AlertTitle>Daily sync doesn&apos;t seem to be running</AlertTitle>
      <AlertDescription>Last tried: {untried.map((c) => `${PROVIDER_META[c.provider].name} ${dayLabel(todayManila(c.lastAttemptAt ?? c.lastSyncedAt!))}`).join(", ")}. Sync by hand for now; the daily job needs checking in Vercel.</AlertDescription></Alert>}
    {!env.cronSecret() && <Alert variant="warning" className="mb-6"><AlertTitle>Daily sync needs setup</AlertTitle>
      <AlertDescription>Set CRON_SECRET in the hosting environment to enable the daily job. Manual sync is available after connecting.</AlertDescription></Alert>}
    <ConnectedAccounts connections={connections} fx={fx} statements={statements} balances={balances} />
  </>;
}
