import { describe, expect, test } from "bun:test";
import type { CategoryRule, ImportedEntry } from "@/lib/db/schema";
import { parseIbkrHistory, parseRewardsPage, parseCapitalPage } from "./provider-parsers";
import { canPost, earningsByCurrency, matchingRule, transferEligible, transferSuggestions } from "./review";
import { parseCsv, parseWiseCsv } from "./wise-csv";
import { uniqueEntries, type ImportEntry } from "./types";

const header = '"TransferWise ID",Date,Amount,Currency,Description,Total fees';
const imported = (overrides: Partial<ImportedEntry> = {}): ImportedEntry => ({ id: crypto.randomUUID(), provider: "wise", accountKey: "personal", externalId: "CARD-1:USD:out",
  occurredOn: "2026-09-20", amount: -15, currency: "USD", kind: "payment", description: "Spotify premium", realizedPnl: null,
  status: "pending", categoryId: null, transferId: null, trade: null, categorizedBy: null, aiReason: null, aiAttemptedAt: null, createdAt: new Date(), updatedAt: new Date(), ...overrides });
const rule = (overrides: Partial<CategoryRule> = {}): CategoryRule => ({ id: crypto.randomUUID(), provider: null, contains: "Spotify", categoryId: 1,
  kind: "expense", enabled: true, autoPost: true, createdAt: new Date(), updatedAt: new Date(), ...overrides });

describe("Wise statement parsing", () => {
  test("handles BOM, quoted commas, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('\uFEFFID,Description\r\n1,"Coffee, \"\"best\"\"\r\nshop"\r\n');
    expect(rows).toEqual([["ID", "Description"], ["1", 'Coffee, "best"\r\nshop']]);
    expect(parseCsv('ID;Description\n1;"Shop"')).toHaveLength(2);
  });
  test("splits included fees while preserving the signed total and transaction identity", () => {
    const csv = `${header}\nCARD-1,20-09-2026,-16,USD,Spotify premium,1\nPAY-2,21/09/2026,99,USD,Incoming payment,1`;
    const entries = parseWiseCsv(csv, "included");
    expect(entries.map((e) => e.amount)).toEqual([-15, -1, 100, -1]);
    expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(83);
    expect(entries[0].occurredOn).toBe("2026-09-20");
    expect(entries[1].kind).toBe("fee");
    expect(parseWiseCsv(csv, "separate").map((e) => e.amount)).toEqual([-16, 99]);
  });
  test("repeated rows deduplicate but conflicting same-ID rows fail", () => {
    const line = "CARD-1,2026-09-20,-15,USD,Spotify premium,0";
    expect(parseWiseCsv(`${header}\n${line}\n${line}`, "included")).toHaveLength(1);
    expect(() => parseWiseCsv(`${header}\n${line}\n${line.replace(",-15,", ",-16,")}`, "included")).toThrow("Conflicting");
  });
  test("keeps both currency legs and same-currency reversals", () => {
    const entries = parseWiseCsv(`${header}\nTRANSFER-1,2026-09-20,-100,USD,Conversion,0\nTRANSFER-1,2026-09-20,90,EUR,Conversion,0\nTRANSFER-1,2026-09-20,100,USD,Reversal,0`, "separate");
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((r) => r.externalId)).size).toBe(3);
  });
  test("rejects bad dates, numbers, headers, row widths and unfinished quotes", () => {
    for (const csv of [
      `${header}\nCARD-1,30-02-2026,-15,USD,Shop,0`, `${header}\nCARD-1,2026-09-20,,USD,Shop,0`,
      `${header}\nCARD-1,2026-09-20,NaN,USD,Shop,0`, `${header}\nCARD-1,2026-09-20,-15,USD,Shop`,
      `Date,Amount,Currency,Description\n2026-09-20,12,USD,Shop`, `${header}\nCARD-1,2026-09-20,-15,USD,"Shop,0`,
    ]) expect(() => parseWiseCsv(csv, "included")).toThrow();
  });
});

describe("provider history", () => {
  test("Earn uses rewards rather than principal and keeps native token precision", () => {
    const page = parseRewardsPage({ total: 1, rows: [{ productId: "BTC001", asset: "BTC", type: "REALTIME", time: Date.parse("2026-09-20T20:00:00Z"), rewards: "0.00000001" }] }, "flexible", "uid:1");
    expect(parseRewardsPage({ total: 1, rows: [{ projectId: "BTC001", asset: "BTC", type: "REALTIME", time: Date.parse("2026-09-20T20:00:00Z"), rewards: "0.00000001" }] }, "flexible", "uid:1").entries[0].externalId)
      .toBe(page.entries[0].externalId);
    expect(page.entries[0].amount).toBe(1e-8);
    expect(page.entries[0].occurredOn).toBe("2026-09-21");
    expect(canPost(page.entries[0])).toBe(false);
    expect(parseRewardsPage({ total: 1, rows: [{ positionId: 1, asset: "BNB", type: "Locked Rewards", time: Date.now(), amount: "2" }] }, "locked", "uid:1").entries[0].amount).toBe(2);
  });
  test("ignores incomplete transfers and retains separate withdrawal fees", () => {
    expect(parseCapitalPage([{ id: "1", status: 0 }], "deposit", "uid:1")).toEqual([]);
    const entries = parseCapitalPage([{ id: "1", status: 6, amount: "12", coin: "USDT", transactionFee: "0.1", applyTime: "2026-09-20 12:00:00" }], "withdraw", "uid:1");
    expect(entries.map((e) => e.amount)).toEqual([-12, -0.1]);
    expect(entries[1].kind).toBe("fee");
  });
  test("same reward identity with changed amounts fails closed", () => {
    const e: ImportEntry = imported({ provider: "binance", kind: "reward" });
    expect(() => uniqueEntries([e, { ...e, amount: 3 }])).toThrow();
    expect(uniqueEntries([e, { ...e, accountKey: "another-account" }])).toHaveLength(2);
  });
  const history = (cash: string, trades = "") => `<FlexQueryResponse><FlexStatements><FlexStatement accountId="TEST" fromDate="20260901" toDate="20260923"><CashTransactions>${cash}</CashTransactions><Trades>${trades}</Trades></FlexStatement></FlexStatements></FlexQueryResponse>`;
  test("IBKR classifies cash activity and keeps reported trade P/L with separate commissions", () => {
    const result = parseIbkrHistory(history('<CashTransaction transactionID="1" reportDate="20260920" currency="USD" amount="12" type="Dividends" description="TEST dividend" /><CashTransaction transactionID="2" reportDate="20260920" currency="USD" amount="-2" type="Withholding Tax" />',
      '<Trade tradeID="3" tradeDate="20260921" currency="USD" symbol="TEST" buySell="SELL" proceeds="110" fifoPnlRealized="9" ibCommission="-1" ibCommissionCurrency="USD" levelOfDetail="EXECUTION" />'));
    expect(result.entries.map((e) => e.kind)).toEqual(["dividend", "tax", "trade", "fee"]);
    expect(result.entries[2].realizedPnl).toBe(9);
    expect(result.coverage.from).toBe("2026-09-01");
    expect(() => parseIbkrHistory(history('', '<Trade levelOfDetail="SUMMARY" />'))).toThrow("Executions");
    expect(() => parseIbkrHistory(history('').replace('<Trades></Trades>', ''))).toThrow("Cash Transactions and Trades");
  });
});

describe("review and accounting", () => {
  test("most specific rule wins; conflicting rules, transfers and crypto never auto-post", () => {
    const specific = rule({ contains: "Spotify premium", categoryId: 2 });
    expect(matchingRule(imported(), [rule(), specific])?.categoryId).toBe(2);
    expect(matchingRule(imported(), [rule(), rule({ categoryId: 2 })])).toBeNull();
    expect(matchingRule(imported({ kind: "transfer" }), [rule()])).toBeNull();
    expect(matchingRule(imported({ provider: "binance", currency: "USD" }), [rule()])).toBeNull();
    expect(matchingRule(imported({ amount: 15 }), [rule()])).toBeNull();
  });
  test("suggests only unambiguous equal transfers and never same-account purchases", () => {
    const a = imported(), b = imported({ provider: "ibkr", accountKey: "TEST", amount: 15 });
    expect(transferSuggestions([a, b])).toHaveLength(1);
    expect(transferSuggestions([a, b, imported({ ...b, id: crypto.randomUUID() })])).toHaveLength(0);
    expect(transferSuggestions([a, imported({ amount: 15 })])).toHaveLength(0);
    expect(transferSuggestions([a, { ...b, occurredOn: "2026-09-28" }])).toHaveLength(0);
    expect(transferSuggestions([a, { ...b, kind: "dividend" }])).toHaveLength(0);
    expect(transferEligible(a, { ...b, currency: "EUR", amount: 14 })).toBe(true);
  });
  test("earnings separate contributions, dividends, fees and realized P/L without subtracting fees twice", () => {
    const row = (v: Partial<ImportedEntry>) => imported({ provider: "ibkr", ...v });
    const totals = earningsByCurrency([row({ kind: "transfer", status: "transfer", amount: 100 }), row({ kind: "transfer", amount: 50 }),
      row({ kind: "dividend", amount: 12 }), row({ kind: "fee", amount: -1 }), row({ kind: "trade", amount: 110, realizedPnl: 9 }),
      row({ kind: "dividend", status: "ignored", amount: 500 }), row({ kind: "dividend", status: "posted", amount: 40 })]);
    expect(totals.postedCash).toBe(1);
    expect(totals.rows[0]).toMatchObject({ contributions: 100, dividends: 12, fees: 1, realized: 9 });
    expect(earningsByCurrency([row({ provider: "binance", currency: "BTC", kind: "reward", amount: 0.001 })]).rows[0].realized).toBeNull();
  });
});
