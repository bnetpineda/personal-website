import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeNetWorth, fxToPhp, type FxTable } from "@/lib/finance/calc";
import { SYNC_PROVIDERS, PROVIDER_META, isConnectionStale, type ConnectionView } from "@/lib/finance/connections/types";
import { dayLabel, timeAgo } from "@/lib/finance/dates";
import { formatQty } from "@/lib/finance/format";
import { ConnectAccountButton, ConnectionSettings, CredentialExpiryButton, SyncConnectionsButton } from "./connection-controls";
import { ImportWiseButton } from "./import-controls";
import { Money } from "./ui";

export function ConnectedAccounts({ connections, fx }: { connections: ConnectionView[]; fx: FxTable }) {
  const now = new Date();
  return (
    <section aria-label="Connected accounts" className="mb-6 flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {SYNC_PROVIDERS.map((provider) => {
          const meta = PROVIDER_META[provider];
          const connection = connections.find((c) => c.provider === provider);
          const snapshot = connection?.snapshot;
          const total = computeNetWorth([], [], fx, snapshot?.positions ?? []);
          const hasValuation = snapshot?.positions.length === 0 || snapshot?.positions.some((p) => p.marketValue != null && fxToPhp(fx, p.currency) != null);
          const stale = connection ? isConnectionStale(connection, now) : false;
          const status = !connection ? "Not connected"
            : connection.syncing ? "Syncing" : !connection.enabled ? "Paused" : connection.error || connection.historyError ? "Needs attention"
              : stale ? "Stale" : "Synced";
          const attention = Boolean(connection?.error || connection?.historyError || stale);
          return (
            <Card key={provider}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{meta.name}</CardTitle>
                  <Badge variant={attention ? "warning" : connection?.lastSyncedAt && connection.enabled ? "success" : "outline"}>{status}</Badge>
                </div>
                <CardDescription>{meta.scope}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {snapshot ? <>
                  <p className="font-display text-2xl tabular-nums">{hasValuation ? <Money value={total.netWorthPhp} /> : "Awaiting prices"}</p>
                  <p className="text-xs text-muted-foreground">
                    {snapshot.positions.length} balances / positions · {connection?.includeInNetWorth ? "Included in net worth" : "Separate from net worth"}
                    {provider === "ibkr" && <> · Statement {dayLabel(snapshot.asOf.slice(0, 10))}</>}
                  </p>
                  {(total.missingFx.length > 0 || total.missingPrices.length > 0) && (
                    <p className="text-sm text-warning">Partial total: some balances are missing prices or exchange rates.</p>
                  )}
                </> : <p className="text-sm text-muted-foreground">{meta.description} Connect once to start syncing.</p>}
                {connection?.lastSyncedAt && <p className="font-mono text-xs text-muted-foreground">Last synced {timeAgo(connection.lastSyncedAt, now)}</p>}
                {connection?.error && connection.lastAttemptAt && <p className="font-mono text-xs text-muted-foreground">Last attempt {timeAgo(connection.lastAttemptAt, now)}</p>}
                {stale && snapshot && <p className="text-sm text-warning">Showing older saved balances.</p>}
                {connection?.error && <p role="status" className="text-sm text-destructive">{connection.error}</p>}
                {connection?.historyError && <p role="status" className="text-sm text-warning">History: {connection.historyError}</p>}
                {connection?.historyCoverage && <p className="text-xs text-muted-foreground">Last history window: {connection.historyCoverage.from} – {connection.historyCoverage.to}. <Link href="/admin/earnings" className="underline">Coverage details</Link></p>}
                {connection ? <>
                  <SyncConnectionsButton provider={provider} disabled={!connection.enabled || connection.syncing} />
                  <ConnectionSettings provider={provider} enabled={connection.enabled} included={connection.includeInNetWorth} hasSnapshot={Boolean(snapshot)} />
                  <p className="text-xs text-muted-foreground">Credential expiry: {connection.credentialsExpireOn ?? "No reminder set"}</p>
                  <CredentialExpiryButton provider={provider} expiresOn={connection.credentialsExpireOn} />
                </> : <ConnectAccountButton provider={provider} />}
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardHeader>
            <CardTitle>{PROVIDER_META.wise.name}</CardTitle>
            <CardDescription>{PROVIDER_META.wise.scope}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{PROVIDER_META.wise.description} Wise does not share personal-account activity through its API, so there is nothing to sync.</p>
            <ImportWiseButton />
            <p className="text-xs text-muted-foreground">Select or drag all your Wise statement CSVs at once, one per currency. They import and categorize in one step.</p>
            <a href={PROVIDER_META.wise.docs} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-4">How to download a Wise statement</a>
          </CardContent>
        </Card>
      </div>
      {connections.filter((c) => c.snapshot).map((connection) => (
        <Card key={connection.provider}>
          <CardHeader>
            <CardTitle>{PROVIDER_META[connection.provider].name} balances</CardTitle>
            <CardDescription>Amounts are in the listed currency. Missing cost basis stays unknown.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {connection.snapshot!.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
            {connection.snapshot!.positions.length === 0 ? <p className="text-sm text-muted-foreground">The latest sync returned no balances or open positions.</p> : (
              <Table>
                <TableHeader><TableRow><TableHead>Balance / investment</TableHead><TableHead>Currency</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="text-right">Cost basis</TableHead></TableRow></TableHeader>
                <TableBody>{connection.snapshot!.positions.map((p) => <TableRow key={p.id}>
                  <TableCell>{p.name}</TableCell><TableCell>{p.currency}</TableCell>
                  <TableCell className="text-right font-mono"><span className="group-data-[private=true]/shell:blur-sm">{formatQty(p.quantity)}</span></TableCell>
                  <TableCell className="text-right font-mono">{p.marketValue == null ? "Price unavailable" : <Money value={p.marketValue} currency={p.currency} />}</TableCell>
                  <TableCell className="text-right font-mono">{p.costBasis == null ? "Unknown" : <Money value={p.costBasis} currency={p.currency} />}</TableCell>
                </TableRow>)}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function ConnectedValuationNotice({ missingPrices, missingCostBasis }: { missingPrices: string[]; missingCostBasis: string[] }) {
  if (missingPrices.length === 0 && missingCostBasis.length === 0) return null;
  return <Alert variant="warning" className="mb-6">
    <AlertTitle>Some account data is unavailable</AlertTitle>
    <AlertDescription>
      {missingPrices.length > 0 && `${missingPrices.length} synced positions have no price and are excluded from totals. `}
      {missingCostBasis.length > 0 && "Cost basis and unrealized P/L cover only positions with a known cost. "}
      <Link href="/admin/connections" className="underline underline-offset-4">Review connected balances</Link>
    </AlertDescription>
  </Alert>;
}
