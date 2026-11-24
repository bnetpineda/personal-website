import type { StatementBalance } from "../statement-balances";
import type { PdfItem, PdfPage } from "./maribank";
import { ImportError, uniqueEntries, type EntryKind, type ImportEntry } from "./types";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const AMOUNT = /^-?\d{1,3}(?:,\d{3})*\.\d{2}$/;
const DAY = /^\d{1,2} [A-Za-z]{3} \d{4}$/;
const cents = (text: string) => Math.round(Number(text.replace(/^PHP\s*/i, "").replaceAll(",", "")) * 100);
const right = (item: PdfItem) => item.x + item.width;
const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** "04 Oct 2026" → "2026-10-04". */
function day(text: string): string {
  const [d, mon, year] = clean(text).split(" ");
  const month = MONTHS.indexOf(mon?.toUpperCase());
  if (month < 0 || !/^\d{1,2}$/.test(d) || !/^\d{4}$/.test(year)) throw new ImportError(`Unreadable date "${text}".`);
  const date = `${year}-${String(month + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
  if (Number(d) < 1 || Number(d) > new Date(Date.UTC(Number(year), month + 1, 0)).getUTCDate()) throw new ImportError(`Unreadable date "${text}".`);
  return date;
}

const sameLine = (page: PdfPage, y: number, tolerance = 3) => page.filter((i) => Math.abs(i.y - y) <= tolerance).sort((a, b) => a.x - b.x);
const labelled = (page: PdfPage, label: RegExp) => page.find((i) => label.test(clean(i.text)));
/**
 * The text right after a label, e.g. "Period:" → "01 Jun 2026 - 24 Nov 2026". Only runs that follow
 * each other closely count: the summary column shares some of these lines further right.
 */
function valueOf(page: PdfPage, label: RegExp, gap = 30): string | null {
  const item = labelled(page, label);
  if (!item) return null;
  const value: PdfItem[] = [];
  for (const next of sameLine(page, item.y, 2).filter((i) => i.x > item.x)) {
    if (next.x - right(value.at(-1) ?? item) > gap) break;
    value.push(next);
  }
  return value.length ? clean(value.map((i) => i.text).join(" ")) : null;
}
/** A summary figure: "PHP 72,414.61", right-aligned well away from its label. Only peso statements are supported. */
function summaryAmount(page: PdfPage, label: RegExp): number {
  const value = valueOf(page, label, 150);
  if (!value) throw new ImportError("The statement summary could not be read.");
  if (!/^PHP /i.test(value)) throw new ImportError("Only peso (PHP) GoTyme statements are supported.");
  if (!AMOUNT.test(value.slice(4).trim())) throw new ImportError("The statement summary could not be read.");
  return cents(value);
}

interface Columns { dateX: number; textX: number; creditsX: number; creditsRight: number; debitsRight: number; balanceRight: number; headerY: number }

/** The "Date · Details · Credits · Debits · Running Balance" header, repeated at the top of each page. */
function columnsOf(page: PdfPage): Columns | null {
  const credits = page.find((i) => clean(i.text).toUpperCase() === "CREDITS");
  if (!credits) return null;
  const line = sameLine(page, credits.y);
  const find = (word: string) => line.find((i) => clean(i.text).toUpperCase() === word);
  const debits = find("DEBITS"), details = find("DETAILS"), date = find("DATE");
  // "Running" and "Balance" sit on two lines either side of the header row.
  const balance = page.filter((i) => Math.abs(i.y - credits.y) <= 8 && /^(?:running|balance|running balance)$/i.test(clean(i.text)) && i.x > (debits?.x ?? Infinity));
  if (!debits || !details || !date || !balance.length) return null;
  return { dateX: date.x, textX: details.x, creditsX: credits.x, creditsRight: right(credits), debitsRight: right(debits),
    balanceRight: Math.max(...balance.map(right)), headerY: credits.y };
}

/**
 * Words a row the way it reads to a person, without the masked account or card number:
 * "Transfer from X, Account No. ••••1234" → "Received from X", "Card payment at X, Card •••• 1234" → "Card payment: X".
 */
export function describeGoTymeRow(details: string): { kind: EntryKind; description: string } {
  const text = clean(details).replace(/,\s*(?:account|mobile) no\.?.*$/i, "").replace(/,\s*card\s*[•*·.x\d ]+$/i, "").trim();
  const words = (value: string) => clean(value).slice(0, 200);
  if (/\binterest\b/i.test(text)) return { kind: "interest", description: words(/^interest$/i.test(text) ? "GoTyme interest" : `GoTyme ${text.toLowerCase()}`) };
  if (/\bwithholding tax\b|\btax withheld\b/i.test(text)) return { kind: "tax", description: words(text) };
  if (/\bfee\b/i.test(text)) return { kind: "fee", description: words(text) };
  const from = /^transfer from (.+)$/i.exec(text);
  if (from) return { kind: "payment", description: words(`Received from ${from[1]}`) };
  const to = /^transfer to (.+)$/i.exec(text);
  if (to) return { kind: "payment", description: words(`Sent to ${to[1]}`) };
  const card = /^card payment at (.+)$/i.exec(text);
  if (card) return { kind: "payment", description: words(`Card payment: ${card[1]}`) };
  if (/^qr payment$/i.test(text)) return { kind: "payment", description: "QR payment" };
  return { kind: "payment", description: words(text) };
}

export interface GoTymeStatement { entries: ImportEntry[]; period: { from: string; to: string }; account: string; balances: StatementBalance[] }

/**
 * Reads a GoTyme Bank "Statement of Account" PDF. Each amount is a credit, a debit or the running
 * balance by which header it is right-aligned under. Every row must move the running balance by its
 * own amount, starting at the opening balance and ending at the closing one, and the rows must add up
 * to the summary's totals, so a misread layout fails instead of importing wrong numbers.
 */
export function parseGoTymeStatement(pages: PdfPage[]): GoTymeStatement {
  const all = pages.flat();
  if (!all.some((i) => /gotyme/i.test(i.text))) throw new ImportError("This does not look like a GoTyme Bank statement.");
  const first = pages[0] ?? [];
  const periodText = valueOf(first, /^period:?$/i);
  const range = periodText && /^(\d{1,2} [A-Za-z]{3} \d{4})\s*[-–]\s*(\d{1,2} [A-Za-z]{3} \d{4})$/.exec(periodText);
  if (!range) throw new ImportError("The statement period could not be read.");
  const period = { from: day(range[1]), to: day(range[2]) };
  if (period.from > period.to) throw new ImportError("The statement period could not be read.");

  const number = valueOf(first, /^account number:?$/i)?.replace(/\s+/g, "");
  if (!number || !/^\d{6,20}$/.test(number)) throw new ImportError("The account number could not be read.");
  const numberLabel = labelled(first, /^account number:?$/i)!;
  // The account's type ("Deposit account") is the line just above its number.
  const type = first.filter((i) => Math.abs(i.x - numberLabel.x) < 3 && i.y > numberLabel.y && i.y - numberLabel.y < 15 && /account$/i.test(clean(i.text)))
    .sort((a, b) => a.y - b.y)[0];
  // Only the last four digits are kept, like the statement masks everyone else's.
  const account = `${type ? clean(type.text).toLowerCase() : "account"} ${number.slice(-4)}`;

  const opening = summaryAmount(first, /^opening balance$/i);
  const totalCredit = summaryAmount(first, /^total credits?$/i);
  const totalDebit = summaryAmount(first, /^total debits?$/i);
  const closing = summaryAmount(first, /^closing balance$/i);

  const entries: ImportEntry[] = [];
  const seen = new Map<string, number>();
  let balance = opening, credited = 0, debited = 0;
  for (const page of pages) {
    const columns = columnsOf(page);
    if (!columns) continue;
    // Only dates in the Date column: the footer's "Request Date" is not a row.
    const dates = page.filter((i) => DAY.test(clean(i.text)) && Math.abs(i.x - columns.dateX) < 6 && i.y < columns.headerY - 5).sort((a, b) => b.y - a.y);
    for (const date of dates) {
      const figures = sameLine(page, date.y).filter((i) => AMOUNT.test(clean(i.text)) && i.x >= columns.creditsX - 40);
      const column = (item: PdfItem) => {
        const edges = [columns.creditsRight, columns.debitsRight, columns.balanceRight].map((edge) => Math.abs(right(item) - edge));
        return edges.indexOf(Math.min(...edges));
      };
      const [credit, debit, running] = [0, 1, 2].map((n) => figures.filter((i) => column(i) === n));
      const details = page.filter((i) => Math.abs(i.y - date.y) <= 7 && i.x >= columns.textX - 5 && i.x < columns.creditsX - 40)
        .sort((a, b) => b.y - a.y || a.x - b.x).map((i) => clean(i.text)).filter(Boolean).join(" ");
      if (credit.length !== 1 || debit.length !== 1 || running.length !== 1 || !details) {
        throw new ImportError("A transaction row could not be read. Upload the original PDF from the GoTyme app.");
      }
      const [inCents, outCents, after] = [credit[0], debit[0], running[0]].map((i) => cents(clean(i.text)));
      if ((inCents === 0) === (outCents === 0) || inCents < 0 || outCents < 0) throw new ImportError("A transaction row could not be read. Upload the original PDF from the GoTyme app.");
      balance += inCents - outCents;
      if (balance !== after) throw new ImportError("The running balance does not match the rows, so nothing was imported. Upload the original PDF from the GoTyme app.");
      credited += inCents;
      debited += outCents;

      const occurredOn = day(clean(date.text));
      if (occurredOn < period.from || occurredOn > period.to) throw new ImportError(`The date "${clean(date.text)}" is outside the statement period.`);
      const incoming = inCents > 0, amount = incoming ? inCents : outCents;
      const { kind, description } = describeGoTymeRow(details);
      // No transaction IDs on the statement. The running balance after a row is the account's own,
      // whatever period was requested, so a statement for another range names the row the same way.
      const base = [occurredOn, incoming ? "in" : "out", amount, after, details.toLowerCase().replace(/[^a-z0-9]+/g, "-")].join(":").slice(0, 230);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      entries.push({ provider: "gotyme", accountKey: account, externalId: n > 1 ? `${base}:${n}` : base, occurredOn,
        kind, amount: (incoming ? amount : -amount) / 100, currency: "PHP", description, realizedPnl: null });
    }
  }

  if (credited !== totalCredit || debited !== totalDebit || balance !== closing) {
    throw new ImportError("The rows do not add up to the statement's totals, so nothing was imported. Upload the original PDF from the GoTyme app.");
  }
  // The closing balance is the account's balance on the last day of the period.
  const balances: StatementBalance[] = [{ provider: "gotyme", account, currency: "PHP", amount: closing / 100, asOf: period.to }];
  return { entries: uniqueEntries(entries), period, account, balances };
}
