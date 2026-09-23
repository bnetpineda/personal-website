import "server-only";
import { z } from "zod";
import { binanceReader, defaultIO, fetchFlexReport, type ProviderIO } from "../connections/providers";
import type { Credentials } from "../connections/types";
import { ImportError, uniqueEntries, type HistoryImport, type ImportEntry } from "./types";
import { identifier, parseCapitalPage, parseIbkrHistory, parseRewardsPage } from "./provider-parsers";

/** Rolling overlap repairs missed days and deduplicates by provider identity, not import time. */
export async function fetchHistory(credentials: Credentials, io: ProviderIO = defaultIO, now = new Date(), range?: { from: string; to: string }, expectedAccount?: string): Promise<HistoryImport> {
  const signal = AbortSignal.timeout(45_000);
  if (credentials.provider === "wise") throw new ImportError("Import a Wise balance statement CSV from the inbox.");
  if (credentials.provider === "ibkr") {
    if (!credentials.historyQueryId) throw new ImportError("Add a history Flex Query ID to import IBKR transactions and earnings.");
    return parseIbkrHistory(await fetchFlexReport(credentials, signal, io, credentials.historyQueryId));
  }
  const signed = await binanceReader(credentials, signal, io);
  const { uid } = z.object({ uid: identifier }).parse(await signed("/api/v3/account", { omitZeroBalances: "true" }));
  const accountKey = `uid:${uid}`;
  if (expectedAccount && accountKey !== expectedAccount) throw new ImportError("The connected Binance account changed. Start history for the new account.");
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
