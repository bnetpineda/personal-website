import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { connectedHoldingMetrics, isSmallHolding, type FxTable } from "@/lib/finance/calc";
import { ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { isConnectionStale, PROVIDER_META, type ConnectionView } from "@/lib/finance/connections/types";
import { dayLabel, timeAgo } from "@/lib/finance/dates";
import { formatQty } from "@/lib/finance/format";
import type { HoldingCost } from "@/lib/finance/imports/holding-costs";
import { SyncConnectionsButton } from "./connection-controls";
import { ImportHoldingCostsButton } from "./history-controls";
import { BinanceCostDetails } from "./holding-cost-details";
import { Money, Pct } from "./ui";

/** Render saved provider positions directly, so sync never creates duplicate manual holdings. */
export function SyncedHoldings({ connections, fx, filter, now, showSmall, binanceCosts }: {
  connections: ConnectionView[]; fx: FxTable; filter: AssetClass | null; now: Date; showSmall: boolean; binanceCosts: HoldingCost[];
}) {
  const costs = new Map(binanceCosts.map((cost) => [cost.symbol, cost]));
  return <section aria-label="Synced holdings" className="mb-8 flex flex-col gap-4">
    {connections.map((connection) => {
      const { provider, snapshot } = connection;
      const positions = (snapshot?.positions ?? []).filter((position) => (!filter || position.assetClass === filter) &&
        (showSmall || !isSmallHolding(position.marketValue, position.currency, fx)))
        .sort((a, b) => Number(a.marketValue == null) - Number(b.marketValue == null));
      if (snapshot && positions.length === 0 && (filter || snapshot.positions.length > 0)) return null;
      const stale = isConnectionStale(connection, now);
      const status = connection.syncing ? "Syncing" : !connection.enabled ? "Paused"
        : connection.error ? "Sync failed" : !snapshot ? "Awaiting sync" : stale ? "Stale" : "Synced";
      return <Card key={provider} data-provider={provider}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{PROVIDER_META[provider].name} holdings</CardTitle>
              <Badge variant={connection.error || stale ? "warning" : connection.enabled ? "success" : "outline"}>{status}</Badge>
            </div>
            <SyncConnectionsButton provider={provider} disabled={!connection.enabled || connection.syncing} />
          </div>
          <CardDescription>
            {PROVIDER_META[provider].scope} · {positions.length} positions · {connection.includeInNetWorth ? "Included in totals" : "Excluded from totals"}
            {connection.lastSyncedAt && ` · Last synced ${timeAgo(connection.lastSyncedAt, now)}`}
            {provider === "ibkr" && snapshot && ` · Statement ${dayLabel(snapshot.asOf.slice(0, 10))}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {provider === "binance" && <div className="flex flex-col gap-2">
            <ImportHoldingCostsButton disabled={!connection.enabled || connection.syncing || !snapshot} />
            <p className="text-xs text-muted-foreground">Import buys and sells from up to 20 supported USDT Spot pairs for your current coins. Costs stay in the currency paid. Other pairs can be added in <Link href="/admin/history" className="underline">Investment history</Link>.</p>
          </div>}
          {connection.error && <p role="status" className="text-sm text-destructive">{connection.error}</p>}
          {stale && snapshot && <p className="text-sm text-warning">Showing the last saved balances. Sync this account for an update.</p>}
          {connection.historyError && <p className="text-sm text-muted-foreground">
            Saved balances are available. Transaction history needs attention in <Link href="/admin/connections" className="underline">Connections</Link>.
          </p>}
          {!connection.includeInNetWorth && <p className="text-sm text-muted-foreground">
            These positions are visible here. Enable Include in net worth in <Link href="/admin/connections" className="underline">Connections</Link> to count them in totals.
          </p>}
          {positions.length === 0 ? <p className="text-sm text-muted-foreground">
            {snapshot ? "The latest sync returned no holdings." : "Sync this account to load its holdings."}
          </p> : <>
            <ItemGroup className="md:hidden">
              {positions.map((position) => {
                const metrics = connectedHoldingMetrics(position, fx);
                return <Item key={position.id} size="sm" data-synced-position={`${provider}:${position.id}`}>
                  <ItemMedia><Swatch color={ASSET_CLASS_META[position.assetClass].color} /></ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle>{position.name}</ItemTitle>
                    <ItemDescription>
                      <span className="group-data-[private=true]/shell:blur-sm">{formatQty(position.quantity)}</span> {position.symbol}
                    </ItemDescription>
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {provider === "binance" && costs.has(position.symbol) ? <BinanceCostDetails cost={costs.get(position.symbol)!} /> :
                        <span>Cost basis: {position.costBasis == null ? "Unknown" : <Money value={position.costBasis} currency={position.currency} />}</span>}
                      <span>P/L: {metrics.pnl == null ? "Unknown" : <Money value={metrics.pnl} currency={position.currency} signed tone />}</span>
                    </div>
                  </ItemContent>
                  <div className="flex flex-col items-end gap-1 font-mono text-sm">
                    {position.marketValue == null ? <span className="text-muted-foreground">Price unavailable</span> : <>
                      <Money value={position.marketValue} currency={position.currency} />
                      {position.currency !== "PHP" && <span className="text-xs text-muted-foreground">
                        {metrics.valuePhp == null ? "No FX rate" : <Money value={metrics.valuePhp} />}
                      </span>}
                    </>}
                  </div>
                </Item>;
              })}
            </ItemGroup>
            <div className="hidden md:block">
              <Table aria-label={`${PROVIDER_META[provider].name} synced holdings`}>
                <TableHeader><TableRow>
                  <TableHead>Holding / wallet</TableHead><TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Value</TableHead><TableHead className="text-right">{provider === "binance" ? "Trade cost (FIFO)" : "Cost basis"}</TableHead>
                  <TableHead className="text-right">Unrealized P/L</TableHead>
                </TableRow></TableHeader>
                <TableBody>{positions.map((position) => {
                  const metrics = connectedHoldingMetrics(position, fx);
                  return <TableRow key={position.id} data-synced-position={`${provider}:${position.id}`}>
                    <TableCell><div className="flex items-center gap-3">
                      <Swatch color={ASSET_CLASS_META[position.assetClass].color} />
                      <div className="flex flex-col gap-1"><span className="font-semibold">{position.name}</span>
                        <span className="text-xs text-muted-foreground">{ASSET_CLASS_META[position.assetClass].label} · {position.symbol}</span>
                      </div>
                    </div></TableCell>
                    <TableCell className="text-right font-mono"><span className="group-data-[private=true]/shell:blur-sm">{formatQty(position.quantity)}</span></TableCell>
                    <TableCell className="text-right font-mono">
                      {position.marketValue == null ? "Price unavailable" : <div className="flex flex-col items-end">
                        <Money value={position.marketValue} currency={position.currency} />
                        {position.currency !== "PHP" && <span className="text-xs text-muted-foreground">
                          {metrics.valuePhp == null ? "No FX rate" : <Money value={metrics.valuePhp} />}
                        </span>}
                      </div>}
                    </TableCell>
                    <TableCell className="text-right font-mono">{provider === "binance" && costs.has(position.symbol) ?
                      <BinanceCostDetails cost={costs.get(position.symbol)!} /> :
                      position.costBasis == null ? "Unknown" : <Money value={position.costBasis} currency={position.currency} />}</TableCell>
                    <TableCell className="text-right font-mono">
                      {metrics.pnl == null ? "Unknown" : <div className="flex flex-col items-end">
                        <Money value={metrics.pnlPhp ?? metrics.pnl} currency={metrics.pnlPhp != null ? "PHP" : position.currency} signed tone />
                        <span className="text-xs"><Pct value={metrics.pnlPct} tone /></span>
                      </div>}
                    </TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </div>
          </>}
          {snapshot?.warnings.map((warning) => <p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}
          <Button asChild variant="link" className="self-start"><Link href="/admin/connections">Manage {PROVIDER_META[provider].name} connection</Link></Button>
        </CardContent>
      </Card>;
    })}
  </section>;
}
