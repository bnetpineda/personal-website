import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getConnections } from "@/lib/dal";
import { PROVIDER_META, SYNC_PROVIDERS, type SyncProvider } from "@/lib/finance/connections/types";
import { dayLabel, dayRangeLabel } from "@/lib/finance/dates";
import { getInvestmentHistory } from "@/lib/finance/imports/dal";
import { utcYesterday } from "@/lib/finance/imports/history-service";
import type { EntryKind } from "@/lib/finance/imports/types";
import { PortfolioSections } from "../../_components/admin-nav";
import { FormSheet } from "../../_components/form";
import { ConfigureHistoryButton, ContinueHistoryButton, HistoryToggle, ImportHoldingCostsButton, ImportInvestmentButton } from "../../_components/history-controls";
import { NativeAmount } from "../../_components/import-controls";
import { EmptyState, InfoNote, PageHeader } from "../../_components/ui";

export const metadata: Metadata = { title: "History" };
export const maxDuration = 120;

const providerName = (provider: string) => PROVIDER_META[provider as SyncProvider]?.name ?? provider;

/** The types people look for, grouped; anything else still shows under All. */
const TYPES: readonly { value: string; label: string; kinds: readonly EntryKind[] }[] = [
  { value: "trade", label: "Trades", kinds: ["trade"] },
  { value: "income", label: "Dividends & interest", kinds: ["dividend", "interest"] },
  { value: "reward", label: "Rewards", kinds: ["reward"] },
  { value: "fee", label: "Fees", kinds: ["fee", "tax"] },
  { value: "transfer", label: "Transfers", kinds: ["transfer"] },
];

export default async function InvestmentHistoryPage({ searchParams }: { searchParams: Promise<{ provider?: string; page?: string; q?: string; type?: string }> }) {
  const params = await searchParams, provider = params.provider === "ibkr" || params.provider === "binance" || params.provider === "hyperliquid" ? params.provider : "all";
  const page = /^\d{1,5}$/.test(params.page ?? "") ? Number(params.page) : 0;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const type = TYPES.find((t) => t.value === params.type) ?? null;
  const [data, connections] = await Promise.all([getInvestmentHistory(provider, page, q, type?.kinds), getConnections()]);
  const href = (next: { provider?: string; type?: string | null; page?: number } = {}) => {
    const query = new URLSearchParams({ provider: next.provider ?? provider, page: String(next.page ?? 0) });
    const nextType = next.type === undefined ? type?.value : next.type;
    if (nextType) query.set("type", nextType);
    if (q) query.set("q", q);
    return `/admin/history?${query}`;
  };
  // A failing connection can't fetch anything new, so it can't honestly call itself caught up.
  const binanceFailing = Boolean(connections.find((c) => c.provider === "binance")?.error);
  // A zero-amount row is a broker's empty twin of the real charge beside it, and only reads as a duplicate.
  const entries = data.entries.filter((e) => e.provider !== "ibkr" || Math.abs(Number(e.amount)) >= 0.005);
  const anyTrade = entries.some((e) => e.trade);
  return <>
    <PageHeader title="Portfolio">
      {data.fifo.length > 0 && (
        <FormSheet wide title="Spot trade cost estimates" description="Estimates from imported trades, not a tax return." trigger={<Button variant="ghost" size="sm">Cost estimates</Button>}>
          <div className="flex flex-col gap-4">
            <InfoNote label="About estimates" title="How these are estimated">
              <p>First in, first out within each account and pair, in the coin it was bought with. These are estimates from imported trades, not a portfolio or tax return.</p>
              <p>Transfers, rewards, Convert and trades in other pairs can change the real cost. Fees paid in a third coin are shown separately in the activity.</p>
            </InfoNote>
            <Table><TableHeader><TableRow><TableHead>Pair</TableHead><TableHead className="text-right">Unsold from these buys</TableHead><TableHead className="text-right">Their cost</TableHead><TableHead className="text-right">Realized estimate</TableHead></TableRow></TableHeader><TableBody>
              {data.fifo.map((f) => <TableRow key={`${f.accountKey}:${f.symbol}`}><TableCell>{f.symbol}<br />{(f.unmatched > 0 || f.externalFees > 0) && <span className="text-xs text-warning">{[f.unmatched > 0 && `${f.unmatched} ${f.unmatched === 1 ? "sale" : "sales"} with no matching buy`, f.externalFees > 0 && `${f.externalFees} ${f.externalFees === 1 ? "fee" : "fees"} in another coin`].filter(Boolean).join(" · ")}</span>}</TableCell>
                <TableCell className="text-right"><NativeAmount value={f.remaining} currency={f.baseAsset} crypto /></TableCell><TableCell className="text-right"><NativeAmount value={f.cost} currency={f.quoteAsset} crypto /></TableCell>
                <TableCell className="text-right">{f.unmatched ? "Purchase history incomplete" : f.realized === 0 ? "—" : <NativeAmount value={f.realized} currency={f.quoteAsset} crypto />}</TableCell></TableRow>)}
            </TableBody></Table>
          </div>
        </FormSheet>
      )}
      <FormSheet title="Imports" description="Load older activity and see how far imports have got." trigger={<Button variant="outline" size="sm">Imports</Button>}>
        <div className="flex flex-col gap-6">
          <section aria-label="Binance imports" className="flex flex-col items-start gap-3">
            <div className="flex w-full items-center justify-between gap-2"><h3 className="font-display uppercase">Binance</h3>
              <InfoNote label="About imports" title="How Binance history loads">
                <p>Spot starts at the earliest trade for each pair you set up. Earn and crypto transfers use the dates you pick. Daily sync keeps going from where it stopped.</p>
                <p>A finished import means Binance returned everything available for that stream, not that every product or date is covered.</p>
              </InfoNote>
            </div>
            <div className="flex flex-wrap items-center gap-2"><ConfigureHistoryButton yesterday={utcYesterday()} /><ImportHoldingCostsButton disabled={false} /></div>
            {!data.jobs.length ? <p className="text-sm text-muted-foreground">Connect Binance, then set up its import above. Include pairs you sold out of.</p> : <>
              <ContinueHistoryButton jobs={data.jobs.map(({ id, scope, enabled }) => ({ id, scope, enabled }))} />
              <div className="flex w-full flex-col gap-4">
                {data.jobs.map((job) => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3"><div>
                  <p className="font-mono text-sm">{job.scope === "activity" ? "Earn + crypto transfers" : job.scope.slice(5)} · <Badge variant={job.error ? "destructive" : job.completedAt && !binanceFailing ? "success" : "outline"}>{!job.enabled ? "Paused" : job.error ? "Needs attention" : binanceFailing ? "Waiting on Binance" : job.completedAt ? "Caught up" : "In progress"}</Badge></p>
                  <p className="text-sm text-muted-foreground">{job.scope === "activity" ? dayRangeLabel(job.fromDate, job.toDate) : "All available trades"}{job.lastSyncedAt ? ` · Last run ${dayLabel(job.lastSyncedAt.toISOString().slice(0, 10))}` : ""}</p>
                  {job.error && <p className="text-sm text-destructive">{job.error}</p>}
                </div><HistoryToggle id={job.id} enabled={job.enabled} /></div>)}
              </div>
            </>}
          </section>
          <section aria-label="What's imported" className="flex flex-col items-start gap-3">
            <div className="flex w-full items-center justify-between gap-2"><h3 className="font-display uppercase">What&apos;s imported</h3>
              <InfoNote label="About dates" title="About these dates">
                <p>First and last record show the stored date span, not unbroken coverage. Upload more IBKR reports for missing periods; imports keep anything you already reviewed.</p>
              </InfoNote>
            </div>
            {data.coverage.map((c) => <p key={c.provider} className="text-sm">{providerName(c.provider)} · {c.total} entries · {dayRangeLabel(c.from, c.to)}</p>)}
            {!data.coverage.length && <p className="text-sm text-muted-foreground">No investment history imported yet.</p>}
            {data.reports.map((r) => <p key={r.id} className="text-sm text-muted-foreground">IBKR report · {dayRangeLabel(r.fromDate, r.toDate)} · {r.entries} entries</p>)}
            <ImportInvestmentButton />
          </section>
        </div>
      </FormSheet>
    </PageHeader>
    <PortfolioSections />
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <nav aria-label="Filter by account" className="flex flex-wrap gap-2">
        {["all", ...SYNC_PROVIDERS].map((p) => <Button key={p} asChild size="sm" variant={provider === p ? "default" : "outline"}><Link href={href({ provider: p })} aria-current={provider === p ? "true" : undefined}>{p === "all" ? "All accounts" : providerName(p)}</Link></Button>)}
      </nav>
      <Form action="/admin/history" role="search" className="w-full sm:ml-auto sm:w-64">
        <input type="hidden" name="provider" value={provider} />
        {type && <input type="hidden" name="type" value={type.value} />}
        <ButtonGroup className="w-full">
          <Input key={q} name="q" type="search" defaultValue={q} placeholder="Search history…" aria-label="Search history" autoComplete="off" />
          <Button type="submit" variant="outline" size="icon" aria-label="Search"><Search /></Button>
        </ButtonGroup>
      </Form>
    </div>
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant={type ? "ghost" : "secondary"}><Link href={href({ type: null })} aria-current={type ? undefined : "true"}>All types</Link></Button>
        {TYPES.map((t) => <Button key={t.value} asChild size="sm" variant={type?.value === t.value ? "secondary" : "ghost"}><Link href={href({ type: t.value })} aria-current={type?.value === t.value ? "true" : undefined}>{t.label}</Link></Button>)}
      </nav>
      <InfoNote label="What the statuses mean" title="Statuses">
        <p><strong>Posted</strong>: on your Overview as income or spending.</p>
        <p><strong>Reviewed</strong>: filed as investment activity, not spending.</p>
        <p><strong>Transfer</strong>: money moved between your own accounts.</p>
        <p><strong>Pending</strong>: waiting for AI to file it.</p>
      </InfoNote>
    </div>
    {!entries.length ? <EmptyState title={q || type ? "No matching history" : "No history in this view"}>{q || type ? "Try another word or type, or clear the filter." : "Import a report or continue a connected account’s history."}</EmptyState> : <Card className="mb-4 gap-0 overflow-hidden py-0"><Table>
      <TableHeader><TableRow><TableHead>Activity</TableHead>{anyTrade && <TableHead className="hidden lg:table-cell">Trade</TableHead>}<TableHead className="text-right">Amount</TableHead><TableHead className="hidden sm:table-cell">Status</TableHead></TableRow></TableHeader><TableBody>
        {entries.map((e) => <TableRow key={e.id}><TableCell className="whitespace-normal"><span className="group-data-[private=true]/shell:blur-sm">{e.description}</span><br /><span className="text-xs text-muted-foreground">{dayRangeLabel(e.occurredOn, e.occurredOn)} · {providerName(e.provider)} · {e.kind}<span className="sm:hidden"> · {e.status}</span></span></TableCell>
          {anyTrade && <TableCell className="hidden lg:table-cell">{e.trade ? <><NativeAmount value={e.trade.quantity} currency={e.trade.baseAsset} crypto /><br /><span className="text-xs">@ <NativeAmount value={e.trade.price} currency={e.trade.quoteAsset} crypto /></span></> : ""}</TableCell>}
          <TableCell className="text-right"><NativeAmount value={e.amount} currency={e.currency} crypto={e.provider !== "ibkr"} /></TableCell><TableCell className="hidden sm:table-cell"><Badge variant="outline">{e.status}</Badge></TableCell></TableRow>)}
      </TableBody></Table></Card>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{data.total} {data.total === 1 ? "entry" : "entries"} · page {page + 1} of {Math.max(1, Math.ceil(data.total / 50))}</p><div className="flex gap-2">
      {page > 0 && <Button asChild variant="outline" size="sm"><Link href={href({ page: page - 1 })}>Previous</Link></Button>}{(page + 1) * 50 < data.total && <Button asChild variant="outline" size="sm"><Link href={href({ page: page + 1 })}>Next</Link></Button>}
    </div></div>
  </>;
}
