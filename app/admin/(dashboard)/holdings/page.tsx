import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Pencil, Plus, Tags, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { countArchivedHoldings, getConnections, getFx, getHoldings } from "@/lib/dal";
import type { Holding } from "@/lib/db/schema";
import { computeNetWorth, holdingMetrics, isSmallHolding } from "@/lib/finance/calc";
import { ASSET_CLASSES, ASSET_CLASS_META, PRICE_SOURCE_LABELS, STALE_PRICE_MS, type AssetClass } from "@/lib/finance/constants";
import { includedPositions } from "@/lib/finance/connections/types";
import { getBinanceHoldingCosts } from "@/lib/finance/imports/dal";
import { dayLabel, timeAgo, todayManila } from "@/lib/finance/dates";
import { formatPct, formatPrice, formatQty } from "@/lib/finance/format";
import { deleteHolding, setHoldingArchived } from "../../_actions/holdings";
import { FormSheet } from "../../_components/form";
import { AdjustForm, BulkPriceForm, HoldingForm, type HoldingDTO } from "../../_components/holding-forms";
import { RefreshPricesButton } from "../../_components/refresh-prices-button";
import { ConnectedValuationNotice } from "../../_components/connected-accounts";
import { SyncConnectionsButton } from "../../_components/connection-controls";
import { SyncedHoldings } from "../../_components/synced-holdings";
import { EditableRow, EditableTableRow, type RowActionsProps } from "../../_components/row-actions";
import { EmptyState, Money, PageHeader, Pct, StatCards } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Holdings",
};
export const maxDuration = 120;

function toDTO(h: Holding): HoldingDTO {
  return {
    id: h.id,
    assetClass: h.assetClass,
    name: h.name,
    symbol: h.symbol,
    platform: h.platform,
    quantity: h.quantity,
    avgCost: h.avgCost,
    currency: h.currency,
    priceSource: h.priceSource,
    priceRef: h.priceRef,
    lastPrice: h.lastPrice,
    notes: h.notes,
  };
}

export default async function HoldingsPage({ searchParams }: { searchParams: Promise<{ class?: string; archived?: string; small?: string }> }) {
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const showSmall = showArchived || params.small === "1";
  const filter = ASSET_CLASSES.includes(params.class as AssetClass) ? (params.class as AssetClass) : null;

  const [rows, fx, archivedCount, connections] = await Promise.all([
    getHoldings({ archived: showArchived }), getFx(), countArchivedHoldings(), getConnections(),
  ]);
  const now = new Date();
  const today = todayManila(now);
  const activeConnections = showArchived ? [] : connections;
  const binanceCosts = showArchived ? [] : await getBinanceHoldingCosts(connections.find((c) => c.provider === "binance")?.snapshot ?? null);
  // Visibility is independent of net-worth inclusion; pausing sync keeps the last positions visible.
  const allSyncedPositions = activeConnections.flatMap((connection) => connection.snapshot?.positions ?? []);
  const syncedPositions = allSyncedPositions.filter((position) => showSmall || !isSmallHolding(position.marketValue, position.currency, fx));
  const nw = computeNetWorth(rows, [], fx, includedPositions(activeConnections));

  const allItems = rows.map((h) => ({ h, m: holdingMetrics(h, fx) }));
  const items = allItems.filter(({ h, m }) => showSmall || !isSmallHolding(m.value, h.currency, fx));
  const smallCount = allItems.filter(({ h, m }) => isSmallHolding(m.value, h.currency, fx)).length +
    allSyncedPositions.filter((position) => isSmallHolding(position.marketValue, position.currency, fx)).length;
  const visible = filter ? items.filter((x) => x.h.assetClass === filter) : items;
  const visibleSynced = syncedPositions.filter((position) => !filter || position.assetClass === filter);
  const countClass = (c: AssetClass) => items.filter((x) => x.h.assetClass === c).length + syncedPositions.filter((p) => p.assetClass === c).length;
  const classes = ASSET_CLASSES.filter((c) => countClass(c) > 0);
  const overlaps = rows.filter((holding) => activeConnections.some((connection) => connection.includeInNetWorth &&
    holding.platform?.trim().toLowerCase() === connection.provider && connection.snapshot?.positions.some((position) =>
      position.assetClass === holding.assetClass && position.symbol.toUpperCase() ===
        (holding.symbol ?? (holding.assetClass === "cash" ? holding.currency : "")).toUpperCase())));
  const manual = rows
    .filter((h) => h.priceSource === "manual" && h.assetClass !== "cash")
    .map((h) => ({
      id: h.id,
      name: h.name,
      symbol: h.symbol,
      currency: h.currency,
      lastPrice: h.lastPrice,
      lastSet: h.priceUpdatedAt ? (todayManila(h.priceUpdatedAt) === today ? "today" : dayLabel(todayManila(h.priceUpdatedAt))) : null,
    }));

  const filterHref = (c: AssetClass | null, includeSmall = showSmall) => {
    const q = new URLSearchParams();
    if (c) q.set("class", c);
    if (showArchived) q.set("archived", "1");
    if (includeSmall && !showArchived) q.set("small", "1");
    const s = q.toString();
    return s ? `/admin/holdings?${s}` : "/admin/holdings";
  };

  const isStale = (h: Holding) =>
    h.priceSource !== "manual" && (!h.priceUpdatedAt || now.getTime() - h.priceUpdatedAt.getTime() > STALE_PRICE_MS);

  // Tapping a holding opens Buy / sell (the usual change); details are one menu item away.
  const rowActions = (h: Holding): RowActionsProps => {
    const cash = h.assetClass === "cash";
    return {
      name: h.name,
      editLabel: cash ? "Deposit / withdraw" : "Buy / sell",
      editIcon: <ArrowLeftRight />,
      editTitle: h.name,
      editDescription: cash ? "Money in or out of this account." : "Record a buy or a sale — the average cost updates for you.",
      editForm: <AdjustForm holding={toDTO(h)} />,
      sheets: [{ label: "Edit details", icon: <Pencil />, title: `Edit ${h.name}`, content: <HoldingForm holding={toDTO(h)} /> }],
      archived: h.archived,
      onToggleArchive: setHoldingArchived.bind(null, h.id, !h.archived),
      onDelete: deleteHolding.bind(null, h.id),
      deleteWarning: "This permanently removes the holding. Archive it instead to keep it on record.",
    };
  };

  return (
    <>
      <PageHeader eyebrow="Portfolio" title={showArchived ? "Archived" : "Holdings"}>
        {!showArchived && <SyncConnectionsButton disabled={!connections.some((connection) => connection.enabled)} />}
        <RefreshPricesButton />
        <FormSheet
          title="Manual prices"
          description="PSE stocks, UITFs, property — anything without an automatic quote."
          trigger={
            <Button variant="outline">
              <Tags /> Manual prices
            </Button>
          }
        >
          <BulkPriceForm holdings={manual} />
        </FormSheet>
        <FormSheet
          title="Add holding"
          description="Crypto is priced by CoinGecko, US stocks/ETFs by Finnhub; everything else is manual."
          trigger={
            <Button>
              <Plus /> Add holding
            </Button>
          }
        >
          <HoldingForm />
        </FormSheet>
      </PageHeader>

      {!showArchived && <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        Connected balances and manual investments appear together here. Sync accounts updates connected holdings;
        Refresh prices updates manual holdings. <Link href="/admin/connections" className="underline underline-offset-4">Manage connections</Link>.
      </p>}

      {!showArchived && (
        <StatCards
          items={[
            { label: "Market value", value: <Money value={nw.assetsPhp} />, primary: true, hint: "Manual + included accounts" },
            { label: nw.missingCostBasis.length ? "Known cost basis" : "Cost basis", value: <Money value={nw.investedPhp} /> },
            { label: "Unrealized P/L", value: <Money value={nw.unrealizedPhp} signed tone />, hint: nw.missingCostBasis.length ? "Positions with known cost only" : <Pct value={nw.unrealizedPct} tone /> },
          ]}
        />
      )}

      {nw.missingFx.length > 0 && (
        <Alert variant="warning" className="mb-6">
          <TriangleAlert />
          <AlertTitle>Missing exchange rates</AlertTitle>
          <AlertDescription>No rate yet for {nw.missingFx.join(", ")} — refresh prices to include them in PHP totals.</AlertDescription>
        </Alert>
      )}

      {!showArchived && <ConnectedValuationNotice missingPrices={nw.missingPrices} missingCostBasis={nw.missingCostBasis} />}
      {overlaps.length > 0 && <Alert variant="warning" className="mb-6">
        <AlertTitle>Review overlapping manual holdings</AlertTitle>
        <AlertDescription>
          {overlaps.map((holding) => holding.name).join(", ")} also appear in connected accounts included in totals.
          If these are the same assets, archive their <Link href="/admin/holdings?small=1#manual-holdings" className="underline">manual entries below</Link> to avoid counting them twice.
        </AlertDescription>
      </Alert>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by asset class" className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant={filter ? "outline" : "default"}>
            <Link href={filterHref(null)}>All · {items.length + syncedPositions.length}</Link>
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
          {!showArchived && <Button asChild size="sm" variant={showSmall ? "default" : "outline"}>
            <Link href={filterHref(filter, !showSmall)}>{showSmall ? "Hide small balances" : "Show small balances"}</Link>
          </Button>}
          <Button asChild size="sm" variant="ghost">
            <Link href={showArchived ? "/admin/holdings" : "/admin/holdings?archived=1"}>
              {showArchived ? "← Active holdings" : `Archived · ${archivedCount}`}
            </Link>
          </Button>
        </div>
      </div>

      {!showArchived && <p role="status" className="mb-4 text-sm text-muted-foreground">
        {showSmall ? "Showing all balances." : `${smallCount} balances under US$1 hidden.`} Totals include small balances.
        {allSyncedPositions.some((position) => position.marketValue == null) && " Positions without a price stay visible."}
      </p>}

      {activeConnections.length > 0 && <SyncedHoldings connections={activeConnections} fx={fx} filter={filter} now={now} showSmall={showSmall} binanceCosts={binanceCosts} />}

      {visible.length === 0 && visibleSynced.length === 0 && (
        <EmptyState title={showArchived ? "No archived holdings" : allItems.length + allSyncedPositions.length > 0 ? "No holdings match these filters" : "No holdings yet"}>
          {showArchived ? "Archive sold-out positions to keep them out of your totals." : "Show small balances, choose All, or sync a connected account to see more holdings."}
        </EmptyState>
      )}
      {visible.length > 0 && (
        <section id="manual-holdings" aria-label="Manual holdings">
        {!showArchived && <h2 className="mb-4 font-display text-lg uppercase">Manual holdings · {visible.length}</h2>}
        {/* Phones: one card per holding (the 8-column table needs sideways scrolling there). */}
        <Card className="gap-0 py-2 md:hidden">
          <ItemGroup>
            {visible.map(({ h, m }) => (
              <EditableRow
                key={h.id}
                {...rowActions(h)}
                media={
                  <ItemMedia>
                    <Swatch color={ASSET_CLASS_META[h.assetClass].color} />
                  </ItemMedia>
                }
                aside={
                  <span className="flex flex-col items-end font-mono text-sm">
                    <Money value={m.valuePhp ?? m.value} currency={m.valuePhp != null ? "PHP" : h.currency} />
                    {h.assetClass !== "cash" && (
                      <span className="text-xs">
                        <Pct value={m.pnlPct} tone />
                      </span>
                    )}
                  </span>
                }
              >
                <ItemContent>
                  <ItemTitle>
                    {h.name}
                    {isStale(h) && <Badge variant="warning">Stale</Badge>}
                  </ItemTitle>
                  <ItemDescription>
                    {[
                      h.symbol ?? ASSET_CLASS_META[h.assetClass].label,
                      h.assetClass === "cash" ? h.platform : `${formatQty(h.quantity)} @ ${formatPrice(h.avgCost, h.currency)}`,
                      h.statementAsOf ? `Last statement: ${h.statementAsOf}` : null,
                      m.valuePhp != null && nw.assetsPhp > 0 ? formatPct(m.valuePhp / nw.assetsPhp) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </ItemDescription>
                </ItemContent>
              </EditableRow>
            ))}
          </ItemGroup>
        </Card>
        <Card className="hidden gap-0 overflow-hidden py-0 md:flex">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holding</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Avg cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">P/L</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(({ h, m }) => {
                const cash = h.assetClass === "cash";
                return (
                  <EditableTableRow
                    key={h.id}
                    {...rowActions(h)}
                    lead={
                      <span className="flex items-center gap-3">
                        <Swatch color={ASSET_CLASS_META[h.assetClass].color} />
                        <span className="flex flex-col">
                          <span className="font-semibold">{h.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {[ASSET_CLASS_META[h.assetClass].label, h.symbol, h.platform].filter(Boolean).join(" · ")}
                            {h.statementAsOf && ` · Last statement: ${h.statementAsOf}`}
                          </span>
                        </span>
                      </span>
                    }
                  >
                    <TableCell className="text-right font-mono">{cash ? "—" : formatQty(h.quantity)}</TableCell>
                    <TableCell className="text-right font-mono">{cash ? "—" : formatPrice(h.avgCost, h.currency)}</TableCell>
                    <TableCell className="text-right">
                      {cash ? (
                        <span className="text-muted-foreground">—</span>
                      ) : h.lastPrice == null ? (
                        <span className="text-muted-foreground">at cost</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono">{formatPrice(h.lastPrice, h.currency)}</span>
                          <span className="flex items-center gap-1">
                            <Badge variant={isStale(h) ? "warning" : "outline"}>{PRICE_SOURCE_LABELS[h.priceSource]}</Badge>
                            {h.priceUpdatedAt && <span className="font-mono text-xs text-muted-foreground">{timeAgo(h.priceUpdatedAt, now)}</span>}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <div className="flex flex-col items-end">
                        <Money value={m.value} currency={h.currency} />
                        {h.currency !== "PHP" && (
                          <span className="text-xs text-muted-foreground">{m.valuePhp != null ? <Money value={m.valuePhp} /> : "no FX rate"}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {cash ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-col items-end">
                          <Money value={m.pnlPhp ?? m.pnl} currency={m.pnlPhp != null ? "PHP" : h.currency} signed tone />
                          <span className="text-xs">
                            <Pct value={m.pnlPct} tone />
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {m.valuePhp != null && nw.assetsPhp > 0 ? formatPct(m.valuePhp / nw.assetsPhp) : "—"}
                    </TableCell>
                  </EditableTableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
        </section>
      )}
    </>
  );
}
