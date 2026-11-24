import "server-only";
import { z } from "zod";
import { binanceReader, binanceSnapshot, defaultIO, fetchAccountSnapshot, fetchFlexReport, hyperliquidAccount, hyperliquidPages, hyperliquidReader, type BinanceReader, type HyperliquidShared, type ProviderIO } from "../connections/providers";
import { parseIbkrStatement } from "../connections/parsers";
import type { ConnectionSnapshot, Credentials } from "../connections/types";
import { ImportError, uniqueEntries, type HistoryImport, type ImportEntry } from "./types";
import { identifier, parseCapitalPage, parseHyperliquidHistory, parseIbkrHistory, parseRewardsPage } from "./provider-parsers";

/** Each IBKR sync re-reads this many days of the account's query; entries already imported are skipped. */
const IBKR_HISTORY_DAYS = 30;
/** Fills and funding per sync, whole UTC days so a funding day is never read half finished. Duplicates are skipped. */
const HYPERLIQUID_HISTORY_DAYS = 30;
const PROVIDER_TIMEOUT_MS = 45_000;

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settle = async <T>(run: () => Promise<T> | T): Promise<Settled<T>> => {
  try { return { ok: true, value: await run() }; } catch (error) { return { ok: false, error }; }
};

/**
 * One sync: balances, then recent history, asking each provider once for what both need
 * (IBKR's Flex report; Binance's server time, key check and account; Hyperliquid's markets, rewards,
 * portfolio and fills). A failed snapshot fails the sync; a failed history only reports its error.
 */
export async function fetchAccount(credentials: Credentials, { io = defaultIO, now = new Date(), previous = null }: { io?: ProviderIO; now?: Date; previous?: ConnectionSnapshot | null } = {}): Promise<{ snapshot: ConnectionSnapshot; history: Settled<HistoryImport> }> {
  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  if (credentials.provider === "ibkr") {
    // The 30-day report carries the same closing positions and cash as the query's own period, plus the activity.
    const xml = await fetchFlexReport(credentials, signal, io, IBKR_HISTORY_DAYS);
    let snapshot: ConnectionSnapshot;
    try {
      snapshot = parseIbkrStatement(xml);
    } catch {
      // A query broken out per day (several statements per account) only reads as balances over its saved period.
      snapshot = await fetchAccountSnapshot(credentials, io, previous);
    }
    return { snapshot, history: await settle(() => parseIbkrHistory(xml)) };
  }
  if (credentials.provider === "hyperliquid") {
    const { snapshot, shared } = await hyperliquidAccount(credentials, signal, io);
    return { snapshot, history: await settle(() => hyperliquidHistory(credentials.address, io, now, shared)) };
  }
  const signed = await binanceReader(credentials, signal, io);
  const snapshot = await binanceSnapshot(signed, signal, io, previous);
  const historySignal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  return { snapshot, history: await settle(() => {
    if (!snapshot.accountKey) throw new ImportError("Binance did not identify the account. Retry the sync.");
    return binanceHistory((path, params) => signed(path, params, historySignal), snapshot.accountKey, now);
  }) };
}

async function hyperliquidHistory(user: string, io: ProviderIO, now: Date, shared?: HyperliquidShared): Promise<HistoryImport> {
  const info = hyperliquidReader(AbortSignal.timeout(PROVIDER_TIMEOUT_MS), io);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const from = today - HYPERLIQUID_HISTORY_DAYS * 86_400_000;
  const [markets, fills, funding, ledger, rewards, portfolio] = await Promise.all([
    shared?.markets ?? info({ type: "spotMetaAndAssetCtxs" }),
    // The snapshot already read every fill; history keeps the window it would have asked for.
    shared ? shared.fills.filter((row) => (row as { time: number }).time >= from) : hyperliquidPages(info, { type: "userFillsByTime", user }, from),
    hyperliquidPages(info, { type: "userFunding", user }, from),
    hyperliquidPages(info, { type: "userNonFundingLedgerUpdates", user }, 0),
    shared?.rewards ?? info({ type: "delegatorRewards", user }),
    shared?.portfolio ?? info({ type: "portfolio", user }),
  ]);
  return parseHyperliquidHistory({ address: user, markets, fills, funding, ledger, rewards, portfolio }, from, today);
}

/** Rolling overlap repairs missed days and deduplicates by provider identity, not import time. */
export async function fetchHistory(credentials: Credentials, io: ProviderIO = defaultIO, now = new Date(), range?: { from: string; to: string }, expectedAccount?: string): Promise<HistoryImport> {
  if (credentials.provider === "ibkr") {
    // The balance query also carries Cash Transactions and Trades; history asks it for the last 30 days.
    return parseIbkrHistory(await fetchFlexReport(credentials, AbortSignal.timeout(PROVIDER_TIMEOUT_MS), io, IBKR_HISTORY_DAYS));
  }
  if (credentials.provider === "hyperliquid") return hyperliquidHistory(credentials.address, io, now);
  const signed = await binanceReader(credentials, AbortSignal.timeout(PROVIDER_TIMEOUT_MS), io);
  const { uid } = z.object({ uid: identifier }).parse(await signed("/api/v3/account", { omitZeroBalances: "true" }));
  const accountKey = `uid:${uid}`;
  if (expectedAccount && accountKey !== expectedAccount) throw new ImportError("The connected Binance account changed. Start history for the new account.");
  return binanceHistory(signed, accountKey, now, range);
}

/** Earn rewards and completed deposits/withdrawals for up to 30 completed UTC days (the last 30 by default). */
async function binanceHistory(signed: (path: string, params?: Record<string, string>) => ReturnType<BinanceReader>, accountKey: string, now: Date, range?: { from: string; to: string }): Promise<HistoryImport> {
  if (range && (!z.iso.date().safeParse(range.from).success || !z.iso.date().safeParse(range.to).success)) throw new ImportError("Invalid history dates.");
  const end = range ? Date.parse(range.to + "T00:00:00Z") + 86_400_000 - 1 : Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 1;
  const start = range ? Date.parse(range.from + "T00:00:00Z") : end + 1 - 30 * 86_400_000;
  if (start > end || end - start >= 30 * 86_400_000 || end >= now.getTime()) throw new ImportError("Choose up to 30 completed UTC days.");
  const window = { startTime: String(start), endTime: String(end) };
  const entries: ImportEntry[] = [];
  for (const kind of ["flexible", "locked"] as const) {
    let total: number | undefined, received = 0;
    for (let page = 1; ; page++) {
      if (page > 20) throw new ImportError("Earn history exceeded the import limit. No partial history was saved.");
      const result = parseRewardsPage(await signed(`/sapi/v1/simple-earn/${kind}/history/rewardsRecord`, {
        ...window, current: String(page), size: "100", ...(kind === "flexible" ? { type: "ALL" } : {}),
      }), kind, accountKey);
      if (total != null && total !== result.total) throw new ImportError("Earn history changed during pagination. Retry the sync.");
      total = result.total;
      received += result.entries.length;
      entries.push(...result.entries);
      if (received === total) break;
      if (!result.entries.length || received > total) throw new ImportError("Binance returned incomplete Earn history. Retry the sync.");
    }
  }
  for (const kind of ["deposit", "withdraw"] as const) {
    for (let page = 0; ; page++) {
      if (page >= 10) throw new ImportError("Transfer history exceeded the import limit. No partial history was saved.");
      const body = z.array(z.unknown()).parse(await signed(kind === "deposit" ? "/sapi/v1/capital/deposit/hisrec" : "/sapi/v1/capital/withdraw/history", {
        ...window, offset: String(page * 1000), limit: "1000", status: kind === "deposit" ? "1" : "6",
      }));
      entries.push(...parseCapitalPage(body, kind, accountKey));
      if (body.length < 1000) break;
    }
  }
  const unique = uniqueEntries(entries);
  if (unique.length !== entries.length) throw new ImportError("Binance repeated history records. Retry to obtain a complete import.");
  return { entries: unique, accounts: [accountKey], coverage: { from: new Date(start).toISOString().slice(0, 10), to: new Date(end).toISOString().slice(0, 10),
    description: "Simple Earn rewards and completed crypto deposits/withdrawals returned for this UTC range. Configure Spot pairs in Investment history. Fiat/P2P and internal wallet transfers are not included. Withdrawal principal and fees are shown as reported." } };
}
