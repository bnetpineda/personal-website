import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCategories } from "@/lib/dal";
import { getInbox } from "@/lib/finance/imports/dal";
import { CATEGORIZED_BY, ENTRY_STATUSES, type CategorizedBy, type EntryStatus } from "@/lib/finance/imports/types";
import { PROVIDERS, PROVIDER_META, type Provider } from "@/lib/finance/connections/types";
import { AddRuleButton, AiCategorizeButton, ApplyRulesButton, ImportWiseButton, NativeAmount, ReopenImportButton, ReviewButton, RuleToggle, TransferButton } from "../../_components/import-controls";
import { FinanceLinks } from "../../_components/finance-links";
import { EmptyState, PageHeader, Panel } from "../../_components/ui";

// AI categorization of a large backlog can take a few model calls.
export const maxDuration = 300;
const BY_LABEL: Record<CategorizedBy, string> = { ai: "AI", rule: "rules", manual: "you" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; provider?: string; by?: string }> }) {
  const params = await searchParams;
  const status = params.status === "all" ? "all" : ENTRY_STATUSES.includes(params.status as EntryStatus) ? params.status as EntryStatus : "pending";
  const page = /^\d{1,5}$/.test(params.page ?? "") ? Number(params.page) : 0;
  const provider = PROVIDERS.includes(params.provider as Provider) ? params.provider as Provider : undefined;
  const by = CATEGORIZED_BY.includes(params.by as CategorizedBy) ? params.by as CategorizedBy : undefined;
  const [data, categories] = await Promise.all([getInbox(status, page, { provider, by }), getCategories()]);
  const href = (s: string, p = 0, next: { provider?: Provider; by?: CategorizedBy } = { provider, by }) =>
    `/admin/inbox?${new URLSearchParams({ status: s, page: String(p), ...(next.provider && { provider: next.provider }), ...(next.by && { by: next.by }) })}`;
  return <>
    <PageHeader eyebrow="Private finance · automation" title="Import inbox"><ImportWiseButton /><ApplyRulesButton /><AiCategorizeButton /></PageHeader>
    <FinanceLinks current="inbox" />
    <p className="mb-6 text-sm text-muted-foreground">Your category rules run first, then AI categorizes the rest after each sync and import: spending and income go to Transactions, and investment activity and transfers between your own accounts stay out of your budget. Anything it cannot place, or is not sure about, stays here with its suggestion filled in. Pending entries do not affect budgets. Wise closing balances update Holdings only when selected in the import preview.</p>
    {data.suggestions.length > 0 && <div className="mb-6"><Panel title="Possible transfers between your accounts">
      <div className="flex flex-col gap-4">{data.suggestions.slice(0, 5).map(([a, b]) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">{PROVIDER_META[a.provider].name} → {PROVIDER_META[b.provider].name} · {a.occurredOn} · <NativeAmount value={Math.abs(a.amount)} currency={a.currency} crypto={a.provider === "binance"} /></p>
        <TransferButton entry={a} candidates={data.candidates} selected={b.id} />
      </div>)}</div>
    </Panel></div>}
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Inbox status">
      {["pending", "all", "posted", "transfer", "reviewed", "ignored"].map((s) => <Button key={s} asChild variant={status === s ? "default" : "outline"} size="sm"><Link href={href(s)}>{s === "pending" ? "Needs review" : s} {s !== "all" && `(${data.totals.find((r) => r.status === s)?.total ?? 0})`}</Link></Button>)}
    </div>
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Inbox source">
      {[undefined, ...PROVIDERS].map((p) => <Button key={p ?? "any"} asChild variant={provider === p ? "default" : "outline"} size="xs"><Link href={href(status, 0, { provider: p, by })}>{p ? PROVIDER_META[p].name : "Any source"}</Link></Button>)}
    </div>
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Categorized by">
      {[undefined, ...CATEGORIZED_BY].map((b) => <Button key={b ?? "any"} asChild variant={by === b ? "default" : "outline"} size="xs"><Link href={href(status, 0, { provider, by: b })}>{b ? `By ${BY_LABEL[b]}` : "Anyone"}</Link></Button>)}
    </div>
    {!data.entries.length ? <EmptyState title="Your inbox is clear">Import a Wise CSV or sync connected Binance and IBKR accounts. New activity will appear here.</EmptyState> : <Card className="mb-4 gap-0 overflow-hidden py-0"><Table>
      <TableHeader><TableRow><TableHead>Activity</TableHead><TableHead className="text-right">Native amount</TableHead><TableHead>Review</TableHead></TableRow></TableHeader>
      <TableBody>{data.entries.map((e) => <TableRow key={e.id}>
        <TableCell><p>{e.description}</p><p className="text-xs text-muted-foreground">{e.occurredOn} · {PROVIDER_META[e.provider].name} · {e.kind}</p><p className="text-xs text-muted-foreground">{e.categoryId ? `Category: ${categories.find((c) => c.id === e.categoryId)?.name ?? "Unavailable"}` : ""}</p>{e.categorizedBy === "ai" && e.aiReason && <p className="text-xs text-muted-foreground">AI · {e.aiReason}</p>}</TableCell>
        <TableCell className="text-right font-mono"><NativeAmount value={e.amount} currency={e.currency} crypto={e.provider === "binance"} /></TableCell>
        <TableCell><div className="flex flex-wrap gap-2">{e.status === "pending" ? <><ReviewButton entry={e} categories={categories} />{["payment", "transfer", "other"].includes(e.kind) && <TransferButton entry={e} candidates={data.candidates} />}</>
          : <><Badge variant="outline">{e.status}</Badge>{e.status !== "posted" && <ReopenImportButton id={e.id} />}{e.status === "posted" && <Button asChild variant="ghost" size="sm"><Link href={`/admin/transactions?month=${e.occurredOn.slice(0, 7)}`}>Transactions</Link></Button>}</>}</div></TableCell>
      </TableRow>)}</TableBody>
    </Table></Card>}
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{data.total} entries · page {page + 1}</p><div className="flex gap-2">{page > 0 && <Button asChild variant="outline" size="sm"><Link href={href(status, page - 1)}>Previous</Link></Button>}{(page + 1) * 50 < data.total && <Button asChild variant="outline" size="sm"><Link href={href(status, page + 1)}>Next</Link></Button>}</div></div>
    <Card><CardHeader className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Category rules</CardTitle><CardDescription>Most specific text wins. Up to 500 candidates per pass; larger imports continue on the next sync or Apply rules.</CardDescription></div><AddRuleButton categories={categories} /></CardHeader><CardContent>
      {!data.rules.length ? <p className="text-sm text-muted-foreground">Add a rule for a regular merchant, dividend description, or fee.</p> : <div className="flex flex-col gap-4">{data.rules.map((r) => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3"><div><p>“{r.contains}” → {categories.find((c) => c.id === r.categoryId)?.name ?? "Unavailable category"}</p><p className="text-xs text-muted-foreground">{r.provider ? PROVIDER_META[r.provider].name : "Any provider"} · {r.kind} · {r.autoPost ? "Automatic posting" : "Suggestion only"} · {r.enabled ? "Active" : "Paused"}</p></div><RuleToggle id={r.id} enabled={r.enabled} /></div>)}</div>}
    </CardContent></Card>
  </>;
}
