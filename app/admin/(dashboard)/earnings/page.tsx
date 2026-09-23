import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getConnections } from "@/lib/dal";
import { CURRENCIES } from "@/lib/finance/constants";
import { currentMonth, isMonth } from "@/lib/finance/dates";
import { getEarnings } from "@/lib/finance/imports/dal";
import { FinanceLinks } from "../../_components/finance-links";
import { NativeAmount } from "../../_components/import-controls";
import { EmptyState, Money, MonthPicker, PageHeader } from "../../_components/ui";

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ month?: string; period?: string }> }) {
  const params = await searchParams, current = currentMonth(), month = isMonth(params.month) ? params.month : current, allTime = params.period === "all";
  const [data, connections] = await Promise.all([getEarnings(allTime ? null : month), getConnections()]);
  const positions = connections.filter((c) => c.provider !== "wise").flatMap((c) => c.snapshot?.positions ?? []).filter((p) => p.assetClass !== "cash");
  const known = new Map<string, number>();
  for (const p of positions) if (p.costBasis != null && p.marketValue != null) known.set(p.currency, (known.get(p.currency) ?? 0) + p.marketValue - p.costBasis);
  const unknown = positions.filter((p) => p.costBasis == null || p.marketValue == null).length;
  return <>
    <PageHeader eyebrow="Private finance · investments" title="Earnings"><MonthPicker month={month} current={current} href={(m) => `/admin/earnings?month=${m}`} /></PageHeader>
    <FinanceLinks current="earnings" />
    <div className="mb-4 flex gap-2"><Button asChild size="sm" variant={allTime ? "default" : "outline"}><Link href="/admin/earnings?period=all">All time</Link></Button><Button asChild size="sm" variant={allTime ? "outline" : "default"}><Link href={`/admin/earnings?month=${month}`}>Selected month</Link></Button></div>
    <Alert className="mb-6"><AlertTitle>Imported activity, in its original currency</AlertTitle><AlertDescription>
      Totals cover imported Binance and IBKR records {allTime ? "across all imported dates" : "for this month"}, including investment history awaiting review. Ignored entries are excluded. Contributions require transfer confirmation; linked transfers between investment accounts are excluded. This is not a total-return calculation.
    </AlertDescription></Alert>
    {data.pendingTransfers > 0 && <p className="mb-4 text-sm text-warning">{data.pendingTransfers} transfers still need review before contributions are complete. <Link href="/admin/inbox" className="underline">Open inbox</Link></p>}
    {!data.rows.length ? <EmptyState title="No imported earnings yet">Connect Binance or configure an IBKR history Flex Query to start collecting rewards, dividends and trade results.</EmptyState> : <Card className="mb-6 gap-0 overflow-hidden py-0"><Table>
      <TableHeader><TableRow>{["Currency / asset", "Net contributions", "Earn rewards", "Dividends", "Interest", "Realized P/L", "Fees", "Taxes"].map((t) => <TableHead key={t}>{t}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{data.rows.map((r) => <TableRow key={r.currency}><TableCell>{r.currency}</TableCell>{[r.contributions, r.rewards, r.dividends, r.interest, r.realized, r.fees, r.taxes].map((v, i) => <TableCell key={i} className="text-right font-mono">{v == null ? "Unavailable" : <NativeAmount value={v} currency={r.currency} crypto={!(CURRENCIES as readonly string[]).includes(r.currency)} />}</TableCell>)}</TableRow>)}</TableBody>
    </Table></Card>}
    <p className="mb-8 text-sm text-muted-foreground">IBKR realized P/L already includes trade commissions. Fees are shown separately for visibility and must not be subtracted again from that P/L. Binance per-pair cost estimates are in <Link href="/admin/history" className="underline">Investment history</Link>; they are separate from reported realized P/L. Crypto rewards retain native quantities without historical fiat conversion.</p>
    <Card className="mb-6"><CardHeader><CardTitle>Current unrealized P/L</CardTitle><CardDescription>Latest connected investment positions with both a value and cost basis. This is a snapshot, independent of the selected month.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
      {[...known].map(([currency, value]) => <p key={currency} className="font-mono">{currency} · <Money value={value} currency={currency} signed tone /></p>)}
      {!known.size && <p className="text-sm text-muted-foreground">Unavailable until a connection supplies both position values and cost basis.</p>}
      {unknown > 0 && <p className="text-sm text-warning">{unknown} positions have missing values or cost basis and are excluded. Binance does not supply cost basis through this connection.</p>}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Latest automatic history window</CardTitle><CardDescription>Older IBKR reports and Binance backfill progress are recorded in Investment history. These dates describe the most recent regular sync only.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
      {connections.filter((c) => c.provider !== "wise").map((c) => <div key={c.provider}><p className="font-mono text-sm uppercase">{c.provider}</p><p className="text-sm">{c.historyCoverage ? `${c.historyCoverage.from} through ${c.historyCoverage.to} · ${c.historyCoverage.description}` : "No successful history import yet."}</p>{c.historyError && <p className="text-sm text-destructive">{c.historyError}</p>}</div>)}
      <Button asChild variant="outline" className="self-start"><Link href="/admin/connections">Manage connections</Link></Button>
      <Button asChild variant="outline" className="self-start"><Link href="/admin/history">Import older history</Link></Button>
    </CardContent></Card>
  </>;
}
