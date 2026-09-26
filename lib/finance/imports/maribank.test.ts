import { describe, expect, test } from "bun:test";
import { parseMariBankStatement, type PdfItem } from "./maribank";

// Positions follow a real MariBank e-statement: amounts are right-aligned under OUTGOING / INCOMING.
const at = (text: string, x: number, y: number, width = text.length * 5): PdfItem => ({ text, x, y, width });
const money = (text: string, rightEdge: number, y: number) => at(text, rightEdge - text.length * 5, y);
const OUT = 433, IN = 553;

function statement({ outgoing = "250.00", incoming = "1,500.12", rows = defaultRows } = {}) {
  return [[
    at("S/N S01-TEST", 410, 788), at("MARIBANK ACCOUNT: 0000", 40, 708), at("ACCOUNT SUMMARY", 230, 654),
    at("01 DEC 2025 to 31 DEC 2025", 235, 638),
    at("ACCOUNT", 49, 608), at("STARTING BALANCE", 146, 608), at("TOTAL OUTGOING", 265, 608), at("TOTAL INCOMING", 376, 608), at("ENDING BALANCE", 477, 608),
    at("SAVINGS", 49, 567), money("10.00", 225, 567), money(outgoing, 339, 567), money(incoming, 448, 567), money("1,260.12", 553, 567),
    at("TOTAL: 1,260.12", 478, 536),
    at("SAVINGS - TRANSACTION DETAILS", 187, 488),
    at("DATE", 49, 457), at("TRANSACTION", 169, 457), at("OUTGOING", 364, 457), at("(PHP)", 406, 457, 27), at("INCOMING", 485, 457), at("(PHP)", 526, 457, 27),
    ...rows,
    at("SAVINGS - INTEREST & TAX DETAILS*", 179, 207),
    at("DATE", 49, 176), at("PREVIOUS DAY BALANCE", 135, 176), at("GROSS INTEREST", 279, 176), at("WITHHOLDING TAX", 387, 176), at("INTEREST", 507, 176),
    at("01 DEC", 49, 140), money("10.00", 231, 140), money("0.00", 347, 140), money("0.00", 462, 140), money("0.00", 553, 140),
    at("page", 500, 42), at("1", 529, 42), at("of", 539, 42), at("1", 553, 42),
  ]];
}
const defaultRows = [
  at("DEC", 49, 423), at("Interest", 169, 430), at("Net Interest", 169, 416), money("0.12", IN, 423),
  at("05 DEC", 49, 383), at("Acme Studio Ltd", 169, 389), at("Transfer", 169, 376), money("1,500.00", IN, 383),
  at("28 DEC", 49, 342), at("Juan Dela Cruz", 169, 349), at("Transfer", 169, 335), money("250.00", OUT, 342),
];

describe("MariBank statement PDFs", () => {
  test("reads each row's direction from its column and dates it in the statement period", () => {
    const { entries, period, accounts } = parseMariBankStatement(statement());
    expect(period).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(accounts).toEqual(["SAVINGS"]);
    expect(entries.map(({ occurredOn, kind, amount, description, accountKey, currency }) => ({ occurredOn, kind, amount, description, accountKey, currency }))).toEqual([
      { occurredOn: "2025-12-31", kind: "interest", amount: 0.12, description: "MariBank net interest", accountKey: "savings", currency: "PHP" },
      { occurredOn: "2025-12-05", kind: "payment", amount: 1500, description: "Received from Acme Studio Ltd", accountKey: "savings", currency: "PHP" },
      { occurredOn: "2025-12-28", kind: "payment", amount: -250, description: "Sent to Juan Dela Cruz", accountKey: "savings", currency: "PHP" },
    ]);
  });

  test("the same statement downloaded twice produces the same IDs; identical rows stay distinct", () => {
    const ids = (pages: PdfItem[][]) => parseMariBankStatement(pages).entries.map((e) => e.externalId);
    expect(ids(statement())).toEqual(ids(statement()));
    const twice = [...defaultRows, at("28 DEC", 49, 302), at("Juan Dela Cruz", 169, 308), at("Transfer", 169, 295), money("250.00", OUT, 302)];
    const entries = parseMariBankStatement(statement({ outgoing: "500.00", rows: twice })).entries;
    expect(new Set(entries.map((e) => e.externalId)).size).toBe(4);
  });

  test("refuses rows that do not add up to the account summary", () => {
    expect(() => parseMariBankStatement(statement({ incoming: "1,600.12" }))).toThrow("do not add up");
    const misplaced = defaultRows.map((i) => i.text === "250.00" ? money("250.00", IN, i.y) : i);
    expect(() => parseMariBankStatement(statement({ rows: misplaced }))).toThrow("do not add up");
  });

  test("refuses other documents", () => {
    expect(() => parseMariBankStatement([[at("Some other bank", 40, 700)]])).toThrow("MariBank");
    const noPeriod = statement().map((page) => page.filter((i) => !i.text.includes(" to ")));
    expect(() => parseMariBankStatement(noPeriod)).toThrow("period");
  });
});
