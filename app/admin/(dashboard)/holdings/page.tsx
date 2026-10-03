import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Button } from "@/components/ui/button";
import { Swatch } from "@/components/ui/swatch";
import { getConnections, getFx, getPortfolioSnapshots } from "@/lib/dal";
import { allocation, computeNetWorth, fxToPhp, isSmallHolding, knownCost, type FxTable } from "@/lib/finance/calc";
import { ASSET_CLASSES, ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { isConnectionStale, PROVIDER_META, type ConnectionView, type SyncProvider } from "@/lib/finance/connections/types";
import { addDays, dayLabel, dayRangeLabel, timeAgo, todayManila } from "@/lib/finance/dates";
import { getBinanceHoldingCosts } from "@/lib/finance/imports/dal";
import { binanceHoldingRows, type HoldingCost } from "@/lib/finance/imports/holding-costs";
import { accountTotals, changeSince, combineChanges, moverRows, profitLossCoverage, snapshotDay, topMovers, withCurrent, type PortfolioPoint } from "@/lib/finance/performance";
import { portfolioRows, savePortfolioRows } from "@/lib/finance/portfolio";
import { AllocationChart } from "../../_components/charts";
import { ConnectedValuationNotice } from "../../_components/connected-accounts";
import { SyncConnectionsButton } from "../../_components/connection-controls";
import { ConnectionStatus, HoldingsTable } from "../../_components/holdings-table";
import { PortfolioAccounts, type PortfolioAccount } from "../../_components/portfolio-accounts";
import { EmptyState, MissingFxAlert, Money, PageHeader, Panel, Pct, StatCards } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Portfolio",
};
export const maxDuration = 120;

const ACCOUNT_COLOR: Record<SyncProvider, string> = { binance: ASSET_CLASS_META.crypto.color, ibkr: ASSET_CLASS_META.stock.color };

/** "Crypto", or the biggest non-cash asset classes an account holds ("Stocks & ETFs"). */
function holds(connection: ConnectionView, fx: FxTable): string {
  if (connection.provider === "binance") return ASSET_CLASS_META.crypto.plural;
  const { byClass } = computeNetWorth([], [], fx, connection.snapshot?.positions ?? []);
  const classes = (Object.entries(byClass) as [AssetClass, number][]).filter(([c]) => c !== "cash").sort((a, b) => b[1] - a[1]);
  return classes.length ? classes.slice(0, 2).map(([c]) => ASSET_CLASS_META[c].plural).join(" & ") : ASSET_CLASS_META.cash.plural;
}

/** Where an account's P/L comes from, what it leaves out, and where to fill the gap. */
function costNote(connection: ConnectionView, fx: FxTable, costs: readonly HoldingCost[]): PortfolioAccount["note"] {
  const positions = connection.snapshot?.positions ?? [];
  if (connection.provider === "binance") {
    // USDT is what the purchase estimates are measured in, so it never needs one.
    const coins = binanceHoldingRows(positions).filter((p) => p.symbol !== "USDT" && !isSmallHolding(p.marketValue, p.currency, fx));
    const estimated = coins.filter((p) => costs.some((c) => c.symbol === p.symbol && c.pnlEstimate)).length;
    return estimated < coins.length
      ? { text: `P/L is estimated from imported Spot buys for ${estimated} of ${coins.length} coins.`, href: "/admin/history", link: "Import Spot costs" }
      : { text: "P/L is estimated from your imported Spot buys; tap a coin below for how.", href: "/admin/history?provider=binance", link: "Purchase history" };
  }
  const missing = positions.filter((p) => p.assetClass !== "cash" && knownCost(p) == null).length;
  if (!missing) return null;
  const text = missing === 1 ? "1 holding has no cost basis in the IBKR report, so it is left out of P/L." : `${missing} holdings have no cost basis in the IBKR report, so they are left out of P/L.`;
  return { text, href: "/admin/connections", link: "Check the report" };
}

/** Binance and IBKR together: how each account is doing, then everything they hold. */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ class?: string; small?: string }> }) {
  const params = await searchParams;
  const showSmall = params.small === "1";
  const filter = ASSET_CLASSES.includes(params.class as AssetClass) ? (params.class as AssetClass) : null;

  const [connections, fx, history] = await Promise.all([getConnections(), getFx(), getPortfolioSnapshots()]);
  const now = new Date();
  const today = todayManila(now);
  const binanceCosts = await getBinanceHoldingCosts(connections.find((c) => c.provider === "binance")?.snapshot ?? null);

  // Keep today's point current; balances only change on sync, so this is cheap to repeat.
  after(async () => {
    try {
      await savePortfolioRows(portfolioRows(connections, fx, binanceCosts));
    } catch (err) {
      console.error("[admin] portfolio snapshot failed", err);
    }
  });

  // The portfolio is every connected account, whether or not it counts in net worth.
  const usdRate = fxToPhp(fx, "USD");
  const currency = usdRate == null ? "USD" : "PHP";
  const toPage = (usd: number) => (usdRate == null ? usd : usd * usdRate);
  const tracked = connections.flatMap((connection) => {
    const snapshot = connection.snapshot;
    if (!snapshot) return [];
    const costs = connection.provider === "binance" ? binanceCosts : [];
    const totals = accountTotals(connection.provider, snapshot.positions, fx, costs);
    const coverage = profitLossCoverage(connection.provider, snapshot.positions, fx, costs);
    const saved = history
      .filter((h) => h.provider === connection.provider)
      .map((h): PortfolioPoint => ({ date: h.snapshotDate, valueUsd: h.valueUsd, pnlUsd: h.pnlUsd }));
    const points = withCurrent(saved, { date: snapshotDay(connection.provider, snapshot.asOf), valueUsd: totals.valueUsd, pnlUsd: totals.pnlUsd });
    return [{ connection, costs, totals, points, coverage }];
  });

  const accounts: PortfolioAccount[] = tracked.map(({ connection, costs, totals, points, coverage }) => {
    const { winners, losers } = topMovers(moverRows(connection.provider, connection.snapshot!.positions, fx, costs));
    const mover = (m: (typeof winners)[number]) => ({ symbol: m.symbol, pnl: toPage(m.pnlUsd), pnlPct: m.pnlPct });
    return {
      provider: connection.provider,
      name: PROVIDER_META[connection.provider].name,
      kind: holds(connection, fx),
      color: ACCOUNT_COLOR[connection.provider],
      status: !connection.enabled
        ? "Sync paused"
        : connection.provider === "ibkr"
          ? `Close of ${dayLabel(snapshotDay("ibkr", connection.snapshot!.asOf))}`
          : connection.lastSyncedAt
            ? `Synced ${timeAgo(connection.lastSyncedAt, now)}`
            : "Not synced yet",
      attention: Boolean(connection.error || connection.historyError || isConnectionStale(connection, now)),
      inNetWorth: connection.includeInNetWorth,
      value: toPage(totals.valueUsd),
      valueUsd: totals.valueUsd,
      pnl: totals.pnlUsd == null ? null : toPage(totals.pnlUsd),
      pnlPct: totals.pnlUsd != null && totals.costUsd ? totals.pnlUsd / totals.costUsd : null,
      pnlPartial: coverage.missing > 0,
      points: points.map((p) => ({ date: p.date, value: toPage(p.valueUsd), pnl: p.pnlUsd == null ? null : toPage(p.pnlUsd) })),
      winners: winners.map(mover),
      losers: losers.map(mover),
      note: costNote(connection, fx, costs),
    };
  });

  const valueUsd = tracked.reduce((sum, a) => sum + a.totals.valueUsd, 0);
  const withCost = tracked.filter((a) => a.totals.pnlUsd != null);
  const pnlUsd = withCost.length ? withCost.reduce((sum, a) => sum + a.totals.pnlUsd!, 0) : null;
  const costUsd = withCost.reduce((sum, a) => sum + (a.totals.costUsd ?? 0), 0);
  const missingCosts = tracked.reduce((sum, a) => sum + a.coverage.missing, 0);
  const estimatedPnl = withCost.some((a) => a.connection.provider === "binance");
  const changes = tracked.flatMap((a) => {
    const change = changeSince(a.points.map((p) => ({ date: p.date, value: p.valueUsd })), addDays(today, -30));
    return change ? [{ change, to: a.points.at(-1)!.date }] : [];
  });
  const month = combineChanges(changes.map((a) => a.change));
  const windows = new Set(changes.map((a) => `${a.change.from}|${a.to}`));
  const periodHint = changes.length < tracked.length ? "Some accounts have no comparison history" : windows.size > 1
    ? "Account date ranges differ · shown below" : changes.length ? dayRangeLabel(changes[0].change.from, changes[0].to) : "History starts today";

  // Visibility is independent of net-worth inclusion; pausing sync keeps the last positions visible.
  const positions = connections.flatMap((connection) =>
    connection.provider === "binance" ? binanceHoldingRows(connection.snapshot?.positions ?? []) : (connection.snapshot?.positions ?? [])
  );
  const all = computeNetWorth([], [], fx, connections.flatMap((c) => c.snapshot?.positions ?? []));
  const visible = positions.filter((p) => showSmall || !isSmallHolding(p.marketValue, p.currency, fx));
  const smallCount = positions.length - visible.length;
  const countClass = (c: AssetClass) => visible.filter((p) => p.assetClass === c).length;
  const classes = ASSET_CLASSES.filter((c) => countClass(c) > 0);
  const alloc = allocation(all.byClass);

  const filterHref = (c: AssetClass | null, small = showSmall) => {
    const q = new URLSearchParams();
    if (c) q.set("class", c);
    if (small) q.set("small", "1");
    const s = q.toString();
    return s ? `/admin/holdings?${s}` : "/admin/holdings";
  };

  return (
    <>
      <PageHeader eyebrow="Investments" title="Portfolio" back={{ href: "/admin", label: "Home" }}>
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
          {
            label: "Portfolio value",
            value: <Money value={toPage(valueUsd)} currency={currency} />,
            hint: currency === "USD" ? undefined : <Money value={valueUsd} currency="USD" />,
            primary: true,
          },
          {
            label: missingCosts > 0 && pnlUsd != null ? "Partial profit / loss" : estimatedPnl ? "Estimated profit / loss" : "Profit / loss",
            value: pnlUsd == null ? "—" : <Money value={toPage(pnlUsd)} currency={currency} signed tone />,
            hint: pnlUsd == null ? "Needs a cost basis" : <>
              <Pct value={costUsd > 0 ? pnlUsd / costUsd : null} tone /> on <Money value={toPage(costUsd)} currency={currency} /> known cost
              {missingCosts > 0 && <span className="mt-1 block">Excludes {missingCosts} {missingCosts === 1 ? "holding" : "holdings"} without a cost basis</span>}
            </>,
          },
          {
            label: "Recent value change",
            value: month ? <Money value={toPage(month.change)} currency={currency} signed tone /> : "—",
            hint: month ? <><Pct value={month.pct} tone /><span className="mt-1 block">{periodHint}</span></> : "History starts today",
          },
        ]}
      />

      <MissingFxAlert currencies={all.missingFx} />
      <ConnectedValuationNotice missingPrices={all.missingPrices} />

      {accounts.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="No accounts yet">
            <Link href="/admin/connections" className="underline underline-offset-4">Connect Binance or IBKR</Link> and their performance shows up here after the first sync.
          </EmptyState>
        </div>
      ) : (
        <PortfolioAccounts accounts={accounts} currency={currency} today={today} />
      )}

      {alloc.length > 0 && (
        <div className="mb-6">
          <Panel title="Allocation">
            <div className="grid items-center gap-6 sm:grid-cols-2">
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
          </Panel>
        </div>
      )}

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
          {positions.length > 0 ? "Show small balances or choose All." : "Connect Binance or IBKR and your positions appear here after the first sync."}
        </EmptyState>
      ) : (
        <HoldingsTable connections={connections} fx={fx} filter={filter} showSmall={showSmall} binanceCosts={binanceCosts} />
      )}
    </>
  );
}
