import { createHash } from "node:crypto";
import { z } from "zod";
import { parseFlexXml } from "../connections/parsers";
import { todayManila } from "../dates";
import { ImportError, uniqueEntries, type EntryKind, type HistoryImport, type ImportEntry } from "./types";

export const numeric = z.union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/)])
  .transform(Number).pipe(z.number().finite());
export const identifier = z.union([z.string().min(1), z.number().int().safe()]).transform(String);
const record = z.record(z.string(), z.unknown());
const array = (value: unknown): unknown[] => value == null || value === "" ? [] : Array.isArray(value) ? value : [value];
const asset = z.string().regex(/^[A-Z0-9_]{2,30}$/);
const date = (value: unknown) => z.iso.date().parse(z.string().parse(value).split(";")[0].replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"));

export function parseRewardsPage(body: unknown, kind: "flexible" | "locked", accountKey: string) {
  const page = z.object({ total: numeric.pipe(z.number().int().nonnegative()), rows: z.array(record) }).parse(body);
  const entries = page.rows.map((r): ImportEntry => {
    const time = numeric.pipe(z.number().int().positive()).parse(r.time);
    // Flexible rows carry `productId` today; older API responses used `projectId`.
    const product = identifier.parse(kind === "locked" ? r.positionId : r.productId ?? r.projectId);
    const currency = asset.parse(r.asset);
    const type = z.string().min(1).parse(r.type);
    const amount = numeric.parse(kind === "locked" ? r.amount : r.rewards);
    // The API has no event ID. This tuple identifies a reward in a completed UTC window.
    const key = createHash("sha256").update(JSON.stringify([product, currency, type, time])).digest("hex");
    return { provider: "binance", accountKey, externalId: `earn:${kind}:${key}`, occurredOn: todayManila(new Date(time)),
      kind: "reward", amount, currency, description: `Earn ${kind} · ${type}`.slice(0, 200), realizedPnl: null };
  });
  return { total: page.total, entries };
}

export function parseCapitalPage(body: unknown, kind: "deposit" | "withdraw", accountKey: string): ImportEntry[] {
  const rows = z.array(record).parse(body);
  const entries: ImportEntry[] = [];
  for (const r of rows) {
    // Pending, failed and cancelled events never become contributions.
    const status = numeric.parse(r.status);
    if (status !== (kind === "deposit" ? 1 : 6)) continue;
    const id = identifier.parse(r.id);
    const currency = asset.parse(r.coin);
    const amount = numeric.pipe(z.number().positive()).parse(r.amount);
    const at = kind === "deposit" ? new Date(numeric.parse(r.insertTime)) :
      new Date(z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/).parse(r.completeTime || r.applyTime).replace(" ", "T") + "Z");
    const base = { provider: "binance" as const, accountKey, currency, occurredOn: todayManila(at), realizedPnl: null };
    entries.push({ ...base, externalId: `${kind}:${id}`, kind: "transfer", amount: kind === "deposit" ? amount : -amount,
      description: `Binance ${kind} · ${currency}` });
    if (kind === "withdraw") {
      const fee = numeric.pipe(z.number().nonnegative()).parse(r.transactionFee);
      if (fee) entries.push({ ...base, externalId: `${kind}:${id}:fee`, kind: "fee", amount: -fee, description: `Binance withdrawal fee · ${currency}` });
    }
  }
  return entries;
}

export function parseIbkrHistory(xml: string): HistoryImport {
  const root = record.parse(parseFlexXml(xml).FlexQueryResponse);
  const statements = array(record.parse(root.FlexStatements).FlexStatement).map((s) => record.parse(s));
  if (!statements.length) throw new ImportError("IBKR returned no history statements.");
  const entries: ImportEntry[] = [], from: string[] = [], to: string[] = [], accounts: string[] = [];
  for (const s of statements) {
    const accountKey = identifier.parse(s["@_accountId"]);
    accounts.push(accountKey);
    from.push(date(s["@_fromDate"])); to.push(date(s["@_toDate"]));
    if (s.CashTransactions === undefined || s.Trades === undefined) throw new ImportError("Add Cash Transactions and Trades (Executions) to the history Flex Query.");
    const cash = s.CashTransactions === "" ? {} : record.parse(s.CashTransactions);
    for (const raw of array(cash.CashTransaction)) {
      const r = record.parse(raw);
      const type = z.string().min(1).parse(r["@_type"]);
      const lower = type.toLowerCase();
      const kind: EntryKind = lower.includes("tax") ? "tax" : lower.includes("dividend") || lower.includes("payment in lieu") ? "dividend" :
        lower.includes("interest") ? "interest" : lower.includes("fee") || lower.includes("commission") ? "fee" :
        lower.includes("deposit") || lower.includes("withdraw") ? "transfer" : "other";
      const amount = numeric.parse(r["@_amount"]);
      if (!amount) continue;
      entries.push({ provider: "ibkr", accountKey, externalId: `cash:${identifier.parse(r["@_transactionID"])}`,
        occurredOn: date(r["@_reportDate"]), kind, amount, currency: asset.parse(r["@_currency"]),
        description: String(r["@_description"] || type).slice(0, 200), realizedPnl: null });
    }
    const trades = s.Trades === "" ? {} : record.parse(s.Trades);
    for (const raw of array(trades.Trade)) {
      const r = record.parse(raw);
      if (r["@_levelOfDetail"] !== "EXECUTION") throw new ImportError("Choose only Executions for Trades in the history Flex Query.");
      const externalId = `trade:${identifier.parse(r["@_tradeID"])}`;
      const base = { provider: "ibkr" as const, accountKey, occurredOn: date(r["@_tradeDate"]), currency: asset.parse(r["@_currency"]) };
      entries.push({ ...base, externalId, kind: "trade", amount: numeric.parse(r["@_proceeds"]),
        description: `${String(r["@_buySell"] || "Trade")} ${String(r["@_symbol"] || "")}`.slice(0, 200), realizedPnl: numeric.parse(r["@_fifoPnlRealized"]) });
      const commission = numeric.parse(r["@_ibCommission"]);
      if (commission) entries.push({ ...base, externalId: `${externalId}:commission`, kind: "fee", amount: commission,
        currency: asset.parse(r["@_ibCommissionCurrency"]), description: `Trade commission · ${String(r["@_symbol"] || "")}`.slice(0, 200), realizedPnl: null });
    }
  }
  if (from.some((day, i) => day > to[i])) throw new ImportError("IBKR returned a reversed history date range.");
  if (new Set(from).size !== 1 || new Set(to).size !== 1) throw new ImportError("Use the same history date range for all accounts in the IBKR query.");
  for (const entry of entries) if (entry.occurredOn < from[0] || entry.occurredOn > to[0]) throw new ImportError("An IBKR transaction falls outside its report dates. Check the query date fields.");
  return { entries: uniqueEntries(entries), accounts: [...new Set(accounts)], coverage: { from: from.sort()[0], to: to.sort().at(-1)!, description: "IBKR cash transactions and execution-level trades. Realized P/L includes trade commissions." } };
}
