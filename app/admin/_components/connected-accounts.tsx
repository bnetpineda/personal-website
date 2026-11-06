import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeNetWorth, fxToPhp, knownCost, type FxTable } from "@/lib/finance/calc";
import { SYNC_PROVIDERS, PROVIDER_META, connectionStatus, needsNewCredentials, plainSyncError, type ConnectionView, type Provider, type SyncProvider } from "@/lib/finance/connections/types";
import { addMonths, currentMonth, dayLabel, dayRangeLabel, fullDayLabel, monthLabel, timeAgo } from "@/lib/finance/dates";
import type { StatementCoverage } from "@/lib/finance/imports/coverage";
import type { StatementBalance } from "@/lib/finance/statement-balances";
import { formatQty } from "@/lib/finance/format";
import { ConnectAccountButton, ConnectionSettings, CredentialExpiryButton, SyncConnectionsButton } from "./connection-controls";
import { FormSheet } from "./form";
import { ImportMariBankButton, ImportWiseButton } from "./import-controls";
import { PrivateRegion } from "./shell";
import { Money, PrivateFigure } from "./ui";

/** What a bank's uploaded statements cover, so a missing month is easy to spot. */
/** The bank's state in the same place as a connected account's: is a statement waiting to be uploaded? */
function statementBadge(coverage: StatementCoverage | undefined, now: Date) {
  if (!coverage) return { label: "Nothing imported", attention: true };
  const lastClosed = addMonths(currentMonth(now), -1);
  return coverage.to < lastClosed ? { label: "Statement due", attention: true } : { label: "Up to date", attention: false };
}

function StatementStatus({ coverage, balances, now }: { coverage?: StatementCoverage; balances: StatementBalance[]; now: Date }) {
  if (!coverage) return <p className="text-sm text-muted-foreground">Nothing imported yet.</p>;
  const asOf = balances.map((b) => b.asOf).sort().at(-1);
  const span = coverage.from === coverage.to ? monthLabel(coverage.from, "short") : `${monthLabel(coverage.from, "short")} – ${monthLabel(coverage.to, "short")}`;
  return <>
    <p className="font-display text-lg">{span}</p>
    <p className="font-mono text-xs text-muted-foreground">{coverage.entries} entries · last upload {timeAgo(coverage.importedAt, now)}</p>
    {asOf ? <p className="text-sm">
      Balance {balances.filter((b) => b.amount !== 0).map((b, i) => <span key={b.currency}>{i > 0 && " · "}<Money value={b.amount} currency={b.currency} /></span>)} on {dayLabel(asOf)}, counted in net worth.
    </p> : <p className="text-sm text-muted-foreground">No balance saved yet: upload your latest statement to count it in net worth.</p>}
    {coverage.missing.length > 0 && <p className="text-sm text-warning">No activity in {coverage.missing.map((m) => monthLabel(m, "short")).join(", ")}. Upload {coverage.missing.length === 1 ? "that statement" : "those statements"} if you have them.</p>}
  </>;
}

/** Everything an account holds: read-only, in its own sheet, so the page stays a list of accounts. */
function BalancesSheet({ connection }: { connection: ConnectionView }) {
  const snapshot = connection.snapshot!;
  return (
    <FormSheet
      wide
      title={`${PROVIDER_META[connection.provider].name} balances`}
      description="As reported by the account, in its own currency. Holdings adds estimates where it can."
      trigger={<Button variant="ghost" size="sm" aria-label={`${PROVIDER_META[connection.provider].name} balances`}>Balances</Button>}
    >
      <PrivateRegion>
        <div className="flex flex-col gap-4">
          {snapshot.warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
          {snapshot.positions.length === 0 ? <p className="text-sm text-muted-foreground">The latest sync returned no balances or open positions.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Holding</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Value</TableHead><TableHead className="text-right">Reported cost</TableHead></TableRow></TableHeader>
              <TableBody>{snapshot.positions.map((p) => <TableRow key={p.id}>
                <TableCell>{p.name}</TableCell>
                {/* Cash is its own value: a quantity would only repeat it with a provider's raw decimals. */}
                <TableCell className="text-right font-mono">{p.assetClass === "cash" ? <span className="text-muted-foreground">—</span> : <PrivateFigure>{formatQty(p.quantity)}</PrivateFigure>}</TableCell>
                <TableCell className="text-right font-mono">{p.marketValue == null ? "No price" : <Money value={p.marketValue} currency={p.currency} />}</TableCell>
                <TableCell className="text-right font-mono">{knownCost(p) == null ? "Not reported" : <Money value={knownCost(p)!} currency={p.currency} />}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          )}
        </div>
      </PrivateRegion>
    </FormSheet>
  );
}

/** Settings an account rarely needs, away from its everyday status and sync. */
function ManageSheet({ provider, connection }: { provider: SyncProvider; connection: ConnectionView }) {
  const name = PROVIDER_META[provider].name;
  return (
    <FormSheet title={`Manage ${name}`} description={PROVIDER_META[provider].description} trigger={<Button variant="ghost" size="sm" aria-label={`Manage ${name}`}>Manage</Button>}>
      <div className="flex flex-col gap-6">
        <ConnectionSettings provider={provider} enabled={connection.enabled} included={connection.includeInNetWorth} hasSnapshot={Boolean(connection.snapshot)} />
        {provider !== "hyperliquid" && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">Credential expiry: {connection.credentialsExpireOn ? fullDayLabel(connection.credentialsExpireOn) : "No reminder set"}</p>
            <CredentialExpiryButton provider={provider} expiresOn={connection.credentialsExpireOn} />
          </div>
        )}
        {connection.historyCoverage && (
          <p className="text-sm text-muted-foreground">
            Latest history update: {dayRangeLabel(connection.historyCoverage.from, connection.historyCoverage.to)}.{" "}
            <Link href="/admin/history" className="underline underline-offset-4">Full history</Link>
          </p>
        )}
      </div>
    </FormSheet>
  );
}

export function ConnectedAccounts({ connections, fx, statements, balances }: {
  connections: ConnectionView[]; fx: FxTable; statements: Partial<Record<Provider, StatementCoverage>>; balances: StatementBalance[];
}) {
  const now = new Date();
  const accounts = SYNC_PROVIDERS.map((provider) => {
    const connection = connections.find((c) => c.provider === provider);
    const status = connection ? connectionStatus(connection, now) : { label: "Not connected", attention: false };
    return { provider, connection, status, attention: status.attention };
  });
  // What needs you comes first; a failing account shouldn't sit below healthy ones.
  const ordered = [...accounts].sort((a, b) => Number(Boolean(b.connection?.error)) - Number(Boolean(a.connection?.error)) || Number(b.attention) - Number(a.attention));

  return (
    <section aria-label="Accounts" className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ordered.map(({ provider, connection, status, attention }) => {
        const meta = PROVIDER_META[provider];
        const snapshot = connection?.snapshot;
        const total = computeNetWorth([], [], fx, snapshot?.positions ?? []);
        const hasValuation = snapshot?.positions.length === 0 || snapshot?.positions.some((p) => p.marketValue != null && fxToPhp(fx, p.currency) != null);
        return (
          <Card key={provider} id={provider} className="scroll-mt-24">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{meta.name}</CardTitle>
                <Badge variant={attention ? "warning" : connection?.lastSyncedAt && connection.enabled ? "success" : "outline"}>{status.label}</Badge>
              </div>
              <CardDescription>{meta.scope}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              {snapshot ? <>
                <p className="font-display text-2xl tabular-nums">{hasValuation ? <Money value={total.netWorthPhp} /> : "Awaiting prices"}</p>
                <p className="text-xs text-muted-foreground">
                  {snapshot.positions.length} holdings · {connection?.includeInNetWorth ? "Counts in net worth" : "Not in net worth"}
                  {connection?.lastSyncedAt && <> · Updated {timeAgo(connection.lastSyncedAt, now)}</>}
                </p>
                {(total.missingFx.length > 0 || total.missingPrices.length > 0) && (
                  <p className="text-sm text-warning">Partial total: some holdings have no price or exchange rate.</p>
                )}
              </> : <p className="text-sm text-muted-foreground">{meta.description} Connect once to start syncing.</p>}
              {attention && snapshot && <p className="text-xs text-muted-foreground">Value and holdings are from that update, at that day&apos;s prices.</p>}
              {connection?.error && connection.lastAttemptAt && <p className="font-mono text-xs text-muted-foreground">Last attempt {timeAgo(connection.lastAttemptAt, now)}</p>}
              {connection?.error && <p role="status" className="text-sm text-destructive">{plainSyncError(meta.name, connection.error)}</p>}
              {connection?.historyError && <p role="status" className="text-sm text-warning">History: {plainSyncError(meta.name, connection.historyError)}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                {connection ? <>
                  {connection.error && needsNewCredentials(connection.error)
                    ? <ConnectAccountButton provider={provider} connected primary />
                    : <SyncConnectionsButton provider={provider} disabled={!connection.enabled || connection.syncing} />}
                  {snapshot && <BalancesSheet connection={connection} />}
                  <ManageSheet provider={provider} connection={connection} />
                </> : <ConnectAccountButton provider={provider} primary />}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Card id="wise" className="scroll-mt-24">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{PROVIDER_META.wise.name}</CardTitle>
            <Badge variant={statementBadge(statements.wise, now).attention ? "warning" : "success"}>{statementBadge(statements.wise, now).label}</Badge>
          </div>
          <CardDescription>{PROVIDER_META.wise.scope}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <StatementStatus coverage={statements.wise} balances={balances.filter((b) => b.provider === "wise")} now={now} />
          <p className="text-xs text-muted-foreground">Select all your CSVs at once, one per currency.</p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <ImportWiseButton />
            <Button asChild variant="link" size="sm">
              <a href={PROVIDER_META.wise.docs} target="_blank" rel="noopener noreferrer">Where to get them</a>
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card id="maribank" className="scroll-mt-24">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{PROVIDER_META.maribank.name}</CardTitle>
            <Badge variant={statementBadge(statements.maribank, now).attention ? "warning" : "success"}>{statementBadge(statements.maribank, now).label}</Badge>
          </div>
          <CardDescription>{PROVIDER_META.maribank.scope}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          <StatementStatus coverage={statements.maribank} balances={balances.filter((b) => b.provider === "maribank")} now={now} />
          <p className="text-xs text-muted-foreground">Select several months at once. Months already imported are skipped.</p>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <ImportMariBankButton />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/** Unpriced positions are left out of every total. Missing cost basis is explained on each account's card. */
export function ConnectedValuationNotice({ missingPrices }: { missingPrices: string[] }) {
  if (missingPrices.length === 0) return null;
  return <Alert variant="warning" className="mb-6">
    <AlertTitle>Some account data is unavailable</AlertTitle>
    <AlertDescription>
      {missingPrices.length} synced positions have no price and are excluded from totals.{" "}
      <Link href="/admin/connections" className="underline underline-offset-4">Review connected balances</Link>
    </AlertDescription>
  </Alert>;
}
