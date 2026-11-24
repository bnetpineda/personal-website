import { daysBetween } from "./dates";

/*
 * A Philippine self-employed income tax estimate (TRAIN law, rates from January 1, 2023). Pure (no
 * I/O), unit-tested with `bun test`. It compares the two options a non-VAT freelancer can choose on
 * the first quarter's return:
 *   - 8% of gross receipts above ₱250,000, in place of the graduated rates and percentage tax
 *     (only while gross receipts stay at or under the ₱3,000,000 VAT threshold);
 *   - graduated rates on net income, here with the 40% optional standard deduction (OSD), plus 3%
 *     percentage tax on gross receipts.
 * It is an estimate to check with an accountant: it knows nothing of other income, itemized
 * deductions, creditable withholding (Form 2307) or zero-rated export services.
 */

/** Graduated income tax for individuals, 2023 onwards: tax = base + rate × (income − over). */
export const GRADUATED_BRACKETS = [
  { over: 0, base: 0, rate: 0 },
  { over: 250_000, base: 0, rate: 0.15 },
  { over: 400_000, base: 22_500, rate: 0.2 },
  { over: 800_000, base: 102_500, rate: 0.25 },
  { over: 2_000_000, base: 402_500, rate: 0.3 },
  { over: 8_000_000, base: 2_202_500, rate: 0.35 },
] as const;

/** The first ₱250,000 of gross receipts is not taxed under the 8% option. */
export const EIGHT_PERCENT_EXEMPT = 250_000;
export const EIGHT_PERCENT_RATE = 0.08;
/** Above this (the VAT threshold) the 8% option is not available. */
export const EIGHT_PERCENT_LIMIT = 3_000_000;
/** Optional standard deduction: 40% of gross receipts. */
export const OSD_RATE = 0.4;
/** Percentage tax for non-VAT taxpayers on graduated rates (back to 3% from July 1, 2023). */
export const PERCENTAGE_TAX_RATE = 0.03;

export function graduatedTax(taxable: number): number {
  if (!(taxable > 0)) return 0;
  const bracket = [...GRADUATED_BRACKETS].reverse().find((b) => taxable > b.over)!;
  return bracket.base + bracket.rate * (taxable - bracket.over);
}

export function eightPercentTax(gross: number): number {
  return EIGHT_PERCENT_RATE * Math.max(gross - EIGHT_PERCENT_EXEMPT, 0);
}

export interface TaxOptions {
  gross: number;
  /** Null when gross receipts are over the VAT threshold. */
  eightPercent: number | null;
  graduated: { taxable: number; incomeTax: number; percentageTax: number; total: number };
  /** The cheaper option, and by how much. */
  better: "eight" | "graduated";
  saving: number;
}

export function compareOptions(gross: number): TaxOptions {
  const taxable = gross * (1 - OSD_RATE);
  const incomeTax = graduatedTax(taxable);
  const percentageTax = gross * PERCENTAGE_TAX_RATE;
  const graduated = { taxable, incomeTax, percentageTax, total: incomeTax + percentageTax };
  const eightPercent = gross <= EIGHT_PERCENT_LIMIT ? eightPercentTax(gross) : null;
  const better = eightPercent != null && eightPercent <= graduated.total ? "eight" : "graduated";
  return { gross, eightPercent, graduated, better, saving: eightPercent == null ? 0 : Math.abs(graduated.total - eightPercent) };
}

/** Gross receipts in each quarter of `year` (PHP), from income entries. */
export function quarterlyReceipts(entries: readonly { occurredOn: string; amountPhp: number }[], year: number): [number, number, number, number] {
  const q: [number, number, number, number] = [0, 0, 0, 0];
  for (const e of entries) {
    if (Number(e.occurredOn.slice(0, 4)) !== year) continue;
    q[Math.floor((Number(e.occurredOn.slice(5, 7)) - 1) / 3)] += e.amountPhp;
  }
  return q;
}

export interface TaxDeadline {
  /** "Q1", "Q2", "Q3" or "Annual". */
  period: string;
  form: "1701Q" | "1701A";
  dueOn: string;
  /** Gross receipts from January 1 to the end of the period. */
  cumulative: number;
  /** What this return would ask you to pay under each option: tax on the year so far minus earlier quarters. */
  eightPercent: number | null;
  graduated: number;
  /** "past" once the due date has gone by; the first one still to come is "next". */
  status: "past" | "next" | "later";
}

/**
 * The year's income tax returns: 1701Q for the first three quarters (May 15, Aug 15, Nov 15) and
 * the annual 1701A (April 15 the year after), each with what it would be due on the receipts so far.
 * Quarterly returns are cumulative: each one computes tax on the year to date and subtracts what
 * earlier quarters paid. Percentage tax (2551Q) is filed separately and is not in these figures.
 */
export function taxDeadlines(year: number, quarters: readonly number[], today: string): TaxDeadline[] {
  const periods = [
    { period: "Q1", form: "1701Q" as const, dueOn: `${year}-05-15`, quarters: 1 },
    { period: "Q2", form: "1701Q" as const, dueOn: `${year}-08-15`, quarters: 2 },
    { period: "Q3", form: "1701Q" as const, dueOn: `${year}-11-15`, quarters: 3 },
    { period: "Annual", form: "1701A" as const, dueOn: `${year + 1}-04-15`, quarters: 4 },
  ];
  let paidEight = 0;
  let paidGraduated = 0;
  let nextFound = false;
  return periods.map((p) => {
    const cumulative = quarters.slice(0, p.quarters).reduce((a, b) => a + b, 0);
    const eight = cumulative <= EIGHT_PERCENT_LIMIT ? eightPercentTax(cumulative) : null;
    const graduated = graduatedTax(cumulative * (1 - OSD_RATE));
    const row: TaxDeadline = {
      period: p.period,
      form: p.form,
      dueOn: p.dueOn,
      cumulative,
      eightPercent: eight == null ? null : Math.max(eight - paidEight, 0),
      graduated: Math.max(graduated - paidGraduated, 0),
      status: daysBetween(today, p.dueOn) < 0 ? "past" : nextFound ? "later" : "next",
    };
    if (row.status === "next") nextFound = true;
    paidEight = Math.max(paidEight, eight ?? paidEight);
    paidGraduated = Math.max(paidGraduated, graduated);
    return row;
  });
}

/**
 * The year's gross receipts if the rest of it goes like the part already over: receipts so far
 * scaled by the share of the year elapsed. A past year returns what it recorded.
 */
export function projectedYear(receiptsSoFar: number, year: number, today: string): number {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  if (today >= end) return receiptsSoFar;
  const elapsed = daysBetween(start, today) + 1;
  if (elapsed <= 0) return 0;
  return (receiptsSoFar * daysBetween(start, end)) / elapsed;
}

/**
 * Income categories that aren't business receipts by default: investment returns, gifts, refunds. Salary
 * stays in: a freelancer paid monthly by clients often files it there. Leave it out by hand if it's
 * pay as an employee.
 */
const NOT_RECEIPTS = /invest|interest|dividend|gift|refund|cashback|reimburs|transfer|allowance/i;

export function countsAsReceipts(categoryName: string): boolean {
  return !NOT_RECEIPTS.test(categoryName);
}
