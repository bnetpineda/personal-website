import { createHash } from "node:crypto";
import { z } from "zod";
import { accountValueHistory, parseFills, parseStakingRewards, spotMarkets } from "../connections/hyperliquid";
import { parseFlexXml } from "../connections/parsers";
import { todayManila } from "../dates";
import type { NavPoint } from "../performance";
import { ImportError, uniqueEntries, type EntryKind, type HistoryImport, type ImportEntry } from "./types";

export const numeric = z.union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/)])
  .transform(Number).pipe(z.number().finite());
export const identifier = z.union([z.string().min(1), z.number().int().safe()]).transform(String);
const record = z.record(z.string(), z.unknown());
const array = (value: unknown): unknown[] => value == null || value === "" ? [] : Array.isArray(value) ? value : [value];
const asset = z.string().regex(/^[A-Z0-9_]{2,30}$/);
/** IBKR dates come as yyyyMMdd (or ISO), sometimes with a ";time" suffix. */
const isoDay = z.string().transform((v) => v.split(";")[0].replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")).pipe(z.iso.date());
const date = (value: unknown) => isoDay.parse(value);

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

/** Keeps amounts that are sums or products stable between imports, so a re-read never looks like a changed record. */
const units = (value: number) => Number(value.toFixed(8));
/** Ledger rows with money moving in or out, or earned. Moves within the account (spot to perps, staking, vaults) are not activity. */
const ledgerSchema = z.object({ time: z.number().int().positive(), hash: z.string().min(1), delta: z.looseObject({ type: z.string().min(1) }) });
const moved = z.object({ user: z.string().optional(), destination: z.string().optional(), token: z.string().optional(), amount: numeric.optional(), usdc: numeric.optional(),
  fee: numeric.optional(), feeToken: z.string().optional() });

function ledgerEntries(body: unknown, address: string, accountKey: string): ImportEntry[] {
  return z.array(ledgerSchema).parse(body).flatMap(({ time, hash, delta }) => {
    const base = { provider: "hyperliquid" as const, accountKey, occurredOn: todayManila(new Date(time)), realizedPnl: null };
    const externalId = `ledger:${time}:${hash}:${delta.type}`;
    const row = moved.parse(delta);
    const amount = row.amount ?? row.usdc ?? 0;
    const token = asset.safeParse(row.token ?? "USDC");
    if (!token.success) return [];
    const currency = token.data;
    const transfer = (signed: number): ImportEntry => ({ ...base, externalId, kind: "transfer", amount: signed, currency, description: `Hyperliquid ${signed > 0 ? "deposit" : "withdrawal"} · ${currency}` });
    const fee = (): ImportEntry[] => row.fee ? [{ ...base, externalId: `${externalId}:fee`, kind: "fee", amount: -row.fee, currency: asset.safeParse(row.feeToken).data ?? currency, description: `Hyperliquid withdrawal fee · ${currency}` }] : [];
    switch (delta.type) {
      case "deposit": return amount ? [transfer(amount)] : [];
      case "withdraw": return amount ? [transfer(-amount), ...fee()] : [];
      case "send": case "spotTransfer": case "internalTransfer": case "subAccountTransfer": {
        const received = row.destination?.toLowerCase() === address, sent = row.user?.toLowerCase() === address;
        if (!amount || received === sent) return [];
        return received ? [transfer(amount)] : [transfer(-amount), ...fee()];
      }
      case "rewardsClaim": return amount ? [{ ...base, externalId, kind: "reward", amount, currency, description: `Hyperliquid rewards · ${currency}` }] : [];
      case "borrowLend": {
        const lend = z.object({ operation: z.string().min(1), interestAmount: numeric }).parse(delta);
        const signed = ["borrow", "repay"].includes(lend.operation) ? -lend.interestAmount : lend.interestAmount;
        return signed ? [{ ...base, externalId, kind: "interest", amount: signed, currency, description: `Hyperliquid lending interest · ${currency}` }] : [];
      }
      default: return [];
    }
  });
}

export function parseHyperliquidHistory(input: { address: string; markets: unknown; fills: unknown; funding: unknown; ledger: unknown; rewards: unknown; portfolio: unknown }, from: number, today: number): HistoryImport {
  const accountKey = `address:${input.address}`;
  const base = { provider: "hyperliquid" as const, accountKey };
  const { pairs } = spotMarkets(input.markets);
  const entries: ImportEntry[] = ledgerEntries(input.ledger, input.address, accountKey);
  for (const r of parseStakingRewards(input.rewards)) {
    if (r.totalAmount) entries.push({ ...base, externalId: `staking:${r.source}:${r.time}`, occurredOn: todayManila(new Date(r.time)), kind: "reward", amount: r.totalAmount, currency: "HYPE", description: "Hyperliquid staking reward · HYPE", realizedPnl: null });
  }
  for (const f of parseFills(input.fills)) {
    const pair = pairs.get(f.coin);
    const externalId = `fill:${f.tid}:${f.side}`;
    const dated = { ...base, occurredOn: todayManila(new Date(f.time)) };
    const label = `${f.dir} ${f.sz} ${pair?.base ?? f.coin} @ ${f.px}`.slice(0, 200);
    // Spot trades swap coins for their quote; a perp's size never changes hands, only what it closes for.
    const amount = pair ? units((f.side === "A" ? 1 : -1) * f.sz * f.px) : f.closedPnl;
    entries.push({ ...dated, externalId, kind: "trade", amount, currency: pair ? asset.safeParse(pair.quote).data ?? "USDC" : "USDC", description: label, realizedPnl: f.closedPnl || null });
    const feeToken = asset.safeParse(f.feeToken);
    if (f.fee && feeToken.success) entries.push({ ...dated, externalId: `${externalId}:fee`, kind: "fee", amount: -f.fee, currency: feeToken.data, description: `Trade fee · ${pair?.base ?? f.coin}`.slice(0, 200), realizedPnl: null });
  }
  // Funding settles hourly, so each coin gets one line per finished UTC day: a day still running would change later.
  const funding = new Map<string, { coin: string; day: string; amount: number }>();
  const fundingRows = z.array(z.object({ time: z.number().int().positive(), delta: z.object({ coin: z.string().min(1), usdc: numeric }) })).parse(input.funding);
  for (const { time, delta } of fundingRows) {
    if (time < from || time >= today) continue;
    const day = new Date(time).toISOString().slice(0, 10), key = `${delta.coin}:${day}`;
    funding.set(key, { coin: delta.coin, day, amount: (funding.get(key)?.amount ?? 0) + delta.usdc });
  }
  for (const [key, { coin, day, amount }] of funding) {
    if (units(amount)) entries.push({ ...base, externalId: `funding:${key}`, occurredOn: day, kind: "interest", amount: units(amount), currency: "USDC", description: `Perp funding · ${coin}`.slice(0, 200), realizedPnl: null });
  }
  // The days before the first deposit say nothing, so the chart starts where the account does.
  const history = accountValueHistory(input.portfolio);
  const first = history.findIndex((h) => h.value !== 0);
  const days = new Map(first < 0 ? [] : history.slice(first).map((h) => [todayManila(new Date(h.time)), h.value]));
  const nav: NavPoint[] = [...days].map(([date, value]) => ({ accountKey, date, value, currency: "USD" }));
  return { entries: uniqueEntries(entries), accounts: [accountKey], nav, coverage: { from: new Date(from).toISOString().slice(0, 10), to: new Date(today).toISOString().slice(0, 10),
    description: "Hyperliquid fills and perp funding for this range, plus every deposit, withdrawal, reward and lending interest record available. Realized P/L is as Hyperliquid reports it, before trade fees. Moves within the account are not listed." } };
}

const navRow = z.object({ "@_reportDate": isoDay, "@_total": numeric, "@_currency": z.string().optional() });
const currencyCode = z.string().regex(/^[A-Z]{3}$/);

/**
 * Net Asset Value (NAV) in Base is optional: IBKR's own value for each day of the report, in the base
 * currency (on each row, else Account Information's). Unreadable rows are skipped; they never fail the import.
 */
function navPoints(s: Record<string, unknown>, accountKey: string, from: string, to: string): NavPoint[] {
  const section = record.safeParse(s.EquitySummaryInBase);
  if (!section.success) return [];
  const info = record.safeParse(s.AccountInformation);
  return array(section.data.EquitySummaryByReportDateInBase).flatMap((raw) => {
    const row = navRow.safeParse(raw);
    if (!row.success) return [];
    const currency = currencyCode.safeParse(row.data["@_currency"] ?? (info.success ? info.data["@_currency"] : undefined));
    const day = row.data["@_reportDate"];
    if (!currency.success || day < from || day > to) return [];
    return [{ accountKey, date: day, value: row.data["@_total"], currency: currency.data }];
  });
}

export function parseIbkrHistory(xml: string): HistoryImport {
  const root = record.parse(parseFlexXml(xml).FlexQueryResponse);
  const statements = array(record.parse(root.FlexStatements).FlexStatement).map((s) => record.parse(s));
  if (!statements.length) throw new ImportError("IBKR returned no history statements.");
  const entries: ImportEntry[] = [], from: string[] = [], to: string[] = [], accounts: string[] = [], nav: NavPoint[] = [];
  for (const s of statements) {
    const accountKey = identifier.parse(s["@_accountId"]);
    accounts.push(accountKey);
    from.push(date(s["@_fromDate"])); to.push(date(s["@_toDate"]));
    nav.push(...navPoints(s, accountKey, from.at(-1)!, to.at(-1)!));
    if (s.CashTransactions === undefined || s.Trades === undefined) throw new ImportError("Add Cash Transactions and Trades (Executions) to the IBKR Flex Query.");
    const cash = s.CashTransactions === "" ? {} : record.parse(s.CashTransactions);
    const cashRows = array(cash.CashTransaction).map((raw) => record.parse(raw));
    // Summary rows repeat the detail rows' totals without a transaction ID, so only Detail rows are read.
    const detailRows = cashRows.filter((r) => r["@_levelOfDetail"] !== "SUMMARY");
    if (cashRows.length && !detailRows.length) throw new ImportError("Tick Detail for Cash Transactions in the IBKR Flex Query.");
    for (const r of detailRows) {
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
      if (r["@_levelOfDetail"] !== "EXECUTION") throw new ImportError("Choose only Executions for Trades in the IBKR Flex Query.");
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
  return { entries: uniqueEntries(entries), accounts: [...new Set(accounts)], nav, coverage: { from: from.sort()[0], to: to.sort().at(-1)!,
    description: `IBKR cash transactions and execution-level trades${nav.length ? ", plus daily NAV" : ""}. Realized P/L includes trade commissions.` } };
}
