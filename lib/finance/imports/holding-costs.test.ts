import { describe, expect, test } from "bun:test";
import type { ConnectedPosition, ConnectionSnapshot } from "../connections/types";
import { heldUsdtPairs, holdingCosts } from "./holding-costs";
import type { SpotTrade } from "./types";

const position = (symbol = "BTC", quantity = 1, id = `spot:${symbol}`): ConnectedPosition => ({
  id, symbol, name: symbol, quantity, assetClass: "crypto", marketValue: 200, currency: "USD", costBasis: null,
});
const snapshot = (positions = [position()]): ConnectionSnapshot => ({ asOf: "2026-09-24T10:00:00.000Z", accountKey: "uid:1", positions, warnings: [] });
const job = { accountKey: "uid:1", scope: "spot:BTCUSDT", completedAt: new Date("2026-09-24T11:00Z"), lastSyncedAt: new Date("2026-09-24T11:00Z"), error: null };
const entry = (id: number, overrides: Partial<SpotTrade> = {}) => ({ accountKey: "uid:1", externalId: `spot:BTCUSDT:${id}`, occurredOn: "2020-01-01",
  kind: "trade", currency: "USDT", status: "reviewed", trade: { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", quantity: 1,
    quoteQuantity: 100, price: 100, commission: 1, commissionAsset: "USDT", side: "BUY", executedAt: `2020-01-01T00:00:0${id}.000Z`, ...overrides } as SpotTrade });

describe("holding trade costs", () => {
  test("uses remaining FIFO lots and quote fees, without changing provider balances or claiming USD basis", () => {
    const s = snapshot([position("BTC", 1.5)]);
    const before = JSON.stringify(s);
    const [cost] = holdingCosts(s, [entry(1), entry(2, { quoteQuantity: 200 }), entry(3, { side: "SELL", quantity: 0.5, quoteQuantity: 75 })], [job]);
    expect(cost.status).toBe("estimate");
    expect(cost.trackedQuantity).toBe(1.5);
    expect(cost.lines[0]).toMatchObject({ cost: 251.5, currency: "USDT" });
    expect(cost.lines[0].averageCost).toBeCloseTo(251.5 / 1.5);
    expect(JSON.stringify(s)).toBe(before);
    expect(s.positions[0].costBasis).toBeNull();
  });
  test("never borrows another account's trades or uses trades after the balance snapshot", () => {
    const rows = [entry(1), { ...entry(2), accountKey: "uid:2" }, entry(3, { executedAt: "2026-09-25T00:00:00.000Z" })];
    expect(holdingCosts(snapshot(), rows, [job])[0].trackedQuantity).toBe(1);
    expect(holdingCosts({ ...snapshot(), accountKey: undefined }, rows, [job])[0].status).toBe("unavailable");
    expect(holdingCosts(snapshot(), rows, [{ ...job, accountKey: "uid:2" }])[0].status).toBe("partial");
  });
  test("unknown acquisitions never become zero-cost lots, even if some purchases are known", () => {
    const [cost] = holdingCosts(snapshot([position("BTC", 1.1)]), [entry(1), {
      ...entry(2), trade: null, kind: "reward", currency: "BTC", externalId: "earn:flexible:reward",
    }], [job]);
    expect(cost.status).toBe("partial");
    expect(cost.lines[0].cost).toBe(101);
    expect(cost.trackedQuantity).toBe(1);
    expect(cost.reasons.some((r) => r.includes("rewards or transfers"))).toBe(true);
    expect(holdingCosts(snapshot(), [], [job])[0]).toMatchObject({ status: "unavailable", lines: [] });
    const [exhausted] = holdingCosts(snapshot(), [entry(1), entry(2, { side: "SELL" })], [job]);
    expect(exhausted.status).toBe("unavailable");
    expect(exhausted.reasons.some((r) => r.includes("used up"))).toBe(true);
  });
  test("the estimate is per coin across wallets and drops matched LD receipts", () => {
    const s = snapshot([position("BTC", 0.2), position("BTC", 0.8, "flexible:BTC001"), { ...position("LDBTC", 0.8), marketValue: null }]);
    const [cost] = holdingCosts(s, [entry(1)], [job]);
    expect(holdingCosts(s, [entry(1)], [job])).toHaveLength(1);
    expect(cost).toMatchObject({ status: "estimate", heldQuantity: 1, trackedQuantity: 1, positionCount: 2 });
    expect(cost.lines[0].cost).toBe(101);
  });
  test("unfinished, failed or older history is always qualified", () => {
    for (const j of [{ ...job, completedAt: null }, { ...job, error: "failed" }, { ...job, lastSyncedAt: new Date("2026-09-23") }]) {
      expect(holdingCosts(snapshot(), [entry(1)], [j])[0].status).toBe("partial");
    }
  });
  test("unmatched sells, ignored trades, third-coin fees and cross-market payment are gaps", () => {
    for (const rows of [
      [entry(1, { side: "SELL" }), entry(2)],
      [entry(1, { commissionAsset: "BNB" })],
      [entry(1), { ...entry(2), status: "ignored" }],
      [entry(1), entry(2, { symbol: "ETHBTC", baseAsset: "ETH", quoteAsset: "BTC", commission: 0 })],
      [entry(1), entry(2, { symbol: "ETHUSDT", baseAsset: "ETH", commissionAsset: "BTC" })],
      [entry(1), { ...entry(2), trade: null, kind: "fee", currency: "BTC", externalId: "withdraw:1:fee" }],
    ]) expect(holdingCosts(snapshot(), rows, [job])[0].status).toBe("partial");
  });
  test("never adds costs in different currencies and flags pair-specific FIFO", () => {
    const [cost] = holdingCosts(snapshot([position("BTC", 2)]), [entry(1), entry(2, { symbol: "BTCEUR", quoteAsset: "EUR" })], [job, { ...job, scope: "spot:BTCEUR" }]);
    expect(cost.status).toBe("partial");
    expect(cost.lines.map((l) => l.currency)).toEqual(["USDT", "EUR"]);
    expect(cost.reasons.some((r) => r.includes("separately per trading pair"))).toBe(true);
  });
  test("base-coin fees reduce bought units and float noise does not create a false mismatch", () => {
    const [cost] = holdingCosts(snapshot([position("BTC", 0.999000000000001)]), [entry(1, { commission: 0.001, commissionAsset: "BTC" })], [job]);
    expect(cost.status).toBe("estimate");
    expect(cost.lines[0]).toMatchObject({ quantity: 0.999, cost: 100 });
  });
});

test("market discovery deduplicates wallets, requires listed pairs, preserves LDO and has a bounded size", () => {
  expect(heldUsdtPairs([position(), position("BTC", 0.1, "flexible:BTC"), position("LDO"), position("USDT"), position("OBSOLETE")], ["BTCUSDT", "LDOUSDT"]))
    .toEqual({ pairs: ["BTCUSDT", "LDOUSDT"], skipped: ["OBSOLETE"] });
  const positions = Array.from({ length: 25 }, (_, i) => position(`COIN${i}`));
  const selected = heldUsdtPairs(positions, positions.map((p) => `${p.symbol}USDT`));
  expect(selected.pairs).toHaveLength(20);
  expect(selected.skipped).toHaveLength(5);
});
