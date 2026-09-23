import "server-only";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { fetchCoinGeckoPrices } from "../prices";
import { readJson, readText } from "./http";
import { BINANCE_MISSING_PRICE_WARNING, removeBinanceEarnReceipts } from "./binance-positions";
import { assertReadOnlyBinance, flexResponse, parseBinanceBalances, parseEarnPage, parseIbkrStatement, parseWiseBalances, parseWiseProfiles } from "./parsers";
import { ConnectionError, snapshotSchema, type ConnectedPosition, type ConnectionSnapshot, type Credentials, type WiseProfileOption } from "./types";

const BINANCE = "https://api.binance.com";
const FLEX = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/";

export interface ProviderIO {
  json: typeof readJson;
  text: typeof readText;
  quotes: typeof fetchCoinGeckoPrices;
  pause: (ms: number, signal: AbortSignal) => Promise<void>;
}
export const defaultIO: ProviderIO = { json: readJson, text: readText, quotes: fetchCoinGeckoPrices,
  pause: async (ms, signal) => { await delay(ms, undefined, { signal }); } };

export async function fetchWiseProfiles(token: string, io: Pick<ProviderIO, "json"> = defaultIO): Promise<WiseProfileOption[]> {
  try {
    const body = await io.json(new URL("https://api.wise.com/2026Q3/profiles"),
      { Authorization: `Bearer ${token}` }, AbortSignal.timeout(10000));
    return parseWiseProfiles(body);
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    // Validation and transport errors may contain personal data or the credential.
    throw new ConnectionError("Wise profiles could not be read. Check your API token and try again.");
  }
}

export async function binanceReader(credentials: Extract<Credentials, { provider: "binance" }>, signal: AbortSignal, io: ProviderIO) {
  const time = z.object({ serverTime: z.number().int().positive() }).parse(await io.json(new URL(`${BINANCE}/api/v3/time`), {}, signal));
  const offset = time.serverTime - Date.now();
  const signed = (path: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams({ ...params, recvWindow: "10000", timestamp: String(Date.now() + offset) });
    query.set("signature", createHmac("sha256", credentials.apiSecret).update(query.toString()).digest("hex"));
    return io.json(new URL(`${BINANCE}${path}?${query}`), { "X-MBX-APIKEY": credentials.apiKey }, signal);
  };
  assertReadOnlyBinance(await signed("/sapi/v1/account/apiRestrictions"));
  return signed;
}

async function binance(credentials: Extract<Credentials, { provider: "binance" }>, signal: AbortSignal, io: ProviderIO): Promise<ConnectionSnapshot> {
  const signed = await binanceReader(credentials, signal, io);

  const earn = async (kind: "flexible" | "locked") => {
    const positions: { id: string; asset: string; quantity: number }[] = [];
    let expected: number | undefined;
    for (let page = 1; page <= 10; page++) {
      const result = parseEarnPage(await signed(`/sapi/v1/simple-earn/${kind}/position`, { current: String(page), size: "100" }), kind);
      if (expected != null && expected !== result.total) throw new ConnectionError("Earn positions changed during sync. Retry to get a complete snapshot.");
      expected = result.total;
      positions.push(...result.positions);
      if (positions.length === expected) return positions;
      if (result.positions.length === 0 || positions.length > expected) break;
    }
    throw new ConnectionError("Binance returned an incomplete Earn list. Previous balances were kept; retry later.");
  };

  // Fail the whole snapshot if any wallet fails, so Earn never silently disappears.
  const [account, flexible, locked, rawTickers, tether] = await Promise.all([
    signed("/api/v3/account", { omitZeroBalances: "true" }),
    earn("flexible"), earn("locked"),
    io.json(new URL(`${BINANCE}/api/v3/ticker/price`), {}, signal),
    io.quotes(["tether"], ["USD"]),
  ]);
  const spot = parseBinanceBalances(account);
  const { uid } = z.object({ uid: z.union([z.string().regex(/^\d+$/), z.number().int().safe().nonnegative()]).transform(String) }).parse(account);
  const usd = tether.get("tether");
  const usdtUsd = usd?.prices.usd;
  if (!usdtUsd || !Number.isFinite(usdtUsd) || !usd || Date.now() - usd.asOf.getTime() > 24 * 3_600_000) {
    throw new ConnectionError("A recent USDT/USD quote is unavailable. Previous balances were kept.");
  }
  const tickers = z.array(z.object({ symbol: z.string(), price: z.string().regex(/^\d+(?:\.\d+)?$/) })).parse(rawTickers);
  const prices = new Map(tickers.map((q) => [q.symbol, Number(q.price)]));
  const quantities = [
    ...spot.map((p) => ({ ...p, id: `spot:${p.asset}`, wallet: "Spot" })),
    ...flexible.map((p) => ({ ...p, wallet: "Earn Flexible" })),
    ...locked.map((p) => ({ ...p, wallet: "Earn Locked" })),
  ].filter((p) => p.quantity > 0);
  const positions = removeBinanceEarnReceipts(quantities.map((p): ConnectedPosition => {
    const usdt = p.asset === "USDT" ? 1 : prices.get(`${p.asset}USDT`) ??
      ((prices.get(`${p.asset}BTC`) ?? 0) * (prices.get("BTCUSDT") ?? 0));
    return { id: p.id, name: `${p.asset} · ${p.wallet}`, symbol: p.asset, assetClass: "crypto", currency: "USD",
      quantity: p.quantity, marketValue: usdt > 0 ? p.quantity * usdt * usdtUsd : null, costBasis: null };
  }));
  return snapshotSchema.parse({ asOf: new Date().toISOString(), accountKey: `uid:${uid}`, positions, warnings: [
    "Spot and Simple Earn only. Funding, Margin, Futures, staking services and other Earn products are not included.",
    "USD values use Binance USDT market prices and a USDT/USD quote. Spot trade cost estimates are available on Holdings after importing history.",
    ...(positions.some((p) => p.marketValue == null) ? [BINANCE_MISSING_PRICE_WARNING] : []),
  ] });
}

export async function fetchFlexReport(credentials: Extract<Credentials, { provider: "ibkr" }>, signal: AbortSignal, io: ProviderIO, queryId = credentials.queryId): Promise<string> {
  const url = (endpoint: string, query: string) => new URL(`${FLEX}${endpoint}?${new URLSearchParams({ t: credentials.token, q: query, v: "3" })}`);
  const request = flexResponse(await io.text(url("SendRequest", queryId), {}, signal));
  if (!request.reference) throw new ConnectionError(`IBKR could not generate the report (code ${request.errorCode ?? "unknown"}). Check the Flex token and query ID.`);
  // Bounded retries cover normal report generation without keeping a serverless job alive indefinitely.
  for (let attempt = 0; attempt < 4; attempt++) {
    await io.pause(attempt === 0 ? 1000 : 2000, signal);
    const xml = await io.text(url("GetStatement", request.reference), {}, signal);
    if (/<FlexQueryResponse(?:\s|>)/.test(xml)) return xml;
    const response = flexResponse(xml);
    if (response.errorCode !== "1019") {
      throw new ConnectionError(`IBKR could not retrieve the report (code ${response.errorCode ?? "unknown"}). Check the Flex settings.`);
    }
  }
  throw new ConnectionError("IBKR is still preparing the statement. Previous balances were kept; try syncing again shortly.");
}

export async function fetchAccountSnapshot(credentials: Credentials, io: ProviderIO = defaultIO): Promise<ConnectionSnapshot> {
  const signal = AbortSignal.timeout(45_000);
  switch (credentials.provider) {
    case "binance": return binance(credentials, signal, io);
    case "ibkr": return parseIbkrStatement(await fetchFlexReport(credentials, signal, io));
    case "wise": {
      const url = new URL(`https://api.wise.com/2026Q3/profiles/${credentials.profileId}/balances?types=STANDARD,SAVINGS`);
      return parseWiseBalances(await io.json(url, { Authorization: `Bearer ${credentials.token}` }, signal), credentials.profileId);
    }
  }
}
