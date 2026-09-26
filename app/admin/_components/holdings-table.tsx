import type { ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { connectedHoldingMetrics, fxToPhp, isSmallHolding, type FxTable } from "@/lib/finance/calc";
import { ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { isConnectionStale, PROVIDER_META, type ConnectionView } from "@/lib/finance/connections/types";
import { formatQty } from "@/lib/finance/format";
import { binanceHoldingRows, type HoldingCost } from "@/lib/finance/imports/holding-costs";
import { BinanceCostDetails } from "./holding-cost-details";
import { Money, Pct, TokenAmount } from "./ui";

/** One row of the table: a synced balance or position. */
interface Row {
  key: string;
  assetClass: AssetClass;
  valuePhp: number | null;
  title: ReactNode;
  /** Where it is held (account or platform). */
  meta: string | null;
  /** null for cash, where the value already says it all. */
  quantity: string | null;
  value: () => ReactNode;
  /** null for cash and positions without a cost. */
  pnl: (() => ReactNode) | null;
  pnlPct: number | null;
  /** Binance coins: tapping the row opens their cost and P/L details. */
  cost?: HoldingCost;
}

const dash = <span className="text-muted-foreground">—</span>;

function syncedRows(connection: ConnectionView, fx: FxTable, costs: Map<string, HoldingCost>, keep: (p: { assetClass: AssetClass; marketValue: number | null; currency: string }) => boolean): Row[] {
  const { provider, snapshot } = connection;
  const all = provider === "binance" ? binanceHoldingRows(snapshot?.positions ?? []) : snapshot?.positions ?? [];
  const usdRate = fxToPhp(fx, "USD");
  return all.filter(keep).map((p) => {
    const cash = p.assetClass === "cash";
    const cost = provider === "binance" ? costs.get(p.symbol) : undefined;
    const estimate = cost?.pnlEstimate;
    const metrics = connectedHoldingMetrics(p, fx);
    const pnl = metrics.pnlPhp ?? metrics.pnl;
    return {
      key: `${provider}:${p.id}`,
      assetClass: p.assetClass,
      valuePhp: metrics.valuePhp,
      title: cost ? p.symbol : p.name,
      meta: PROVIDER_META[provider].name,
      quantity: cash ? null : formatQty(p.quantity),
      value: () => p.marketValue == null ? dash : <Money value={metrics.valuePhp ?? p.marketValue} currency={metrics.valuePhp == null ? p.currency : "PHP"} />,
      pnl: estimate ? () => (usdRate == null ? <TokenAmount value={estimate.pnl} currency="USDT" signed tone /> : <Money value={estimate.pnlUsd * usdRate} signed tone />) :
        !cash && pnl != null ? () => <Money value={pnl} currency={metrics.pnlPhp == null ? p.currency : "PHP"} signed tone /> : null,
      pnlPct: estimate ? estimate.pnlPct : cash ? null : metrics.pnlPct,
      cost,
    };
  });
}

/** Only accounts that need attention; healthy ones stay out of the way. */
export function ConnectionStatus({ connections, now }: { connections: ConnectionView[]; now: Date }) {
  const problems = connections.flatMap((connection) => {
    const problem = connection.error || connection.historyError ? "check connection" : isConnectionStale(connection, now) ? "needs refresh" : null;
    return problem ? [{ provider: connection.provider, problem }] : [];
  });
  if (!problems.length) return null;
  return <div className="flex flex-wrap gap-2">
    {problems.map(({ provider, problem }) => <Link key={provider} href="/admin/connections">
      <Badge variant="warning">{PROVIDER_META[provider].name}: {problem}</Badge>
    </Link>)}
  </div>;
}

/** Every synced holding in one table, largest first. */
export function HoldingsTable({ connections, fx, filter, showSmall, binanceCosts }: {
  connections: ConnectionView[]; fx: FxTable; filter: AssetClass | null; showSmall: boolean; binanceCosts: HoldingCost[];
}) {
  const costs = new Map(binanceCosts.map((cost) => [cost.symbol, cost]));
  const keep = (p: { assetClass: AssetClass; marketValue: number | null; currency: string }) =>
    (!filter || p.assetClass === filter) && (showSmall || !isSmallHolding(p.marketValue, p.currency, fx));
  const rows = connections.flatMap((connection) => syncedRows(connection, fx, costs, keep))
    .sort((a, b) => (b.valuePhp ?? -Infinity) - (a.valuePhp ?? -Infinity));
  if (!rows.length) return null;
  const summary = (row: Row) => <span className="flex items-center gap-3">
    <Swatch color={ASSET_CLASS_META[row.assetClass].color} />
    <span className="flex flex-col items-start">
      <span className="flex items-center gap-2 font-semibold">{row.title}</span>
      {row.meta && <span className="text-xs text-muted-foreground">{row.meta}</span>}
    </span>
  </span>;
  const lead = (row: Row) => row.cost ? <BinanceCostDetails cost={row.cost}>{summary(row)}</BinanceCostDetails> : summary(row);
  const cells = (row: Row) => <>
    <TableCell className="text-right font-mono">{row.quantity == null ? dash : <span className="group-data-[private=true]/shell:blur-sm">{row.quantity}</span>}</TableCell>
    <TableCell className="text-right font-mono">{row.value()}</TableCell>
    <TableCell className="text-right font-mono">{row.pnl ? row.pnl() : dash}</TableCell>
  </>;
  const description = (row: Row) => <>{row.quantity && <span className="group-data-[private=true]/shell:blur-sm">{row.quantity}</span>}{row.quantity && row.meta && " · "}{row.meta}</>;
  const aside = (row: Row) => <span className="flex flex-col items-end font-mono text-sm">
    {row.value()}
    {row.pnl != null && <span className="text-xs"><Pct value={row.pnlPct} tone /></span>}
  </span>;

  return <section aria-label="Holdings">
    {/* Phones: one row per holding. */}
    <Card className="gap-0 py-2 md:hidden">
      <ItemGroup>
        {rows.map((row) => (
          <Item key={row.key} size="sm" variant={row.cost ? "interactive" : "default"} data-synced-position={row.key}>
            <ItemMedia><Swatch color={ASSET_CLASS_META[row.assetClass].color} /></ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle>{row.cost ? <BinanceCostDetails cost={row.cost}>{row.title}</BinanceCostDetails> : row.title}</ItemTitle>
              {(row.meta || row.quantity) && <ItemDescription>{description(row)}</ItemDescription>}
            </ItemContent>
            {aside(row)}
          </Item>
        ))}
      </ItemGroup>
    </Card>
    <Card className="hidden gap-0 overflow-hidden py-0 md:flex">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead className="text-right">P/L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key} className={row.cost ? "relative" : undefined} data-synced-position={row.key}>
              <TableCell>{lead(row)}</TableCell>
              {cells(row)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  </section>;
}
