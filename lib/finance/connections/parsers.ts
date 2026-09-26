import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import type { AssetClass } from "../constants";
import { ConnectionError, snapshotSchema, type ConnectedPosition, type ConnectionSnapshot } from "./types";

// Empty/missing numeric fields must never silently become zero.
const number = z.union([z.number(), z.string().regex(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/)])
  .transform(Number).pipe(z.number().finite());
const id = z.union([z.string().min(1), z.number().int().safe()]).transform(String);
const currency = z.string().regex(/^[A-Z]{3}$/);

export function parseBinanceBalances(body: unknown): { asset: string; quantity: number }[] {
  const account = z.object({ balances: z.array(z.object({
    asset: z.string().regex(/^[A-Z0-9_]+$/), free: number.pipe(z.number().nonnegative()), locked: number.pipe(z.number().nonnegative()),
  })) }).parse(body);
  const rows = account.balances.map((b) => ({ asset: b.asset, quantity: b.free + b.locked })).filter((b) => b.quantity > 0);
  if (new Set(rows.map((r) => r.asset)).size !== rows.length) throw new ConnectionError("Binance returned duplicate assets. Previous balances were kept.");
  return rows;
}

export function assertReadOnlyBinance(body: unknown): void {
  const permissions = z.object({ enableReading: z.literal(true), enableWithdrawals: z.boolean(), enableSpotAndMarginTrading: z.boolean() }).passthrough().parse(body);
  const writePermissions = ["enableWithdrawals", "enableInternalTransfer", "enableMargin", "enableFutures", "permitsUniversalTransfer",
    "enableVanillaOptions", "enableFixApiTrade", "enableSpotAndMarginTrading", "enablePortfolioMarginTrading"];
  if (writePermissions.some((permission) => permissions[permission] === true)) {
    throw new ConnectionError("Use a Binance key with Enable Reading only. Turn off trading, transfers, and withdrawals, then retry.");
  }
}

export function parseEarnPage(body: unknown, kind: "flexible" | "locked") {
  const page = z.object({ total: number.pipe(z.number().int().nonnegative()), rows: z.array(object) }).parse(body);
  return { total: page.total, positions: page.rows.map((r) => ({
    id: `${kind}:${id.parse(kind === "flexible" ? r.productId : r.positionId)}`,
    asset: z.string().regex(/^[A-Z0-9_]+$/).parse(r.asset),
    quantity: number.pipe(z.number().nonnegative()).parse(kind === "flexible" ? r.totalAmount : r.amount),
  })) };
}

const object = z.record(z.string(), z.unknown());
type XmlNode = Record<string, unknown>;
const array = (value: unknown): unknown[] => value == null || value === "" ? [] : Array.isArray(value) ? value : [value];

/** DTDs are not part of Flex reports. Reject them before parsing any entities. */
export function parseFlexXml(xml: string): XmlNode {
  if (xml.length > 8_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new ConnectionError("IBKR returned an invalid XML report. Use an Activity Flex Query in XML format.");
  }
  return object.parse(new XMLParser({
    ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, parseAttributeValue: false,
  }).parse(xml));
}

export function flexResponse(xml: string): { reference: string | null; errorCode: string | null } {
  const document = parseFlexXml(xml);
  const response = object.parse(document.FlexStatementResponse);
  return {
    reference: response.Status === "Success" ? z.string().regex(/^\d+$/).parse(response.ReferenceCode) : null,
    errorCode: response.ErrorCode == null ? null : z.string().regex(/^\d{1,6}$/).parse(String(response.ErrorCode)),
  };
}

const assetClasses: Record<string, AssetClass> = { STK: "stock", ETF: "etf", CASH: "cash", BOND: "bond", FUND: "fund", CRYPTO: "crypto" };

const positionSchema = z.object({
  "@_conid": id, "@_symbol": z.string().min(1), "@_description": z.string().optional(),
  "@_currency": currency, "@_assetCategory": z.string(), "@_position": number,
  "@_positionValue": number, "@_costBasisMoney": number.optional(),
  "@_levelOfDetail": z.literal("SUMMARY"),
});

export function parseIbkrStatement(xml: string): ConnectionSnapshot {
  const root = object.parse(parseFlexXml(xml).FlexQueryResponse);
  const container = object.parse(root.FlexStatements);
  const statements = array(container.FlexStatement).map((s) => object.parse(s));
  if (statements.length === 0) throw new ConnectionError("IBKR returned no statements. Check the Flex Query and report period.");
  const positions: ConnectedPosition[] = [];
  const accounts = new Set<string>();
  const dates: string[] = [];

  for (const statement of statements) {
    const account = z.string().min(1).parse(statement["@_accountId"]);
    if (accounts.has(account)) throw new ConnectionError("Use Last Business Day for the IBKR query; multiple statements for one account would duplicate balances.");
    accounts.add(account);
    const rawDate = z.string().parse(statement["@_toDate"]);
    const date = z.iso.date().parse(rawDate.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"));
    dates.push(date);
    if (statement.OpenPositions === undefined || statement.CashReport === undefined) {
      throw new ConnectionError("Add both Open Positions (Summary) and Cash Report to the IBKR Activity Flex Query.");
    }
    const open = statement.OpenPositions === "" ? {} : object.parse(statement.OpenPositions);
    for (const value of array(open.OpenPosition)) {
      const p = positionSchema.parse(value);
      positions.push({
        id: `${account}:position:${p["@_conid"]}:${p["@_currency"]}`,
        name: p["@_description"] || p["@_symbol"], symbol: p["@_symbol"],
        assetClass: assetClasses[p["@_assetCategory"]] ?? "other", currency: p["@_currency"],
        quantity: p["@_position"], marketValue: p["@_positionValue"], costBasis: p["@_costBasisMoney"] ?? null,
      });
    }
    const cash = statement.CashReport === "" ? {} : object.parse(statement.CashReport);
    const cashRows = array(cash.CashReportCurrency).map((r) => object.parse(r));
    const nativeRows = cashRows.filter((r) => r["@_currency"] !== "BASE_SUMMARY");
    if (cashRows.length > 0 && nativeRows.length === 0) {
      throw new ConnectionError("Include currency-level Cash Report rows in the IBKR query, not just Base Currency Summary.");
    }
    for (const r of nativeRows) {
      const code = currency.parse(r["@_currency"]);
      const balance = number.parse(r["@_endingCash"]);
      positions.push({ id: `${account}:cash:${code}`, name: `${code} cash`, symbol: code, assetClass: "cash", currency: code,
        quantity: balance, marketValue: balance, costBasis: balance });
    }
  }
  if (new Set(dates).size !== 1) throw new ConnectionError("IBKR accounts have different statement dates. Use the same daily report period for all accounts.");
  return snapshotSchema.parse({ asOf: `${dates[0]}T00:00:00.000Z`, positions,
    warnings: ["Daily closing positions and cash; accrued interest and other NAV adjustments are not included."] });
}
