import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getConnections, getFx } from "@/lib/dal";
import { env } from "@/lib/env";
import { ConnectedAccounts } from "../../_components/connected-accounts";
import { SyncConnectionsButton } from "../../_components/connection-controls";
import { PageHeader } from "../../_components/ui";

export const metadata: Metadata = { title: "Account connections" };
export const maxDuration = 120;

export default async function ConnectionsPage() {
  const [connections, fx] = await Promise.all([getConnections(), getFx()]);
  return <>
    <PageHeader eyebrow="Automatic tracking" title="Connections" back={{ href: "/admin/settings", label: "Settings" }}>
      <SyncConnectionsButton disabled={!connections.some((c) => c.enabled)} />
    </PageHeader>
    <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
      Connect your accounts once to keep balances and investments up to date. Scheduled sync runs daily at 6 AM Manila time on Vercel;
      use Sync now whenever you need an update. IBKR uses the latest completed daily statement.
    </p>
    {!env.cronSecret() && <Alert variant="warning" className="mb-6"><AlertTitle>Daily sync needs setup</AlertTitle>
      <AlertDescription>Set CRON_SECRET in the hosting environment to enable the daily job. Manual sync is available after connecting.</AlertDescription></Alert>}
    <ConnectedAccounts connections={connections} fx={fx} />
  </>;
}
