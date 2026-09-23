import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { connectedHoldingMetrics, fxToPhp, isSmallHolding, type FxTable } from "@/lib/finance/calc";
import type { AssetClass } from "@/lib/finance/constants";
import { isConnectionStale, PROVIDER_META, type ConnectionView } from "@/lib/finance/connections/types";
import { timeAgo } from "@/lib/finance/dates";
import { formatQty } from "@/lib/finance/format";
import { binanceHoldingRows, type HoldingCost } from "@/lib/finance/imports/holding-costs";
import { BinanceCostDetails } from "./holding-cost-details";
import { Money, Pct, TokenAmount } from "./ui";

export function SyncedHoldings({ connections, fx, filter, now, showSmall, binanceCosts }: {
  connections: ConnectionView[]; fx: FxTable; filter: AssetClass | null; now: Date; showSmall: boolean; binanceCosts: HoldingCost[];
}) {
  const costs = new Map(binanceCosts.map((cost) => [cost.symbol, cost]));
  const usdRate = fxToPhp(fx, "USD");
  return <section aria-label="Synced holdings" className="mb-6 flex flex-col gap-4">
    {connections.map((connection) => {
      const { provider, snapshot } = connection;
      const all = provider === "binance" ? binanceHoldingRows(snapshot?.positions ?? []) : snapshot?.positions ?? [];
      const positions = all.filter((p) => (!filter || p.assetClass === filter) && (showSmall || !isSmallHolding(p.marketValue, p.currency, fx)))
        .sort((a, b) => (connectedHoldingMetrics(b, fx).valuePhp ?? -Infinity) - (connectedHoldingMetrics(a, fx).valuePhp ?? -Infinity));
      if (snapshot && positions.length === 0 && (filter || snapshot.positions.length > 0)) return null;
      const stale = isConnectionStale(connection, now);
      const rows = positions.map((p) => {
        const cost = provider === "binance" ? costs.get(p.symbol) : undefined;
        const estimate = cost?.pnlEstimate;
        const metrics = connectedHoldingMetrics(p, fx);
        const average = estimate ?? (cost?.lines.length === 1 ? { averageCost: cost.lines[0].averageCost, currency: cost.lines[0].currency } : null);
        const label = cost ? <BinanceCostDetails cost={cost} /> : <span className="font-semibold">{p.name}</span>;
        const avg = average ? <TokenAmount value={average.averageCost} currency={average.currency} /> :
          p.assetClass !== "cash" && p.costBasis != null && p.quantity !== 0 ? <Money value={p.costBasis / p.quantity} currency={p.currency} /> : <span className="text-muted-foreground">—</span>;
        const value = p.marketValue == null ? <span className="text-muted-foreground">—</span> : <Money value={metrics.valuePhp ?? p.marketValue} currency={metrics.valuePhp == null ? p.currency : "PHP"} />;
        const pnl = estimate ? <><span>{usdRate == null ? <TokenAmount value={estimate.pnl} currency="USDT" signed tone /> : <Money value={estimate.pnlUsd * usdRate} signed tone />}</span>
          <span className="text-xs group-data-[private=true]/shell:blur-sm"><Pct value={estimate.pnlPct} tone /></span></> :
          p.assetClass !== "cash" && metrics.pnl != null ? <><Money value={metrics.pnlPhp ?? metrics.pnl} currency={metrics.pnlPhp == null ? p.currency : "PHP"} signed tone />
            <span className="text-xs group-data-[private=true]/shell:blur-sm"><Pct value={metrics.pnlPct} tone /></span></> : <span className="text-muted-foreground">—</span>;
        return { p, label, avg, value, pnl, estimated: Boolean(estimate) };
      });
      return <Card key={provider} data-provider={provider} className="gap-0 overflow-hidden py-0">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{PROVIDER_META[provider].name}</CardTitle>
            <div className="flex items-center gap-2">
              {!connection.includeInNetWorth && <Badge variant="outline">Excluded from totals</Badge>}
              {(connection.error || connection.historyError || stale) && <Link href="/admin/connections"><Badge variant="warning">{connection.error || connection.historyError ? "Check connection" : "Needs refresh"}</Badge></Link>}
              {!connection.enabled && <Badge variant="outline">Paused</Badge>}
              <CardDescription>{connection.lastSyncedAt ? `Updated ${timeAgo(connection.lastSyncedAt, now)}` : "Awaiting sync"}</CardDescription>
            </div>
          </div>
        </CardHeader>
        {!rows.length ? <CardContent><p className="pb-4 text-sm text-muted-foreground">{snapshot ? "No balances to show." : "Refresh to load this account."}</p></CardContent> : <>
          <ItemGroup className="md:hidden">{rows.map(({ p, label, avg, value, pnl, estimated }) =>
            <Item key={p.id} size="sm" data-synced-position={`${provider}:${p.id}`} data-estimated-pnl={estimated}>
              <ItemContent className="min-w-0">
                <div className="flex items-center justify-between gap-3"><ItemTitle>{label}</ItemTitle><span className="font-mono text-sm">{value}</span></div>
                <ItemDescription><span className="group-data-[private=true]/shell:blur-sm">{formatQty(p.quantity)}</span> {p.symbol}</ItemDescription>
                {p.assetClass !== "cash" && <div className="flex items-end justify-between gap-3 text-xs">
                  <div className="flex min-w-0 flex-col gap-1"><span className="text-muted-foreground">Avg. buy</span><span className="font-mono">{avg}</span></div>
                  <div className="flex flex-col items-end gap-1"><span className="text-muted-foreground">{provider === "binance" ? "Est. P/L" : "P/L"}</span><span className="flex flex-col items-end font-mono">{pnl}</span></div>
                </div>}
              </ItemContent>
            </Item>)}</ItemGroup>
          <div className="hidden md:block"><Table aria-label={`${PROVIDER_META[provider].name} synced holdings`}>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead className="text-right">Avg. buy</TableHead>
              <TableHead className="text-right">Value</TableHead><TableHead className="text-right">{provider === "binance" ? "Est. P/L" : "P/L"}</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map(({ p, label, avg, value, pnl, estimated }) => <TableRow key={p.id} data-synced-position={`${provider}:${p.id}`} data-estimated-pnl={estimated}>
              <TableCell>{label}</TableCell><TableCell className="text-right font-mono"><span className="group-data-[private=true]/shell:blur-sm">{formatQty(p.quantity)}</span></TableCell>
              <TableCell className="text-right font-mono">{avg}</TableCell><TableCell className="text-right font-mono">{value}</TableCell>
              <TableCell className="text-right font-mono"><div className="flex flex-col items-end">{pnl}</div></TableCell>
            </TableRow>)}</TableBody>
          </Table></div>
        </>}
        {provider === "binance" && rows.length > 0 && <CardContent className="py-3"><p className="text-xs text-muted-foreground">P/L estimates use recorded purchase costs and exclude units without a cost. Select a coin for details.</p></CardContent>}
      </Card>;
    })}
  </section>;
}
