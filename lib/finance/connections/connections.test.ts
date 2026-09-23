import { describe, expect, test } from "bun:test";
import { computeNetWorth } from "../calc";
import { openCredentials, sealCredentials } from "./crypto";
import { flexFixture } from "./fixtures";
import { assertReadOnlyBinance, flexResponse, parseBinanceBalances, parseEarnPage, parseIbkrStatement, parseWiseBalances } from "./parsers";
import { includedPositions, isConnectionStale, type ConnectedPosition, type Credentials } from "./types";

describe("account credentials", () => {
  const secret = "only-a-test-encryption-secret-at-least-32-characters";
  const credentials: Credentials = { provider: "binance", apiKey: "test-api-key", apiSecret: "test-api-secret" };
  test("encrypts with a new IV, authenticates provider, and rejects tampering/rotated keys", () => {
    const sealed = sealCredentials(credentials, secret);
    expect(sealed).not.toContain(credentials.apiSecret);
    expect(sealCredentials(credentials, secret)).not.toBe(sealed);
    expect(openCredentials(sealed, "binance", secret)).toEqual(credentials);
    expect(() => openCredentials(sealed, "wise", secret)).toThrow();
    expect(() => openCredentials(sealed, "binance", secret + "rotated")).toThrow();
    const parts = sealed.split(".");
    parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
    expect(() => openCredentials(parts.join("."), "binance", secret)).toThrow();
    expect(() => sealCredentials(credentials, "short")).toThrow();
  });
});

describe("provider balance normalization", () => {
  const wise = { id: 1, currency: "USD", type: "STANDARD", investmentState: "NOT_INVESTED",
    amount: { value: 70, currency: "USD" }, reservedAmount: { value: 30, currency: "USD" }, totalWorth: { value: 100, currency: "USD" } };
  test("Wise uses total worth once and leaves investment costs unknown", () => {
    const cash = parseWiseBalances([wise], "123").positions[0];
    expect(cash.marketValue).toBe(100);
    expect(cash.costBasis).toBe(100);
    const invested = parseWiseBalances([{ ...wise, investmentState: "INVESTED" }], "123").positions[0];
    expect(invested.assetClass).toBe("fund");
    expect(invested.costBasis).toBeNull();
    expect(() => parseWiseBalances([{ ...wise, totalWorth: undefined }], "123")).toThrow();
    expect(() => parseWiseBalances([{ ...wise, totalWorth: { value: 100, currency: "EUR" } }], "123")).toThrow();
  });
  test("Spot includes locked assets, drops zero balances, and rejects missing numbers", () => {
    const result = parseBinanceBalances({ balances: [{ asset: "BTC", free: "0.10", locked: "0.05" }, { asset: "ETH", free: "0", locked: "0" }] });
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBeCloseTo(0.15);
    expect(() => parseBinanceBalances({ balances: [{ asset: "BTC", free: "", locked: "0" }] })).toThrow();
    expect(() => parseBinanceBalances({ code: -2015 })).toThrow();
  });
  test("Earn uses current principal, never cumulative rewards", () => {
    const flexible = parseEarnPage({ total: 1, rows: [{ asset: "USDT", productId: "USDT001", totalAmount: "75.46", cumulativeTotalRewards: "400" }] }, "flexible");
    expect(flexible.positions[0].quantity).toBe(75.46);
    const locked = parseEarnPage({ total: "1", rows: [{ asset: "AXS", positionId: 123123, amount: "122.09", rewardAmt: "5.17" }] }, "locked");
    expect(locked.positions[0].quantity).toBe(122.09);
    expect(locked.positions[0].id).toBe("locked:123123");
  });
  test("requires read access and refuses keys that can trade or transfer", () => {
    expect(() => assertReadOnlyBinance({ enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false })).not.toThrow();
    for (const flag of ["enableWithdrawals", "permitsUniversalTransfer", "enableSpotAndMarginTrading", "enableFutures", "enablePortfolioMarginTrading"]) {
      expect(() => assertReadOnlyBinance({ enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false, [flag]: true })).toThrow();
    }
    expect(() => assertReadOnlyBinance({ enableReading: false })).toThrow();
    expect(() => assertReadOnlyBinance({ enableReading: true })).toThrow();
  });
});

describe("IBKR Flex reports", () => {
  test("uses reported position values and native cash without doubling the base summary", () => {
    const parsed = parseIbkrStatement(flexFixture());
    expect(parsed.positions).toHaveLength(3);
    expect(parsed.positions[0].name).toBe("Test & Company");
    expect(parsed.positions[0].marketValue).toBe(240);
    expect(parsed.positions[2].marketValue).toBe(-20);
    expect(parsed.asOf).toBe("2026-09-23T00:00:00.000Z");
    // Options already have their contract multiplier included in positionValue.
    const option = parseIbkrStatement(flexFixture(`<OpenPosition conid="102" symbol="OPT" currency="USD" assetCategory="OPT" position="2" positionValue="1000" costBasisMoney="800" levelOfDetail="SUMMARY" />`));
    expect(option.positions[0].marketValue).toBe(1000);
  });
  test("accepts genuinely empty positions, but rejects missing sections and malformed/lot reports", () => {
    expect(parseIbkrStatement(flexFixture("")).positions).toHaveLength(2);
    for (const broken of [
      flexFixture().replace(/<OpenPositions>[\s\S]*?<\/OpenPositions>/, ""),
      flexFixture().replace('positionValue="240"', 'positionValue=""'),
      flexFixture().replace('levelOfDetail="SUMMARY"', 'levelOfDetail="LOT"'),
      flexFixture().replace('toDate="20260923"', 'toDate="20260230"'),
      flexFixture().replace("</FlexStatement>", ""),
      '<!DOCTYPE x [<!ENTITY e "test">]>' + flexFixture(),
      "<html>Login required</html>",
    ]) expect(() => parseIbkrStatement(broken)).toThrow();
  });
  test("rejects duplicate positions and multi-period statements instead of inflating totals", () => {
    const position = '<OpenPosition conid="101" symbol="TEST" currency="USD" assetCategory="STK" position="1" positionValue="50" levelOfDetail="SUMMARY" />';
    expect(() => parseIbkrStatement(flexFixture(position + position))).toThrow();
    const statement = flexFixture().match(/<FlexStatement accountId[\s\S]*?<\/FlexStatement>/)![0];
    expect(() => parseIbkrStatement(flexFixture().replace("</FlexStatements>", `${statement}</FlexStatements>`))).toThrow();
  });
  test("preserves large reference codes as strings", () => {
    expect(flexResponse('<FlexStatementResponse><Status>Success</Status><ReferenceCode>12345678901234567890</ReferenceCode></FlexStatementResponse>').reference).toBe("12345678901234567890");
  });
});

describe("connected portfolio totals", () => {
  const position: ConnectedPosition = { id: "1", name: "Test asset", symbol: "TEST", assetClass: "crypto", currency: "USD", quantity: 1, marketValue: 100, costBasis: null };
  test("unknown cost does not become a zero cost or a fabricated gain", () => {
    const total = computeNetWorth([], [], { USD: 56 }, [position]);
    expect(total.netWorthPhp).toBe(5600);
    expect(total.unrealizedPhp).toBe(0);
    expect(total.unrealizedPct).toBeNull();
    expect(total.missingCostBasis).toEqual(["Test asset"]);
    expect(computeNetWorth([], [], { USD: 56 }, [{ ...position, marketValue: null }]).missingPrices).toEqual(["Test asset"]);
  });
  test("short positions and negative cash subtract once, with signed cost basis", () => {
    const total = computeNetWorth([], [{ balance: 50, currency: "USD" }], { USD: 1 }, [
      { ...position, marketValue: 100, costBasis: 80 },
      { ...position, id: "2", quantity: -1, marketValue: -20, costBasis: -25 },
      { ...position, id: "3", assetClass: "cash", quantity: -10, marketValue: -10, costBasis: -10 },
    ]);
    expect(total.assetsPhp).toBe(100);
    expect(total.liabilitiesPhp).toBe(80);
    expect(total.netWorthPhp).toBe(20);
    expect(total.unrealizedPhp).toBe(25);
  });
  test("reviewed accounts only; pausing does not remove the saved portfolio", () => {
    const snapshot = { positions: [position], asOf: "2026-09-23T00:00:00.000Z", warnings: [] };
    expect(includedPositions([{ includeInNetWorth: false, snapshot }])).toEqual([]);
    expect(includedPositions([{ includeInNetWorth: true, snapshot }])).toEqual([position]);
    expect(isConnectionStale({ provider: "ibkr", snapshot, lastSyncedAt: new Date("2026-09-24T00:00:00Z") }, new Date("2026-09-24T12:00:00Z"))).toBe(false);
    expect(isConnectionStale({ provider: "ibkr", snapshot, lastSyncedAt: new Date("2026-09-28T00:00:00Z") }, new Date("2026-09-28T12:00:00Z"))).toBe(true);
  });
});
