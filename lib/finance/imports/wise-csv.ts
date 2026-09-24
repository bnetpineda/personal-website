import { z } from "zod";
import { ImportError, uniqueEntries, type ImportEntry } from "./types";
import { wiseKind, wiseRows } from "./wise-activity";

/** RFC 4180, including escaped quotes, CRLF and embedded newlines. No spreadsheet evaluation. */
export function parseCsv(text: string): string[][] {
  if (text.length > 750_000 || text.includes("\0")) throw new ImportError("Use a UTF-8 CSV file smaller than 750 KB.");
  const input = text.replace(/^\uFEFF/, "");
  const delimiter = input.slice(0, input.indexOf("\n") + 1).includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const pushCell = () => { row.push(cell.trim()); cell = ""; closed = false; };
  const pushRow = () => { pushCell(); if (row.some(Boolean)) rows.push(row); row = []; };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === delimiter) pushCell();
    else if (c === "\n" || c === "\r") { if (c === "\r" && input[i + 1] === "\n") i++; pushRow(); }
    else if (c === '"' && cell === "" && !closed) quoted = true;
    else if (closed || c === '"') throw new ImportError("Malformed CSV quoting. Export the statement again.");
    else cell += c;
    if (rows.length > 2001 || cell.length > 10000) throw new ImportError("Import at most 2,000 statement rows at a time.");
  }
  if (quoted) throw new ImportError("The CSV ends inside a quoted field.");
  if (cell || row.length) pushRow();
  return rows;
}

export function statementDecimal(value: string): number {
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) throw new ImportError("Use an English statement with decimal points in amounts.");
  const amount = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(amount)) throw new ImportError("Invalid statement amount.");
  return amount;
}
function date(value: string): string {
  // Wise English statements use day/month/year; ISO is unambiguous too.
  const normalized = value.replace(/^(\d{2})[/-](\d{2})[/-](\d{4})$/, "$3-$2-$1");
  if (!z.iso.date().safeParse(normalized).success) throw new ImportError("Use dates formatted DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD.");
  return normalized;
}

export type FeeMode = "included" | "separate";
export function parseWiseCsv(text: string, feeMode: FeeMode): ImportEntry[] {
  return parseWiseStatement(text, feeMode).entries;
}

export interface WiseClosingBalance { currency: string; amount: number; asOf: string }
export function parseWiseStatement(text: string, feeMode: FeeMode): { entries: ImportEntry[]; balances: WiseClosingBalance[]; balanceWarning?: string } {
  const [header, ...rows] = parseCsv(text);
  if (!header || !rows.length) throw new ImportError("The statement has no transactions.");
  const names = header.map((h) => h.toLowerCase().trim());
  if (new Set(names).size !== names.length) throw new ImportError("The CSV has duplicate column headings.");
  const column = (name: string) => names.indexOf(name);
  const idCol = ["transferwise id", "wise id", "transaction id", "id"].map(column).find((i) => i >= 0) ?? -1;
  if (idCol < 0 || ["date", "amount", "currency", "description"].some((n) => column(n) < 0)) {
    throw new ImportError("Upload a Wise balance statement with ID, Date, Amount, Currency and Description columns, not a transfer-list export.");
  }
  const entries: ImportEntry[] = [];
  const balanceRows = new Map<string, { amount: number; balance: number; date: string; id: string }[]>();
  const balanceColumn = ["running balance", "runningbalance", "balance"].map(column).find((i) => i >= 0);
  for (const [index, row] of rows.entries()) {
    if (row.length !== header.length || !row[idCol]) throw new ImportError(`Statement row ${index + 2} is incomplete.`);
    const get = (name: string) => row[column(name)] ?? "";
    const amount = statementDecimal(get("amount"));
    const currency = get("currency").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ImportError(`Statement row ${index + 2} has an invalid currency.`);
    const occurredOn = date(get("date"));
    if (balanceColumn != null) {
      const rows = balanceRows.get(currency) ?? [];
      rows.push({ amount, balance: statementDecimal(row[balanceColumn]), date: occurredOn, id: row[idCol] });
      balanceRows.set(currency, rows);
    }
    if (amount === 0) continue;
    const rawFee = get("total fees");
    const fee = feeMode === "included" && rawFee ? Math.abs(statementDecimal(rawFee)) : 0;
    const description = get("description");
    // Newer exports name the activity type. Older ones fall back to the ID prefix and description.
    const kind = wiseKind(row[idCol], amount, get("transaction details type"), description);
    // User chooses the export's fee convention. Separate accounting rows must not be added twice.
    entries.push(...wiseRows({ id: row[idCol], currency, occurredOn, amount, fee, kind, description }));
  }
  const balances: WiseClosingBalance[] = [];
  let balanceWarning: string | undefined;
  for (const [currency, raw] of balanceRows) {
    // Repeated identical export rows must not break the running-balance chain.
    const rows = [...new Map(raw.map((r) => [JSON.stringify(r), r])).values()];
    const valid = (items: typeof rows) => items.every((r, i) => i === 0 ||
      (r.date >= items[i - 1].date && Math.abs(items[i - 1].balance + r.amount - r.balance) < 0.000001));
    const ascending = valid(rows), descending = valid([...rows].reverse());
    const last = ascending ? rows.at(-1)! : descending ? rows[0] : null;
    if (!last || (ascending && descending && rows[0].balance !== rows.at(-1)!.balance)) {
      balanceWarning = "Running balances do not establish an unambiguous order. Transactions can be imported, but no closing balances will be applied.";
      break;
    }
    if (last.balance < 0 || last.balance >= 1e12) {
      balanceWarning = "This closing balance cannot be represented as a cash holding. Import transactions and review the balance separately.";
      break;
    }
    balances.push({ currency, amount: last.balance, asOf: last.date });
  }
  return { entries: uniqueEntries(entries), balances: balanceWarning ? [] : balances,
    balanceWarning: balanceWarning ?? (balanceColumn == null ? "No Running Balance column was found. Only transactions will be imported." : undefined) };
}
