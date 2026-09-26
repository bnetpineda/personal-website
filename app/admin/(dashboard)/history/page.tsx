import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getInvestmentHistory } from "@/lib/finance/imports/dal";
import { utcYesterday } from "@/lib/finance/imports/history-service";
import { ConfigureHistoryButton, ContinueHistoryButton, HistoryToggle, ImportHoldingCostsButton, ImportInvestmentButton } from "../../_components/history-controls";
import { NativeAmount } from "../../_components/import-controls";
import { EmptyState, PageHeader } from "../../_components/ui";

export const maxDuration = 120;
export default async function InvestmentHistoryPage({ searchParams }: { searchParams: Promise<{ provider?: string; page?: string }> }) {
  const params = await searchParams, provider = params.provider === "ibkr" || params.provider === "binance" ? params.provider : "all";
  const page = /^\d{1,5}$/.test(params.page ?? "") ? Number(params.page) : 0;
  const data = await getInvestmentHistory(provider, page), href = (p: string, n = 0) => `/admin/history?provider=${p}&page=${n}`;
  return <>
    <PageHeader eyebrow="Investments" title="History" back={{ href: "/admin/holdings", label: "Holdings" }}><ConfigureHistoryButton yesterday={utcYesterday()} /><ImportInvestmentButton /></PageHeader>
    <p className="mb-6 text-sm text-muted-foreground">Load older activity once and keep collecting new records. A completed import means the provider returned everything available for that stream; it does not prove that every product, trading pair or date is covered.</p>
    <Card className="mb-6"><CardHeader><CardTitle>Binance import progress</CardTitle><CardDescription>Spot starts at the earliest available trade for each configured pair. Earn and completed crypto transfers use your selected dates. Daily sync continues saved progress after deployment.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">
      <ImportHoldingCostsButton disabled={false} />
      {!data.jobs.length ? <p className="text-sm text-muted-foreground">Connect Binance, then choose Binance history above. Include pairs you sold out of.</p> : <>
        <ContinueHistoryButton jobs={data.jobs.map(({ id, scope, enabled }) => ({ id, scope, enabled }))} />
        {data.jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3"><div>
          <p className="font-mono text-sm">{job.scope === "activity" ? "Earn + crypto transfers" : job.scope.slice(5)} · <Badge variant={job.error ? "destructive" : job.completedAt ? "success" : "outline"}>{!job.enabled ? "Paused" : job.error ? "Needs attention" : job.completedAt ? "Caught up" : "In progress"}</Badge></p>
          <p className="text-sm text-muted-foreground">{job.scope === "activity" ? `${job.fromDate} through ${job.toDate} (UTC) · ${job.completedAt ? "Range finished" : `Next batch: ${job.cursor}`}` : "All available fills · new trades continue syncing"}{job.lastSyncedAt ? ` · Last run ${job.lastSyncedAt.toISOString().slice(0, 10)}` : ""}</p>
          {job.error && <p className="text-sm text-destructive">{job.error}</p>}
        </div><HistoryToggle id={job.id} enabled={job.enabled} /></div>)}
      </>}
    </CardContent></Card>
    <Card className="mb-6"><CardHeader><CardTitle>Imported coverage</CardTitle><CardDescription>First and last records show the stored date span, not uninterrupted coverage. Upload additional IBKR reports for missing periods; statement imports preserve existing reviews.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">
      {data.coverage.map((c) => <p key={c.provider} className="text-sm">{c.provider.toUpperCase()} · {c.total} entries · {c.from} through {c.to}</p>)}
      {!data.coverage.length && <p className="text-sm text-muted-foreground">No investment history imported yet.</p>}
      {data.reports.map((r) => <p key={r.id} className="text-sm text-muted-foreground">IBKR report · {r.fromDate} through {r.toDate} · {r.accounts.length} account(s) · {r.entries} entries</p>)}
      <Button asChild variant="outline" className="self-start"><Link href="/admin/earnings?period=all">View all-time earnings</Link></Button>
    </CardContent></Card>
    {data.fifo.length > 0 && <Card className="mb-6"><CardHeader><CardTitle>Spot trade cost estimates</CardTitle><CardDescription>FIFO within each account and pair, in the quote asset. These are estimates from imported fills, not a portfolio or tax return. Transfers, rewards, Convert and trades in other pairs can change actual cost basis. Fees paid in a third asset are shown separately in history.</CardDescription></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead>Pair</TableHead><TableHead>Remaining bought units</TableHead><TableHead>Remaining cost</TableHead><TableHead>Realized estimate</TableHead></TableRow></TableHeader><TableBody>
        {data.fifo.map((f) => <TableRow key={`${f.accountKey}:${f.symbol}`}><TableCell>{f.symbol}<br />{(f.unmatched > 0 || f.externalFees > 0) && <span className="text-xs text-warning">{f.unmatched} unmatched sales · {f.externalFees} third-asset fees</span>}</TableCell>
          <TableCell><NativeAmount value={f.remaining} currency={f.baseAsset} crypto /></TableCell><TableCell><NativeAmount value={f.cost} currency={f.quoteAsset} crypto /></TableCell>
          <TableCell>{f.unmatched ? "Incomplete purchase history" : <NativeAmount value={f.realized} currency={f.quoteAsset} crypto />}</TableCell></TableRow>)}
      </TableBody></Table>
    </CardContent></Card>}
    <div className="mb-4 flex flex-wrap gap-2">{["all", "binance", "ibkr"].map((p) => <Button key={p} asChild size="sm" variant={provider === p ? "default" : "outline"}><Link href={href(p)}>{p === "all" ? "All investment activity" : p.toUpperCase()}</Link></Button>)}</div>
    {!data.entries.length ? <EmptyState title="No history in this view">Import a report or continue a connected account’s history.</EmptyState> : <Card className="mb-4 gap-0 overflow-hidden py-0"><Table>
      <TableHeader><TableRow><TableHead>Activity</TableHead><TableHead>Trade details</TableHead><TableHead>Native amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>
        {data.entries.map((e) => <TableRow key={e.id}><TableCell>{e.description}<br /><span className="text-xs text-muted-foreground">{e.occurredOn} · {e.provider.toUpperCase()} · {e.kind}</span></TableCell>
          <TableCell>{e.trade ? <><NativeAmount value={e.trade.quantity} currency={e.trade.baseAsset} crypto /><br /><span className="text-xs">@ <NativeAmount value={e.trade.price} currency={e.trade.quoteAsset} crypto /></span></> : "—"}</TableCell>
          <TableCell><NativeAmount value={e.amount} currency={e.currency} crypto={e.provider === "binance"} /></TableCell><TableCell><Badge variant="outline">{e.status}</Badge></TableCell></TableRow>)}
      </TableBody></Table></Card>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{data.total} entries · page {page + 1}</p><div className="flex gap-2">
      {page > 0 && <Button asChild variant="outline" size="sm"><Link href={href(provider, page - 1)}>Previous</Link></Button>}{(page + 1) * 50 < data.total && <Button asChild variant="outline" size="sm"><Link href={href(provider, page + 1)}>Next</Link></Button>}
    </div></div>
  </>;
}
