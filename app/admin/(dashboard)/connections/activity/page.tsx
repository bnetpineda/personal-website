import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCategories } from "@/lib/dal";
import { PROVIDER_META } from "@/lib/finance/connections/types";
import { dayRangeLabel } from "@/lib/finance/dates";
import { BANK_ACTIVITY_PAGE, getBankActivity, type BankActivityFilter } from "@/lib/finance/imports/dal";
import { BANK_FILING_LABELS, bankFiling, refileChoices, type BankFiling } from "@/lib/finance/imports/review";
import { RefileActions } from "../../../_components/bank-activity";
import { NativeAmount } from "../../../_components/import-controls";
import { EmptyState, InfoNote, PageHeader } from "../../../_components/ui";

export const metadata: Metadata = { title: "Bank activity" };

const BANKS = ["wise", "maribank", "gotyme"] as const;
const FILTERS: readonly { value: BankActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "posted", label: BANK_FILING_LABELS.posted },
  { value: "transfer", label: "Transfers" },
  { value: "duplicate", label: BANK_FILING_LABELS.duplicate },
  { value: "ignored", label: BANK_FILING_LABELS.ignored },
  { value: "pending", label: BANK_FILING_LABELS.pending },
];
const BADGE: Record<BankFiling, "success" | "outline" | "warning" | "secondary"> = {
  posted: "success", transfer: "outline", ignored: "secondary", duplicate: "warning", pending: "outline", investment: "outline",
};

/**
 * Every bank statement line and where it went. Rules and AI file imports without asking, so this is
 * where a misfiled salary or a payment wrongly taken for a transfer is found and put right.
 */
export default async function BankActivityPage({ searchParams }: { searchParams: Promise<{ bank?: string; filter?: string; q?: string; page?: string }> }) {
  const params = await searchParams;
  const bank = BANKS.find((b) => b === params.bank) ?? "all";
  const filter = FILTERS.find((f) => f.value === params.filter)?.value ?? "all";
  const page = /^\d{1,5}$/.test(params.page ?? "") ? Number(params.page) : 0;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const [data, categories] = await Promise.all([getBankActivity({ provider: bank, filter, q, page }), getCategories()]);
  const href = (next: { bank?: string; filter?: string; page?: number } = {}) => {
    const query = new URLSearchParams();
    const b = next.bank ?? bank, f = next.filter ?? filter;
    if (b !== "all") query.set("bank", b);
    if (f !== "all") query.set("filter", f);
    if (q) query.set("q", q);
    if (next.page) query.set("page", String(next.page));
    const s = query.toString();
    return s ? `/admin/connections/activity?${s}` : "/admin/connections/activity";
  };
  const options = (income: boolean) => categories.filter((c) => !c.archived && c.kind === (income ? "income" : "expense"))
    .map(({ id, name, color, archived }) => ({ id, name, color, archived }));
  const countOf = (f: BankActivityFilter) => f === "all" ? [...data.counts.values()].reduce((a, b) => a + b, 0) : data.counts.get(f) ?? 0;
  return <>
    <PageHeader title="Bank activity">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/connections"><ChevronLeft /> Accounts</Link></Button>
      <InfoNote title="How bank imports are filed">
        <p>Each Wise, MariBank and GoTyme line is filed when it&apos;s imported: by your rules first, then by AI. Nothing waits for you to review it, so check here when a total looks off.</p>
        <p><strong>In Transactions</strong>: counted as income or spending. <strong>Transfer</strong>: money between your own accounts, left out of spending. <strong>Already in Transactions</strong>: the same amount on the same day was already logged by you or a schedule.</p>
        <p>Re-filing is your decision: AI won&apos;t change it again, and learns from it.</p>
      </InfoNote>
    </PageHeader>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <nav aria-label="Filter by bank" className="flex flex-wrap gap-2">
        {(["all", ...BANKS] as const).map((b) => <Button key={b} asChild size="sm" variant={bank === b ? "default" : "outline"}>
          <Link href={href({ bank: b, page: 0 })} aria-current={bank === b ? "true" : undefined}>{b === "all" ? "All banks" : PROVIDER_META[b].name}</Link></Button>)}
      </nav>
      <Form action="/admin/connections/activity" role="search" className="w-full sm:ml-auto sm:w-64">
        {bank !== "all" && <input type="hidden" name="bank" value={bank} />}
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <ButtonGroup className="w-full">
          <Input key={q} name="q" type="search" defaultValue={q} placeholder="Search bank activity…" aria-label="Search bank activity" autoComplete="off" />
          <Button type="submit" variant="outline" size="icon" aria-label="Search"><Search /></Button>
        </ButtonGroup>
      </Form>
    </div>
    <nav aria-label="Filter by how it was filed" className="mb-4 flex flex-wrap gap-2">
      {FILTERS.map((f) => <Button key={f.value} asChild size="sm" variant={filter === f.value ? "secondary" : "ghost"}>
        <Link href={href({ filter: f.value, page: 0 })} aria-current={filter === f.value ? "true" : undefined}>{f.label} ({countOf(f.value)})</Link></Button>)}
    </nav>
    {!data.entries.length ? (
      <EmptyState title={q || filter !== "all" || bank !== "all" ? "Nothing matches" : "No bank imports yet"}>
        {q || filter !== "all" || bank !== "all" ? "Try another word or filter." : "Upload a Wise, MariBank or GoTyme statement on Accounts."}
      </EmptyState>
    ) : (
      <Card className="mb-4 gap-0 overflow-hidden py-0"><Table>
        <TableHeader><TableRow>
          <TableHead>Activity</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="hidden md:table-cell">Filed as</TableHead><TableHead><span className="sr-only">Re-file</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.entries.map((e) => {
            const filing = bankFiling(e);
            const reason = filing === "duplicate" ? e.aiReason?.replace(/^Already in Transactions:\s*/, "") : e.aiReason;
            const by = e.categorizedBy === "manual" ? "you" : e.categorizedBy === "rule" ? "a rule" : e.categorizedBy === "ai" ? "AI" : null;
            const status = <>
              <Badge variant={BADGE[filing]}>{BANK_FILING_LABELS[filing]}</Badge>
              {e.category && <span className="text-xs"> {e.category}</span>}
              <br />
              <span className="text-xs text-muted-foreground">
                {[by && `By ${by}`, reason].filter(Boolean).join(": ")}
                {e.partner && <> · Paired with <span className="group-data-[private=true]/shell:blur-sm">{e.partner.description}</span> ({PROVIDER_META[e.partner.provider].name}, {dayRangeLabel(e.partner.occurredOn, e.partner.occurredOn)})</>}
              </span>
            </>;
            return <TableRow key={e.id}>
              <TableCell className="whitespace-normal">
                <span className="group-data-[private=true]/shell:blur-sm">{e.description}</span>
                <br />
                <span className="text-xs text-muted-foreground">{dayRangeLabel(e.occurredOn, e.occurredOn)} · {PROVIDER_META[e.provider].name}</span>
                <span className="mt-1 block md:hidden">{status}</span>
              </TableCell>
              <TableCell className="text-right align-top"><NativeAmount value={e.amount} currency={e.currency} /></TableCell>
              <TableCell className="hidden whitespace-normal align-top md:table-cell">{status}</TableCell>
              <TableCell className="w-10 align-top">
                <RefileActions id={e.id} description={e.description} income={e.amount > 0} choices={refileChoices(e)} categories={options(e.amount > 0)} />
              </TableCell>
            </TableRow>;
          })}
        </TableBody>
      </Table></Card>
    )}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{data.total} {data.total === 1 ? "entry" : "entries"} · page {page + 1} of {Math.max(1, Math.ceil(data.total / BANK_ACTIVITY_PAGE))}</p>
      <div className="flex gap-2">
        {page > 0 && <Button asChild variant="outline" size="sm"><Link href={href({ page: page - 1 })}>Previous</Link></Button>}
        {(page + 1) * BANK_ACTIVITY_PAGE < data.total && <Button asChild variant="outline" size="sm"><Link href={href({ page: page + 1 })}>Next</Link></Button>}
      </div>
    </div>
  </>;
}
