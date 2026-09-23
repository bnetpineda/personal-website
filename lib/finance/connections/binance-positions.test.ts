import { describe, expect, test } from "bun:test";
import { BINANCE_MISSING_PRICE_WARNING, normalizeBinanceSnapshot, removeBinanceEarnReceipts } from "./binance-positions";
import { includedPositions, type ConnectedPosition } from "./types";
import { computeNetWorth } from "../calc";

const position = (id: string, symbol: string, quantity: number, marketValue: number | null): ConnectedPosition => ({
  id, symbol, quantity, marketValue, name: symbol, assetClass: "crypto", currency: "USD", costBasis: null,
});

describe("Binance Earn receipts", () => {
  test("keeps actual Spot plus Earn assets and removes only covered unpriced LD receipts", () => {
    const spot = position("spot:BTC", "BTC", 0.1, 5000);
    const earn = position("flexible:BTC001", "BTC", 1.01, 50500);
    const receipt = position("spot:LDBTC", "LDBTC", 1, null);
    const rows = [spot, receipt, earn];
    expect(removeBinanceEarnReceipts(rows)).toEqual([spot, earn]);
    expect(rows).toHaveLength(3);
    const snapshot = { asOf: "2026-09-24T00:00:00.000Z", positions: rows, warnings: [BINANCE_MISSING_PRICE_WARNING] };
    const counted = includedPositions([{ provider: "binance", includeInNetWorth: true, snapshot }]);
    expect(computeNetWorth([], [], { USD: 1 }, counted).assetsPhp).toBe(55500);
    expect(counted.map((p) => p.quantity)).toEqual([0.1, 1.01]);
    expect(includedPositions([{ provider: "binance", includeInNetWorth: false, snapshot }])).toEqual([]);
    expect(includedPositions([{ provider: "ibkr", includeInNetWorth: true, snapshot }])).toEqual(rows);
  });

  test("does not hide legitimate LD-prefix assets, priced tokens, or unmatched/excess receipts", () => {
    const rows = [
      position("spot:LDO", "LDO", 10, 100),
      position("spot:LDUSDT", "LDUSDT", 20, 20),
      position("flexible:USDT", "USDT", 20, 20),
      position("spot:LDSOL", "LDSOL", 2, null),
      position("spot:LDBTC", "LDBTC", 2, null),
      position("flexible:BTC", "BTC", 1, 50000),
    ];
    expect(removeBinanceEarnReceipts(rows)).toEqual(rows);
  });

  test("uses all Earn positions for coverage and retains remaining price warnings", () => {
    const rows = [position("spot:LDUSDT", "LDUSDT", 30, null), position("flexible:A", "USDT", 10, 10),
      position("locked:B", "USDT", 20, 20), position("spot:UNPRICED", "UNPRICED", 1, null)];
    const snapshot = { asOf: "2026-09-24T00:00:00.000Z", positions: rows, warnings: [BINANCE_MISSING_PRICE_WARNING, "Keep other notices."] };
    const normalized = normalizeBinanceSnapshot(snapshot);
    expect(normalized.positions).toEqual(rows.slice(1));
    expect(normalized.warnings).toEqual(snapshot.warnings);
    expect(normalizeBinanceSnapshot(normalized)).toEqual(normalized);
    const fullyPriced = normalizeBinanceSnapshot({ ...snapshot, positions: rows.slice(0, -1) });
    expect(fullyPriced.warnings).toEqual(["Keep other notices."]);
    expect(fullyPriced.asOf).toBe(snapshot.asOf);
  });
});
