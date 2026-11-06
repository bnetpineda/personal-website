import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getConnections, getFx, getRecordedMonths } from "@/lib/dal";
import { fxToPhp, sumInPhp } from "@/lib/finance/calc";
import { CURRENCIES } from "@/lib/finance/constants";
import { currentMonth, isMonth, monthLabel } from "@/lib/finance/dates";
import { getEarnings } from "@/lib/finance/imports/dal";
import { amountInUsd, unitPricesUsd } from "@/lib/finance/returns";
import { PortfolioSections } from "../../_components/admin-nav";
import { openingMonth } from "../../_components/nav";
import { NativeAmount } from "../../_components/import-controls";
import { EmptyState, InfoNote, Money, MonthPicker, PageHeader, Panel, StatCards } from "../../_components/ui";

export const metadata: Metadata = { title: "Earnings" };

type EarningsRow = Awaited<ReturnType<typeof getEarnings>>["rows"][number];
type Column = readonly [label: string, key: Exclude<keyof EarningsRow, "currency">];

const EARNED: readonly Column[] = [["Earn rewards", "rewards"], ["Dividends", "dividends"], ["Interest", "interest"], ["Realized P/L", "realized"]];
const FLOWS: readonly Column[] = [["Net contributions", "contributions"], ["Fees", "fees"], ["Taxes", "taxes"]];
const isFiat = (currency: string) => (CURRENCIES as readonly string[]).includes(currency);

/** Only the columns and rows with something in them: a table of zeros hides what's there. */
function AmountsTable({ rows, columns }: { rows: EarningsRow[]; columns: readonly Column[] }) {
  const has = (r: EarningsRow, key: Column[1]) => r[key] != null && r[key] !== 0;
  // Fees and taxes are kept as positive totals; they read as what they are, money out.
  const shownValue = (r: EarningsRow, key: Column[1]) => (key === "fees" || key === "taxes" ? -r[key]! : r[key]!);
  const shown = columns.filter(([, key]) => rows.some((r) => has(r, key)));
  const kept = rows.filter((r) => shown.some(([, key]) => has(r, key)));
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Asset</TableHead>{shown.map(([label]) => <TableHead key={label} className="text-right">{label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{kept.map((r) => <TableRow key={r.currency}><TableCell>{r.currency}</TableCell>{shown.map(([label, key]) => <TableCell key={label} className="text-right font-mono">{has(r, key) ? <NativeAmount value={shownValue(r, key)} currency={r.currency} crypto={!isFiat(r.currency)} /> : ""}</TableCell>)}</TableRow>)}</TableBody>
    </Table>
  );
}

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams, current = currentMonth(), month = isMonth(params.month) ? params.month : current;
  // All time unless a month was chosen: this month is usually empty until statements arrive.
  const allTime = !isMonth(params.month);
  const [data, fx, recorded, connections] = await Promise.all([getEarnings(allTime ? null : month), getFx(), getRecordedMonths(), getConnections()]);
  const startMonth = openingMonth(recorded, current) ?? current;
  const any = (columns: readonly Column[]) => data.rows.some((r) => columns.some(([, key]) => r[key] != null && r[key] !== 0));
  // One answer to "what did I earn?": everything earned, coins included at today's prices from your own balances.
  const prices = unitPricesUsd(connections.flatMap((c) => c.snapshot?.positions ?? []), fx);
  const usdToPhp = fxToPhp(fx, "USD");
  const earnedRows = data.rows.filter((r) => r.rewards + r.dividends + r.interest + (r.realized ?? 0) !== 0);
  const valued = earnedRows.map((r) => ({ currency: r.currency, usd: amountInUsd(r.rewards + r.dividends + r.interest + (r.realized ?? 0), r.currency, prices, fx) }));
  const unvalued = valued.filter((v) => v.usd == null).map((v) => v.currency);
  const earnedPhp = usdToPhp == null || !earnedRows.length ? null : valued.reduce((sum, v) => sum + (v.usd ?? 0), 0) * usdToPhp;
  const costs = sumInPhp(fx, data.rows.filter((r) => isFiat(r.currency)).map((r) => ({ amount: r.fees + r.taxes, currency: r.currency })));
  const coins = data.rows.filter((r) => !isFiat(r.currency) && r.rewards !== 0).length;
  return <>
    <PageHeader title="Portfolio">
      {!allTime && <MonthPicker month={month} current={current} href={(m) => `/admin/earnings?month=${m}`} />}
    </PageHeader>
    <PortfolioSections />
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button asChild size="sm" variant={allTime ? "default" : "outline"}><Link href="/admin/earnings">All time</Link></Button>
      <Button asChild size="sm" variant={allTime ? "outline" : "default"}><Link href={`/admin/earnings?month=${allTime ? startMonth : month}`}>By month</Link></Button>
      <InfoNote title="How earnings add up">
        <p>Totals cover imported Binance, IBKR and Hyperliquid records {allTime ? "across all imported dates" : "for this month"}, in their original currency, including activity AI hasn&apos;t filed yet. Ignored entries are excluded.</p>
        <p>Contributions count deposits and withdrawals filed as transfers; transfers between your own investment accounts are excluded. For the return with transfers taken out, see the Return card on <Link href="/admin/holdings" className="underline underline-offset-4">Holdings</Link>.</p>
        <p>IBKR realized P/L already includes trade commissions: fees are shown separately, not to be subtracted again. Hyperliquid&apos;s realized P/L is before trade fees, and perp funding is under Interest.</p>
        <p>The peso total is an estimate at today&apos;s exchange rate, so it can move. Entries on the Overview are different: each keeps the rate from when it was recorded, so their totals don&apos;t change.</p>
        <p>The headline values coins at today&apos;s prices, taken from your own balances, not at the price on the day you received them; the tables keep coin amounts. Binance per-pair cost estimates are in <Link href="/admin/history" className="underline underline-offset-4">History</Link>.</p>
      </InfoNote>
    </div>
    {!any(EARNED) && !any(FLOWS) ? (
      <EmptyState title={allTime ? "No imported earnings yet" : "No earnings this month"}>{allTime ? "Connect Binance, IBKR or Hyperliquid to start collecting rewards, dividends and trade results." : "Try All time, or another month."}</EmptyState>
    ) : (
      <>
        <StatCards
          items={[
            {
              label: unvalued.length ? "Earned from investments, partial" : "Earned from investments",
              value: earnedPhp == null ? "—" : <Money value={earnedPhp} signed tone />,
              primary: true,
              hint: earnedPhp == null ? "Needs a US dollar exchange rate" : <>
                Rewards, dividends, interest and realized P/L, {allTime ? "all time" : monthLabel(month)}, before fees and tax
                <span className="mt-1 block">An estimate at today&apos;s prices and rates{coins > 0 && ", coins included"}</span>
                {unvalued.length > 0 && <span className="mt-1 block">Leaves out {unvalued.join(", ")}: no price today</span>}
              </>,
            },
            {
              label: "Fees and taxes",
              value: costs.total === 0 ? "—" : <Money value={-costs.total} signed />,
              hint: costs.total === 0 ? "None in this period" : "In cash, at today's rate. IBKR's trade commissions are already in its realized P/L",
            },
          ]}
        />
        <p className="mb-4 text-sm text-muted-foreground">Gains and losses on what you still own are on <Link href="/admin/holdings" className="underline underline-offset-4">Holdings</Link>; estimated results of past coin trades are on <Link href="/admin/history" className="underline underline-offset-4">History</Link>.</p>
        <div className="flex flex-col gap-6">
          {any(EARNED) && <Panel title="What you earned"><AmountsTable rows={data.rows} columns={EARNED} /></Panel>}
          {any(FLOWS) && <Panel title="Money in and costs"><AmountsTable rows={data.rows} columns={FLOWS} /></Panel>}
        </div>
      </>
    )}
  </>;
}
