import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Button } from "@/components/ui/button";
import { Swatch } from "@/components/ui/swatch";
import { getConnections, getFx, getPortfolioSnapshots, getSnapshots } from "@/lib/dal";
import { allocation, computeNetWorth, fxToPhp, isSmallHolding, knownCost, type FxTable } from "@/lib/finance/calc";
import { ASSET_CLASSES, ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { connectionStatus, PROVIDER_META, type ConnectionView, type SyncProvider } from "@/lib/finance/connections/types";
import { addDays, dayLabel, dayRangeLabel, timeAgo, todayManila } from "@/lib/finance/dates";
import { getBinanceHoldingCosts, getInvestmentFlows } from "@/lib/finance/imports/dal";
import { binanceHoldingRows, type HoldingCost } from "@/lib/finance/imports/holding-costs";
import { RANGES, accountTotals, changeSince, moverRows, profitLossCoverage, snapshotDay, topMovers, withCurrent, type PortfolioPoint } from "@/lib/finance/performance";
import { portfolioRows, savePortfolioRows } from "@/lib/finance/portfolio";
import { amountInUsd, combineReturns, marketReturn, returnBase, unitPricesUsd } from "@/lib/finance/returns";
import { PortfolioSections } from "../../_components/admin-nav";
import { AllocationChart } from "../../_components/charts";
import { ConnectedValuationNotice } from "../../_components/connected-accounts";
import { SyncConnectionsButton } from "../../_components/connection-controls";
import { ConnectionStatus, HoldingsTable } from "../../_components/holdings-table";
import { NetWorthHistory } from "../../_components/net-worth-history";
import { PortfolioAccounts, type PortfolioAccount } from "../../_components/portfolio-accounts";
import { EmptyState, MissingFxAlert, Money, PageHeader, Panel, Pct, StatCards } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Portfolio",
};
export const maxDuration = 120;

const ACCOUNT_COLOR: Record<SyncProvider, string> = { binance: ASSET_CLASS_META.crypto.color, ibkr: ASSET_CLASS_META.stock.color, hyperliquid: "var(--chart-7)" };

/** "Crypto", or the biggest non-cash asset classes an account holds ("Stocks & ETFs"). */
function holds(connection: ConnectionView, fx: FxTable): string {
  if (connection.provider !== "ibkr") return ASSET_CLASS_META.crypto.plural;
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
  if (connection.provider === "hyperliquid") {
    const history = { href: "/admin/history?provider=hyperliquid", link: "Trade history" };
    return missing
      ? { text: `P/L leaves out ${missing} ${missing === 1 ? "holding" : "holdings"} that did not come from this wallet's USDC spot buys.`, ...history }
      : { text: "P/L is estimated from this wallet's spot buys and staking rewards.", ...history };
  }
  if (!missing) return null;
  const text = missing === 1 ? "1 holding has no cost basis in the IBKR report, so it is left out of P/L." : `${missing} holdings have no cost basis in the IBKR report, so they are left out of P/L.`;
  return { text, href: "/admin/connections", link: "Check the report" };
}

/** Every investment account together: how each one is doing, then everything they hold. */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ class?: string; small?: string }> }) {
  const params = await searchParams;
  const showSmall = params.small === "1";
  const filter = ASSET_CLASSES.includes(params.class as AssetClass) ? (params.class as AssetClass) : null;

  const now = new Date();
  const today = todayManila(now);
  const [connections, fx, history, flowRows, netWorthHistory] = await Promise.all([getConnections(), getFx(), getPortfolioSnapshots(), getInvestmentFlows(addDays(today, -400)), getSnapshots()]);
  const binanceCosts = await getBinanceHoldingCosts(connections.find((c) => c.provider === "binance")?.snapshot ?? null);
  // Transfers in coins are valued at today's prices, from the accounts' own balances.
  const prices = unitPricesUsd(connections.flatMap((c) => c.snapshot?.positions ?? []), fx);

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
    const mine = flowRows.filter((f) => f.provider === connection.provider);
    const flows = mine.flatMap((f) => {
      const usd = amountInUsd(f.amount, f.currency, prices, fx);
      return usd == null ? [] : [{ date: f.date, value: toPage(usd) }];
    });
    const unpricedFlows = mine.length - flows.length;
    return [{ connection, costs, totals, points, coverage, flows, unpricedFlows }];
  });

  const accounts: PortfolioAccount[] = tracked.map(({ connection, costs, totals, points, coverage, flows, unpricedFlows }) => {
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
            ? `Synced ${timeAgo(connection.lastSyncedAt, now)}${connectionStatus(connection, now).attention ? ", value and P/L from then" : ""}`
            : "Not synced yet",
      attention: connectionStatus(connection, now).attention ? connectionStatus(connection, now).label : null,
      inNetWorth: connection.includeInNetWorth,
      value: toPage(totals.valueUsd),
      valueUsd: totals.valueUsd,
      pnl: totals.pnlUsd == null ? null : toPage(totals.pnlUsd),
      pnlPct: totals.pnlUsd != null && totals.costUsd ? totals.pnlUsd / totals.costUsd : null,
      pnlPartial: coverage.missing > 0,
      points: points.map((p) => ({ date: p.date, value: toPage(p.valueUsd), pnl: p.pnlUsd == null ? null : toPage(p.pnlUsd) })),
      flows,
      unpricedFlows,
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
  const missingCostValue = tracked.reduce((sum, a) => sum + a.coverage.missingValue, 0);
  const estimatedPnl = withCost.some((a) => a.connection.provider !== "ibkr");
  // The same 30 days, page currency and transfers as each account card's 1M view, so the cards add up to this.
  const since = addDays(today, -(RANGES.find((r) => r.value === "1M")?.days ?? 30));
  const changes = tracked.flatMap((a) => {
    const series = a.points.map((p) => ({ date: p.date, value: toPage(p.valueUsd) }));
    const change = changeSince(series, since);
    if (!change) return [];
    const start = { date: change.from, value: change.base }, end = series.at(-1)!;
    return [{ result: marketReturn(start, end, a.flows), base: returnBase(start, end, a.flows), from: change.from, to: end.date, unpriced: a.unpricedFlows }];
  });
  const month = combineReturns(changes);
  const unpricedFlows = changes.reduce((sum, c) => sum + c.unpriced, 0);
  const windows = new Set(changes.map((a) => `${a.from}|${a.to}`));
  const periodHint = changes.length < tracked.length ? "Some accounts have no history to compare yet" : windows.size > 1
    ? `Sum of the ${changes.length} account cards below, each over its own latest 30 days` : changes.length ? dayRangeLabel(changes[0].from, changes[0].to) : "History starts today";

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
  const notInNetWorth = connections.filter((c) => c.snapshot && !c.includeInNetWorth).map((c) => PROVIDER_META[c.provider].name);
  const needsLook = connections.filter((c) => c.snapshot && connectionStatus(c, now).attention).map((c) => PROVIDER_META[c.provider].name);

  const filterHref = (c: AssetClass | null, small = showSmall) => {
    const q = new URLSearchParams();
    if (c) q.set("class", c);
    if (small) q.set("small", "1");
    const s = q.toString();
    return s ? `/admin/holdings?${s}` : "/admin/holdings";
  };

  return (
    <>
      <PageHeader title="Portfolio">
        <SyncConnectionsButton disabled={!connections.some((c) => c.enabled)} />
      </PageHeader>
      <PortfolioSections />

      <StatCards
        items={[
          {
            label: "Portfolio value",
            value: <Money value={toPage(valueUsd)} currency={currency} />,
            hint: <>
              {currency !== "USD" && <Money value={valueUsd} currency="USD" />}
              {/* So it can be reconciled with net worth on the Overview. */}
              {notInNetWorth.length > 0 && <span className="mt-1 block">Includes {notInNetWorth.join(", ")}, not in net worth (your choice, in Accounts → Manage)</span>}
              {needsLook.length > 0 && <span className="mt-1 block">{needsLook.join(", ")} not up to date</span>}
            </>,
            primary: true,
          },
          {
            label: missingCosts > 0 && pnlUsd != null ? "Partial profit / loss" : estimatedPnl ? "Estimated profit / loss" : "Profit / loss",
            value: pnlUsd == null ? "—" : <Money value={toPage(pnlUsd)} currency={currency} signed tone />,
            hint: pnlUsd == null ? "Needs a cost basis" : <>
              <Pct value={costUsd > 0 ? pnlUsd / costUsd : null} tone /> on <Money value={toPage(costUsd)} currency={currency} /> known cost
              {missingCosts > 0 && <span className="mt-1 block">Leaves out {missingCosts} {missingCosts === 1 ? "holding" : "holdings"} worth <Money value={missingCostValue} />, with no known cost</span>}
            </>,
          },
          {
            // What the investments did by themselves: the balance change minus money moved in or out.
            label: unpricedFlows > 0 ? "Return · 30 days, partial" : "Return · 30 days",
            value: month ? <Money value={month.market} currency={currency} signed tone /> : "—",
            hint: month ? <>
              <Pct value={month.pct} tone /> · transfers left out
              <span className="mt-1 block">Balance <Money value={month.change} currency={currency} signed /> · moved in or out <Money value={month.flows} currency={currency} signed /></span>
              {unpricedFlows > 0 && <span className="mt-1 block">{unpricedFlows} {unpricedFlows === 1 ? "transfer has" : "transfers have"} no price today and {unpricedFlows === 1 ? "is" : "are"} counted as gains</span>}
              <span className="mt-1 block">{periodHint}</span>
            </> : "History starts today",
          },
        ]}
      />

      <MissingFxAlert currencies={all.missingFx} />
      <ConnectedValuationNotice missingPrices={all.missingPrices} />

      {accounts.length === 0 ? (
        <div className="mb-6">
          <EmptyState title="No accounts yet">
            <Link href="/admin/connections" className="underline underline-offset-4">Connect Binance, IBKR or Hyperliquid</Link> and their performance shows up here after the first sync.
          </EmptyState>
        </div>
      ) : (
        <PortfolioAccounts accounts={accounts} currency={currency} today={today} />
      )}

      <div className="mb-6">
        <NetWorthHistory today={today} points={netWorthHistory.map((s) => ({ date: s.snapshotDate, netWorth: s.netWorthPhp, byClass: s.byClass }))} />
      </div>

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
          {positions.length > 0 ? "Show small balances or choose All." : "Connect Binance, IBKR or Hyperliquid and your positions appear here after the first sync."}
        </EmptyState>
      ) : (
        <HoldingsTable connections={connections} fx={fx} filter={filter} showSmall={showSmall} binanceCosts={binanceCosts} />
      )}

      {/* Credit for the prices and rates behind these values (CoinGecko's free API asks for it where its prices show). */}
      <p className="mt-8 font-mono text-xs text-muted-foreground">
        Crypto prices by{" "}
        <a className="underline underline-offset-4" href="https://www.coingecko.com/" target="_blank" rel="noopener noreferrer">
          CoinGecko
        </a>{" "}
        · FX by{" "}
        <a className="underline underline-offset-4" href="https://frankfurter.dev/" target="_blank" rel="noopener noreferrer">
          Frankfurter
        </a>{" "}
        (ECB)
      </p>
    </>
  );
}
