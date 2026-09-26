import type { StatementBalance } from "../statement-balances";
import { ImportError, uniqueEntries, type EntryKind, type ImportEntry } from "./types";

/** One positioned run of text from a PDF page. `y` grows upwards, as in PDF coordinates. */
export interface PdfItem { text: string; x: number; y: number; width: number }
export type PdfPage = PdfItem[];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const AMOUNT = /^-?\d{1,3}(?:,\d{3})*\.\d{2}$/;
const cents = (text: string) => Math.round(Number(text.replaceAll(",", "")) * 100);
const iso = (year: number, month: number, day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const right = (item: PdfItem) => item.x + item.width;

function statementDate(text: string): string {
  const [day, month, year] = text.trim().toUpperCase().split(/\s+/);
  const m = MONTHS.indexOf(month);
  if (m < 0 || !/^\d{1,2}$/.test(day) || !/^\d{4}$/.test(year)) throw new ImportError("The statement period could not be read.");
  return iso(Number(year), m, Number(day));
}

/** "20 FEB" or a bare "FEB" (monthly interest) inside the statement period. */
function rowDate(text: string, period: { from: string; to: string }): string {
  const parts = text.trim().toUpperCase().split(/\s+/);
  const month = MONTHS.indexOf(parts.at(-1)!);
  if (month < 0 || parts.length > 2 || (parts.length === 2 && !/^\d{1,2}$/.test(parts[0]))) throw new ImportError(`Unreadable transaction date "${text}".`);
  const years = [...new Set([Number(period.from.slice(0, 4)), Number(period.to.slice(0, 4))])];
  for (const year of years) {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    // Monthly lines carry no day: they are credited at the end of the month, or of the period.
    const date = iso(year, month, parts.length === 2 ? Number(parts[0]) : last);
    const clamped = parts.length === 1 && date > period.to ? period.to : date;
    if (clamped >= period.from && clamped <= period.to) return clamped;
  }
  throw new ImportError(`The date "${text}" is outside the statement period.`);
}

/** Items on the same visual line as `y`, left to right. */
const sameLine = (page: PdfPage, y: number, tolerance = 3) => page.filter((i) => Math.abs(i.y - y) <= tolerance).sort((a, b) => a.x - b.x);

interface Totals { outgoing: number; incoming: number; ending?: number }

/** ACCOUNT SUMMARY rows: account name, starting balance, total outgoing, total incoming, ending balance. */
function summaryTotals(page: PdfPage): Map<string, Totals> {
  const header = page.find((i) => i.text.trim().toUpperCase() === "TOTAL OUTGOING");
  if (!header) throw new ImportError("Upload a MariBank statement PDF: its account summary is missing.");
  const totals = new Map<string, Totals>();
  for (const label of page.filter((i) => i.y < header.y - 12 && i.x < header.x - 60 && /^[A-Z][A-Z &-]+$/.test(i.text.trim()))) {
    const amounts = sameLine(page, label.y).filter((i) => AMOUNT.test(i.text.trim()));
    if (amounts.length === 4) totals.set(label.text.trim(), { outgoing: cents(amounts[1].text), incoming: cents(amounts[2].text), ending: cents(amounts[3].text) });
  }
  if (!totals.size) throw new ImportError("The account summary could not be read.");
  return totals;
}

interface Columns { dateX: number; textX: number; outgoingX: number; outgoingRight: number; incomingRight: number; headerY: number }

function columnsAt(page: PdfPage, outgoing: PdfItem): Columns | null {
  const line = sameLine(page, outgoing.y);
  const incoming = line.find((i) => i.text.trim().toUpperCase() === "INCOMING");
  const date = line.find((i) => i.text.trim().toUpperCase() === "DATE");
  const text = line.find((i) => i.text.trim().toUpperCase() === "TRANSACTION");
  if (!incoming || !date || !text) return null;
  // "(PHP)" sits beside each header on a line of its own; amounts are right-aligned under it.
  const edge = (from: number, to: number) => Math.max(...page.filter((i) => Math.abs(i.y - outgoing.y) <= 12 && i.x >= from && i.x < to).map(right));
  if (!line.some((i) => i.text.includes("(PHP)")) && !page.some((i) => Math.abs(i.y - outgoing.y) <= 12 && i.text.includes("(PHP)"))) {
    throw new ImportError("Only peso (PHP) MariBank statements are supported.");
  }
  return { dateX: date.x, textX: text.x, outgoingX: outgoing.x, outgoingRight: edge(outgoing.x, incoming.x), incomingRight: edge(incoming.x, Infinity), headerY: outgoing.y };
}

/**
 * A statement row is a name ("Shopee", "ATM Cash Withdrawal", "Card Fee") over a channel
 * ("Payment", "Cash Withdrawal", "ATM Withdrawal"). Words it the way the row reads to a person.
 * "Transfer" is only the channel, not a verdict: those rows say who paid whom, so money from
 * someone else is not presumed to be the account holder's own.
 */
export function describeRow(name: string, detail: string, incoming: boolean): { kind: EntryKind; description: string } {
  const channel = detail.trim();
  const words = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 200);
  if (/interest/i.test(`${name} ${channel}`)) return { kind: "interest", description: words(`MariBank ${(channel || name).toLowerCase()}`) };
  if (/\bfee\b/i.test(name)) return { kind: "fee", description: words(channel ? `${channel} fee` : name) };
  if (/^cash withdrawal$/i.test(channel)) return { kind: "payment", description: "ATM cash withdrawal" };
  if (/^(?:reward|cashback)$/i.test(channel)) return { kind: "payment", description: words(name) };
  if (!channel || /^transfer$/i.test(channel)) return { kind: "payment", description: words(`${incoming ? "Received from" : "Sent to"} ${name}`) };
  return { kind: "payment", description: words(`${channel}: ${name}`) };
}

export interface MariBankStatement { entries: ImportEntry[]; period: { from: string; to: string }; accounts: string[]; balances: StatementBalance[] }

/**
 * Reads the "<ACCOUNT> - TRANSACTION DETAILS" tables of a MariBank e-statement. Each amount is
 * placed in Outgoing or Incoming by which header it sits under, and the rows must add up to the
 * account summary's totals, so a misread layout fails instead of importing wrong numbers.
 */
export function parseMariBankStatement(pages: PdfPage[]): MariBankStatement {
  const all = pages.flat();
  if (!all.some((i) => /MARIBANK/i.test(i.text))) throw new ImportError("This does not look like a MariBank statement.");
  const periodText = all.map((i) => i.text).find((t) => /^\d{1,2} [A-Z]{3} \d{4} to \d{1,2} [A-Z]{3} \d{4}$/i.test(t.trim()));
  if (!periodText) throw new ImportError("The statement period could not be read.");
  const [fromText, toText] = periodText.split(/ to /i);
  const period = { from: statementDate(fromText), to: statementDate(toText) };
  const totals = summaryTotals(pages[0]);

  const entries: ImportEntry[] = [];
  const read = new Map<string, Totals>();
  const seen = new Map<string, number>();
  let account: string | null = null;
  let columns: Columns | null = null;
  for (const page of pages) {
    for (const item of [...page].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const text = item.text.trim();
      const heading = /^(.+?) - (.+ DETAILS)\*?$/i.exec(text);
      if (heading) {
        account = /^TRANSACTION DETAILS$/i.test(heading[2]) ? heading[1].trim().toUpperCase() : null;
        columns = null;
        continue;
      }
      if (!account) continue;
      if (text.toUpperCase() === "OUTGOING") { columns = columnsAt(page, item) ?? columns; continue; }
      if (!columns || item.y >= columns.headerY - 5 || !AMOUNT.test(text) || item.x < columns.outgoingX - 60) continue;

      const incoming = Math.abs(right(item) - columns.incomingRight) < Math.abs(right(item) - columns.outgoingRight);
      const dateText = page.filter((i) => Math.abs(i.y - item.y) <= 4 && i.x < columns!.textX - 5).map((i) => i.text.trim()).join(" ");
      const lines = page.filter((i) => Math.abs(i.y - item.y) <= 10 && i.x >= columns!.textX - 5 && i.x < columns!.outgoingX - 20)
        .sort((a, b) => b.y - a.y).map((i) => i.text.trim()).filter(Boolean);
      if (!dateText || !lines.length) throw new ImportError("A transaction row could not be read. Upload the original PDF from the MariBank app.");
      const [name, ...rest] = lines;
      const detail = rest.join(" ");
      const amount = cents(text);
      const tally = read.get(account) ?? { outgoing: 0, incoming: 0 };
      if (incoming) tally.incoming += amount; else tally.outgoing += amount;
      read.set(account, tally);

      const occurredOn = rowDate(dateText, period);
      const { kind, description } = describeRow(name, detail, incoming);
      // No transaction IDs on the statement: identify a row by what it is, so a re-downloaded statement matches.
      const base = [occurredOn, incoming ? "in" : "out", amount, `${name} ${detail}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")].join(":").slice(0, 230);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      entries.push({ provider: "maribank", accountKey: account.toLowerCase(), externalId: n > 1 ? `${base}:${n}` : base, occurredOn,
        kind, amount: (incoming ? amount : -amount) / 100, currency: "PHP",
        description, realizedPnl: null });
    }
  }

  const unknown = [...read.keys()].find((name) => !totals.has(name));
  if (unknown) throw new ImportError(`The ${unknown.toLowerCase()} account is missing from the statement summary, so nothing was imported.`);
  for (const [name, expected] of totals) {
    const got = read.get(name) ?? { outgoing: 0, incoming: 0 };
    if (got.outgoing !== expected.outgoing || got.incoming !== expected.incoming) {
      throw new ImportError(`The ${name.toLowerCase()} rows do not add up to the statement's totals, so nothing was imported. Upload the original PDF from the MariBank app.`);
    }
  }
  // The summary's ending balance is the account's balance on the last day of the period.
  const balances = [...totals].map(([name, t]): StatementBalance => ({ provider: "maribank", account: name.toLowerCase(), currency: "PHP", amount: t.ending! / 100, asOf: period.to }));
  return { entries: uniqueEntries(entries), period, accounts: [...totals.keys()], balances };
}
