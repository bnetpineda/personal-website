import { describe, expect, test } from "bun:test";
import { paysAccountHolder } from "./ai-review";
import { describeGoTymeRow, parseGoTymeStatement } from "./gotyme";
import type { PdfItem } from "./maribank";

// Positions follow a real GoTyme "Statement of Account": amounts are right-aligned under
// Credits, Debits and Running Balance. Names and numbers here are made up.
const at = (text: string, x: number, y: number, width = text.length * 4): PdfItem => ({ text, x, y, width });
const money = (text: string, rightEdge: number, y: number) => at(text, rightEdge - text.length * 4, y);
const CREDITS = 351, DEBITS = 386, BALANCE = 440;

type Row = [date: string, details: string | string[], credit: string, debit: string, balance: string];
const defaultRows: Row[] = [
  ["03 Feb 2026", "Transfer from Acme Studio Ltd Netbank, Account No. ••••••••1234", "1,500.00", "0.00", "1,600.50"],
  ["05 Feb 2026", ["Transfer to Juan Dela Cruz MariBank Philippines (SeaBank), Account No.", "•••••••5678"], "0.00", "250.00", "1,350.50"],
  ["05 Feb 2026", "Card payment at SPOTIFY P1234, Card •••• 4321", "0.00", "149.00", "1,201.50"],
  ["05 Feb 2026", "Qr Payment", "0.00", "100.00", "1,101.50"],
  ["05 Feb 2026", "Qr Payment", "0.00", "100.00", "1,001.50"],
  ["28 Feb 2026", "Interest earned", "1.25", "0.00", "1,002.75"],
];

function rowItems(rows: Row[], top: number) {
  return rows.flatMap(([date, details, credit, debit, balance], n) => {
    const y = top - n * 16;
    const lines = Array.isArray(details) ? details.map((text, i) => at(text, 71, y + 4 - i * 8)) : [at(details, 71, y)];
    return [at(date, 19, y), ...lines, money(credit, CREDITS, y), money(debit, DEBITS, y), money(balance, BALANCE, y)];
  });
}
const header = (y: number) => [at("Date", 19, y), at("Details", 71, y), at("Credits", 330, y, 21), at("Debits", 368, y, 18), at("Running", 417, y + 3, 23), at("Balance", 418, y - 4, 22)];

function statement({ rows = defaultRows, totalCredit = "1,501.25", totalDebit = "599.00", closing = "1,002.75", split = 4 } = {}) {
  return [[
    at("JUANA SANTOS", 15, 485), at("Deposit account", 15, 445), at("Account Number:", 15, 436, 65), at("011200001111", 82, 436),
    at("Period:", 15, 426, 25), at("01 Feb 2026 - 28 Feb 2026", 42, 426),
    at("Summary", 274, 472), at("Opening balance", 274, 463, 62), money("PHP 100.50", 437, 463),
    at("Total Credit", 298, 453, 40), money(`PHP ${totalCredit}`, 437, 453), at("Total Debit", 298, 443, 37), money(`PHP ${totalDebit}`, 437, 443),
    at("Closing balance", 274, 433, 58), money(`PHP ${closing}`, 437, 433),
    ...header(394), ...rowItems(rows.slice(0, split), 373),
    at("All figures are in PHP.", 15, 53), at("Request Date:", 15, 24, 36), at("01 Mar 2026", 52, 24), at("Page 1 of 2", 417, 24),
  ], [
    ...header(478), ...rowItems(rows.slice(split), 458),
    at("GoTyme Bank is regulated by the Bangko Sentral ng Pilipinas (BSP).", 230, 78), at("Page 2 of 2", 416, 24),
  ]];
}

describe("GoTyme statement PDFs", () => {
  test("reads each row's direction from its column, across pages", () => {
    const { entries, period, account, balances } = parseGoTymeStatement(statement());
    expect(period).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(account).toBe("deposit account 1111");
    expect(balances).toEqual([{ provider: "gotyme", account: "deposit account 1111", currency: "PHP", amount: 1002.75, asOf: "2026-02-28" }]);
    expect(entries.map(({ occurredOn, kind, amount, description }) => ({ occurredOn, kind, amount, description }))).toEqual([
      { occurredOn: "2026-02-03", kind: "payment", amount: 1500, description: "Received from Acme Studio Ltd Netbank" },
      { occurredOn: "2026-02-05", kind: "payment", amount: -250, description: "Sent to Juan Dela Cruz MariBank Philippines (SeaBank)" },
      { occurredOn: "2026-02-05", kind: "payment", amount: -149, description: "Card payment: SPOTIFY P1234" },
      { occurredOn: "2026-02-05", kind: "payment", amount: -100, description: "QR payment" },
      { occurredOn: "2026-02-05", kind: "payment", amount: -100, description: "QR payment" },
      { occurredOn: "2026-02-28", kind: "interest", amount: 1.25, description: "GoTyme interest earned" },
    ]);
    expect(entries.every((e) => e.provider === "gotyme" && e.currency === "PHP" && e.accountKey === "deposit account 1111")).toBe(true);
  });

  test("two identical rows on one day stay two entries, named by the balance after them", () => {
    const qr = parseGoTymeStatement(statement()).entries.filter((e) => e.description === "QR payment");
    expect(qr).toHaveLength(2);
    expect(new Set(qr.map((e) => e.externalId)).size).toBe(2);
  });

  test("a statement for a longer period names the same rows the same way", () => {
    const month = parseGoTymeStatement(statement()).entries.map((e) => e.externalId);
    const longer = statement();
    longer[0] = longer[0].map((i) => i.text === "01 Feb 2026 - 28 Feb 2026" ? at("01 Jan 2026 - 31 Mar 2026", 42, 426) : i);
    expect(parseGoTymeStatement(longer).entries.map((e) => e.externalId)).toEqual(month);
  });

  test("refuses rows that don't add up instead of importing wrong numbers", () => {
    expect(() => parseGoTymeStatement(statement({ totalDebit: "600.00" }))).toThrow(/do not add up/);
    const misread = defaultRows.map((r, n): Row => n === 2 ? [r[0], r[1], r[2], "194.00", r[4]] : r);
    expect(() => parseGoTymeStatement(statement({ rows: misread }))).toThrow(/running balance/);
    const unplaced = defaultRows.map((r, n): Row => n === 0 ? [r[0], r[1], "1,500.00", "1,500.00", r[4]] : r);
    expect(() => parseGoTymeStatement(statement({ rows: unplaced }))).toThrow(/could not be read/);
  });

  test("a quiet period still gives its closing balance", () => {
    const quiet = parseGoTymeStatement(statement({ rows: [], totalCredit: "0.00", totalDebit: "0.00", closing: "100.50" }));
    expect(quiet.entries).toEqual([]);
    expect(quiet.balances[0].amount).toBe(100.5);
  });

  test("refuses other banks' statements and other currencies", () => {
    const [page1, page2] = statement();
    expect(() => parseGoTymeStatement([page1, page2.filter((i) => !/GoTyme/.test(i.text))])).toThrow(/GoTyme/);
    expect(() => parseGoTymeStatement([page1.map((i) => i.text === "PHP 100.50" ? { ...i, text: "USD 100.50" } : i), page2])).toThrow(/peso/);
  });
});

describe("GoTyme row wording", () => {
  test.each([
    ["Transfer to Ana Reyes G-Xchange, Inc (GCash), Mobile No. 0••••••1234", "payment", "Sent to Ana Reyes G-Xchange, Inc (GCash)"],
    ["Transfer from S. B. Services DCPay Philippines, Inc (Coins PH), Account No. ••••6009", "payment", "Received from S. B. Services DCPay Philippines, Inc (Coins PH)"],
    ["Outbound interbank transfer", "payment", "Outbound interbank transfer"],
    ["Refund for card payment", "payment", "Refund for card payment"],
    ["Withholding tax", "tax", "Withholding tax"],
    ["Interest", "interest", "GoTyme interest"],
  ])("%s", (details, kind, description) => {
    expect(describeGoTymeRow(details)).toEqual({ kind: kind as never, description });
  });
});

describe("account holder in a shortened name", () => {
  const holder = "Juana Maria Santos";
  test.each([
    ["Received from J. M. SANTOS MariBank Philippines (SeaBank)", true],
    ["Received from J. M. R. Santos Netbank", true],
    ["Sent to Juana Maria Santos G-Xchange, Inc (GCash)", true],
    ["Received from J. SANTOS Netbank", false],
    ["Received from A. J. M. SANTOS Netbank", false],
    ["Received from M. J. SANTOS Netbank", false],
    ["Received from J. M. SANTOSA Netbank", false],
  ])("%s", (description, own) => {
    expect(paysAccountHolder(description, holder)).toBe(own);
  });
});
