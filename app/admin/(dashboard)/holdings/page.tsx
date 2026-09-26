import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Swatch } from "@/components/ui/swatch";
import { getConnections, getFx, getSnapshots } from "@/lib/dal";
import { allocation, computeNetWorth, fxToPhp, isSmallHolding } from "@/lib/finance/calc";
import { ASSET_CLASSES, ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { includedPositions } from "@/lib/finance/connections/types";
import { todayManila } from "@/lib/finance/dates";
import { getBinanceHoldingCosts } from "@/lib/finance/imports/dal";
import { binanceHoldingRows } from "@/lib/finance/imports/holding-costs";
import { AllocationChart, NetWorthChart } from "../../_components/charts";
import { ConnectedValuationNotice } from "../../_components/connected-accounts";
import { SyncConnectionsButton } from "../../_components/connection-controls";
import { ConnectionStatus, HoldingsTable } from "../../_components/holdings-table";
import { EmptyState, MissingFxAlert, Money, PageHeader, Panel, Pct, StatCards } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Holdings",
};
export const maxDuration = 120;

/** What the synced accounts hold, with P/L, allocation and the net-worth trend. */
export default async function HoldingsPage({ searchParams }: { searchParams: Promise<{ class?: string; small?: string }> }) {
  const params = await searchParams;
  const showSmall = params.small === "1";
  const filter = ASSET_CLASSES.includes(params.class as AssetClass) ? (params.class as AssetClass) : null;

  const [connections, fx, snapshots] = await Promise.all([getConnections(), getFx(), getSnapshots()]);
  const now = new Date();
  const binanceCosts = await getBinanceHoldingCosts(connections.find((c) => c.provider === "binance")?.snapshot ?? null);
  const included = includedPositions(connections);
  const nw = computeNetWorth([], [], fx, included);

  // Visibility is independent of net-worth inclusion; pausing sync keeps the last positions visible.
  const positions = connections.flatMap((connection) =>
    connection.provider === "binance" ? binanceHoldingRows(connection.snapshot?.positions ?? []) : (connection.snapshot?.positions ?? [])
  );
  const visible = positions.filter((p) => showSmall || !isSmallHolding(p.marketValue, p.currency, fx));
  const smallCount = positions.length - visible.length;
  const countClass = (c: AssetClass) => visible.filter((p) => p.assetClass === c).length;
  const classes = ASSET_CLASSES.filter((c) => countClass(c) > 0);

  // Binance P/L comes from the spot purchase estimates; other accounts report their own cost basis.
  const usdRate = fxToPhp(fx, "USD");
  const estimates = connections.some((c) => c.provider === "binance" && c.includeInNetWorth)
    ? binanceCosts.flatMap((c) => (c.status === "estimate" && c.pnlEstimate ? [c.pnlEstimate] : []))
    : [];
  const pnlPhp = nw.unrealizedPhp + (usdRate == null ? 0 : estimates.reduce((sum, e) => sum + e.pnlUsd * usdRate, 0));
  const cost =
    included.filter((p) => p.assetClass !== "cash" && p.costBasis != null).reduce((sum, p) => sum + Math.abs(p.costBasis! * (fxToPhp(fx, p.currency) ?? 0)), 0) +
    (usdRate == null ? 0 : estimates.reduce((sum, e) => sum + e.costUsd * usdRate, 0));

  const alloc = allocation(nw.byClass);

  const filterHref = (c: AssetClass | null, small = showSmall) => {
    const q = new URLSearchParams();
    if (c) q.set("class", c);
    if (small) q.set("small", "1");
    const s = q.toString();
    return s ? `/admin/holdings?${s}` : "/admin/holdings";
  };

  return (
    <>
      <PageHeader eyebrow="Investments" title="Holdings" back={{ href: "/admin", label: "Home" }}>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/earnings">Earnings</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/history">History</Link>
        </Button>
        <SyncConnectionsButton disabled={!connections.some((c) => c.enabled)} />
      </PageHeader>

      <StatCards
        items={[
          { label: "Portfolio value", value: <Money value={nw.assetsPhp} />, primary: true },
          { label: "P/L", value: <Money value={pnlPhp} signed tone />, hint: <Pct value={cost > 0 ? pnlPhp / cost : null} tone /> },
        ]}
      />

      <MissingFxAlert currencies={nw.missingFx} />
      <ConnectedValuationNotice missingPrices={nw.missingPrices} missingCostBasis={nw.missingCostBasis} />

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Panel title="Net worth trend">
            <NetWorthChart points={snapshots.map((s) => ({ date: s.snapshotDate, netWorth: s.netWorthPhp }))} today={todayManila(now)} />
          </Panel>
        </div>
        <div className="lg:col-span-2">
          <Panel title="Allocation">
            {alloc.length === 0 ? (
              <EmptyState title="Nothing counted yet">Include a synced account in net worth to see its mix.</EmptyState>
            ) : (
              <div className="flex flex-col gap-4">
                <AllocationChart slices={alloc} />
                <ul className="flex flex-col gap-2 text-sm">
                  {alloc.map((a) => (
                    <li key={a.assetClass} className="flex items-center gap-2">
                      <Swatch color={ASSET_CLASS_META[a.assetClass].color} />
                      <span className="flex-1">{ASSET_CLASS_META[a.assetClass].plural}</span>
                      <span className="font-mono text-xs">
                        <Money value={a.value} />
                      </span>
                      <span className="w-12 text-right font-mono text-xs text-muted-foreground">
                        <Pct value={a.share} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by asset class" className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant={filter ? "outline" : "default"}>
            <Link href={filterHref(null)}>All · {visible.length}</Link>
          </Button>
          {classes.map((c) => (
            <Button key={c} asChild size="sm" variant={filter === c ? "default" : "outline"}>
              <Link href={filterHref(c)}>
                {ASSET_CLASS_META[c].plural} · {countClass(c)}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <ConnectionStatus connections={connections} now={now} />
          {(showSmall || smallCount > 0) && (
            <Button asChild size="sm" variant={showSmall ? "default" : "outline"}>
              <Link href={filterHref(filter, !showSmall)}>{showSmall ? "Hide small" : `Show small · ${smallCount}`}</Link>
            </Button>
          )}
        </div>
      </div>

      {visible.filter((p) => !filter || p.assetClass === filter).length === 0 ? (
        <EmptyState title={positions.length > 0 ? "No holdings match these filters" : "No holdings yet"}>
          {positions.length > 0 ? "Show small balances or choose All." : "Connect Binance, IBKR or Wise and your positions appear here after the first sync."}
        </EmptyState>
      ) : (
        <HoldingsTable connections={connections} fx={fx} filter={filter} showSmall={showSmall} binanceCosts={binanceCosts} />
      )}
    </>
  );
}
