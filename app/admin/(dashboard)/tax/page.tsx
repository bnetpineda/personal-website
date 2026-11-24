import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Swatch } from "@/components/ui/swatch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCategories, getFx, getIncomeForYear, getIncomeYears, getTaxWithheld } from "@/lib/dal";
import { sumInPhp } from "@/lib/finance/calc";
import { PROVIDER_META } from "@/lib/finance/connections/types";
import { fullDayLabel, todayManila } from "@/lib/finance/dates";
import {
  EIGHT_PERCENT_EXEMPT,
  EIGHT_PERCENT_LIMIT,
  OSD_RATE,
  PERCENTAGE_TAX_RATE,
  compareOptions,
  countsAsReceipts,
  projectedYear,
  quarterlyReceipts,
  taxDeadlines,
} from "@/lib/finance/tax";
import { EmptyState, InfoNote, MissingFxAlert, Money, PageHeader, Panel, Pct, StatCards } from "../../_components/ui";

/** Server Actions run under the calling page's limit (⌘K can sync from any page); see lib/finance/deadline.ts. */
export const maxDuration = 120;

export const metadata: Metadata = { title: "Tax estimate" };

type Params = { year?: string; skip?: string };

/** `?skip=` lists income categories left out of receipts; without it, the defaults apply. */
function skippedIds(params: Params, categories: { id: number; name: string }[]): Set<number> {
  if (typeof params.skip !== "string") return new Set(categories.filter((c) => !countsAsReceipts(c.name)).map((c) => c.id));
  return new Set(params.skip.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0));
}

const href = (year: number, skip: Set<number>) => `/admin/tax?${new URLSearchParams({ year: String(year), skip: [...skip].sort((a, b) => a - b).join(",") })}`;

/**
 * A self-employed income tax estimate for the Philippines: gross receipts by quarter, the 8% option
 * against graduated rates, and the year's returns with what each would ask for. An estimate only.
 */
export default async function TaxPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const today = todayManila();
  const thisYear = Number(today.slice(0, 4));
  const requested = Number(params.year);
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= thisYear ? requested : thisYear;
  const [categories, income, years, withheld, fx] = await Promise.all([getCategories("income"), getIncomeForYear(year), getIncomeYears(), getTaxWithheld(year), getFx()]);

  const skip = skippedIds(params, categories);
  const receipts = income.filter((e) => !skip.has(e.categoryId));
  const quarters = quarterlyReceipts(receipts, year);
  const soFar = quarters.reduce((a, b) => a + b, 0);
  const closed = year < thisYear;
  const fullYear = projectedYear(soFar, year, today);
  const options = compareOptions(fullYear);
  const deadlines = taxDeadlines(year, quarters, today);
  const byCategory = new Map<number, number>();
  for (const e of income) byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amountPhp);
  const shownCategories = categories.filter((c) => (byCategory.get(c.id) ?? 0) > 0 || !c.archived);
  const withheldPhp = sumInPhp(fx, withheld.map((w) => ({ amount: w.total, currency: w.currency })));
  const yearOptions = [...new Set([thisYear, ...years.filter((y) => y <= thisYear)])].sort((a, b) => b - a).slice(0, 6);
  const optionLabel = (o: "eight" | "graduated") => (o === "eight" ? "8% option" : "Graduated + 3%");

  return (
    <>
      <PageHeader title="Tax estimate">
        <InfoNote title="How this is worked out">
          <p>Gross receipts are the income entries in the categories marked below, in PHP at the rate when each was recorded.</p>
          <p>The 8% option taxes gross receipts above <Money value={EIGHT_PERCENT_EXEMPT} /> at 8%, in place of graduated rates and percentage tax. It isn&apos;t available above <Money value={EIGHT_PERCENT_LIMIT} />.</p>
          <p>Graduated rates use the 2023 table on net income after the {OSD_RATE * 100}% optional standard deduction, plus {PERCENTAGE_TAX_RATE * 100}% percentage tax on gross receipts (Form 2551Q, filed separately).</p>
          <p>Quarterly returns are cumulative: each one works out tax on the year so far and takes off what earlier quarters paid.</p>
          <p>It doesn&apos;t know about other income, itemized deductions, Form 2307 withholding, or services exported at zero rate. Confirm with an accountant before you file.</p>
        </InfoNote>
      </PageHeader>

      <Alert className="mb-4">
        <AlertTitle>An estimate, not tax advice</AlertTitle>
        <AlertDescription>Built from what you&apos;ve recorded here. Check the figures and your choice of option with an accountant or the BIR before filing.</AlertDescription>
      </Alert>

      {yearOptions.length > 1 && (
        <nav aria-label="Year" className="mb-4 flex flex-wrap gap-2">
          {yearOptions.map((y) => (
            <Button key={y} asChild size="sm" variant={y === year ? "default" : "outline"}>
              <Link href={href(y, skip)} aria-current={y === year ? "page" : undefined}>
                {y}
              </Link>
            </Button>
          ))}
        </nav>
      )}

      <StatCards
        items={[
          { label: closed ? `Gross receipts · ${year}` : `Gross receipts · ${year} so far`, value: <Money value={soFar} />, primary: true, hint: `${receipts.length} income ${receipts.length === 1 ? "entry" : "entries"}` },
          ...(closed ? [] : [{ label: "Full year at this pace", value: <Money value={fullYear} />, hint: "The year so far, scaled to twelve months" }]),
          {
            label: "Cheaper option",
            value: soFar > 0 ? optionLabel(options.better) : "—",
            hint: soFar > 0 ? (options.eightPercent == null ? "Over the ₱3M limit for 8%" : <>Saves about <Money value={options.saving} compact /> a year</>) : "No receipts recorded",
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title={closed ? `The two options · ${year}` : `The two options · full year at this pace`}>
          {soFar === 0 ? (
            <EmptyState size="sm" title="No receipts yet">Income in the categories below shows up here.</EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead className="text-right">8% option</TableHead>
                    <TableHead className="text-right">Graduated + 3%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Income tax</TableCell>
                    <TableCell className="text-right font-mono">{options.eightPercent == null ? "Not available" : <Money value={options.eightPercent} />}</TableCell>
                    <TableCell className="text-right font-mono"><Money value={options.graduated.incomeTax} /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Percentage tax</TableCell>
                    <TableCell className="text-right font-mono">{options.eightPercent == null ? "" : <Money value={0} />}</TableCell>
                    <TableCell className="text-right font-mono"><Money value={options.graduated.percentageTax} /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-mono font-bold">{options.eightPercent == null ? "" : <Money value={options.eightPercent} />}</TableCell>
                    <TableCell className="text-right font-mono font-bold"><Money value={options.graduated.total} /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Share of receipts</TableCell>
                    <TableCell className="text-right font-mono">{options.eightPercent == null ? "" : <Pct value={fullYear > 0 ? options.eightPercent / fullYear : null} />}</TableCell>
                    <TableCell className="text-right font-mono"><Pct value={fullYear > 0 ? options.graduated.total / fullYear : null} /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                You choose on the first quarter&apos;s return ({fullDayLabel(`${year}-05-15`)}) and it holds for the whole year. Without a choice, graduated rates apply.
              </p>
            </div>
          )}
        </Panel>

        <div className="min-w-0 lg:col-span-2 lg:row-start-2">
        <Panel title={`Returns · ${year}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Receipts to date</TableHead>
                <TableHead className="text-right">8%</TableHead>
                <TableHead className="text-right">Graduated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deadlines.map((d) => (
                <TableRow key={d.period}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {d.period} · {d.form}
                      {d.status === "next" && <Badge variant="warning">Next</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>{fullDayLabel(d.dueOn)}</TableCell>
                  <TableCell className="text-right font-mono"><Money value={d.cumulative} /></TableCell>
                  <TableCell className="text-right font-mono">{d.eightPercent == null ? "—" : <Money value={d.eightPercent} />}</TableCell>
                  <TableCell className="text-right font-mono"><Money value={d.graduated} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            What each return would ask you to pay on receipts recorded so far, before any tax withheld by clients. Graduated figures leave out the {PERCENTAGE_TAX_RATE * 100}% percentage tax, filed on Form 2551Q by the 25th after each quarter. A due date on a weekend or holiday moves to the next working day.
          </p>
        </Panel>
        </div>

        <Panel title="Counted as receipts">
          <p className="mb-3 text-xs text-muted-foreground">Tap a category to count it or leave it out. Investment income, gifts and refunds start out left out. Leave out pay you get as an employee.</p>
          <div className="flex flex-wrap gap-2">
            {shownCategories.map((c) => {
              const counted = !skip.has(c.id);
              const next = new Set(skip);
              if (counted) next.add(c.id);
              else next.delete(c.id);
              return (
                <Button key={c.id} asChild size="sm" variant={counted ? "default" : "outline"}>
                  <Link href={href(year, next)} replace scroll={false} aria-label={`${c.name}, ${counted ? "counted" : "left out"}: ${counted ? "leave it out" : "count it"}`}>
                    <Swatch color={c.color} size="sm" />
                    {c.name}
                    <span className="font-mono"><Money value={byCategory.get(c.id) ?? 0} compact /></span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </Panel>

        <Panel title="Already withheld">
          {withheld.length === 0 ? (
            <EmptyState size="sm" title="Nothing withheld">Tax your bank or broker takes at source shows up here once its statements are imported.</EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              <MissingFxAlert currencies={withheldPhp.missing} />
              <Table>
                <TableBody>
                  {withheld.map((w) => (
                    <TableRow key={`${w.provider}-${w.currency}`}>
                      <TableCell>{PROVIDER_META[w.provider]?.name ?? w.provider}</TableCell>
                      <TableCell className="text-right font-mono"><Money value={w.total} currency={w.currency} /></TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-bold">Total</TableCell>
                    <TableCell className="text-right font-mono font-bold"><Money value={withheldPhp.total} /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">Mostly final tax on bank interest and tax on dividends abroad. Final tax is already settled, so it isn&apos;t taken off the estimate above.</p>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
