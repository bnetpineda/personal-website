import { describe, expect, test } from "bun:test";
import type { ConnectionSnapshot } from "../connections/types";
import { holdingCosts } from "./holding-costs";
import { summarizeSpotTrades } from "./spot-lots";
import type { SpotTrade } from "./types";

const snapshot: ConnectionSnapshot = { asOf: "2026-09-24T10:00:00.000Z", accountKey: "uid:1", warnings: [], positions: [
  { id: "spot:BTC", symbol: "BTC", name: "BTC", quantity: 1, assetClass: "crypto", marketValue: 200, currency: "USD", costBasis: null },
] };
const job = { accountKey: "uid:1", scope: "spot:BTCUSDT", completedAt: new Date("2026-09-24T11:00Z"), lastSyncedAt: new Date("2026-09-24T11:00Z"), error: null };
const buy = { accountKey: "uid:1", externalId: "spot:BTCUSDT:1", occurredOn: "2020-01-01", kind: "trade", currency: "USDT", status: "reviewed",
  trade: { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", quantity: 1, quoteQuantity: 100, price: 100, commission: 0, commissionAsset: "USDT", side: "BUY", executedAt: "2020-01-01T00:00:00.000Z" } as SpotTrade };
const reward = { accountKey: "uid:1", externalId: "earn:flexible:x", occurredOn: "2026-09-01", kind: "reward", currency: "BTC", status: "pending", trade: null };

describe("holding costs from prepared FIFO and a list of coins with other activity", () => {
  const prepared = (otherActivity: string[]) => {
    const summary = summarizeSpotTrades([buy], snapshot.asOf);
    return { fifo: summary.fifo, ignoredBases: new Set(summary.ignoredBases), paymentAssets: new Set(summary.paymentAssets), otherActivity: new Set(otherActivity) };
  };

  test("gives the same answer as loading every reward row", () => {
    expect(holdingCosts(snapshot, [], [job], prepared(["BTC"]))).toEqual(holdingCosts(snapshot, [buy, reward], [job]));
    expect(holdingCosts(snapshot, [], [job], prepared([]))).toEqual(holdingCosts(snapshot, [buy], [job]));
  });

  test("a coin with rewards or transfers says their cost isn't known", () => {
    expect(holdingCosts(snapshot, [], [job], prepared(["BTC"]))[0].reasons).toContain("Imported rewards or transfers also affect this coin. Their original cost is not established by Spot fills.");
    expect(holdingCosts(snapshot, [], [job], prepared(["ETH"]))[0].status).toBe("estimate");
  });
});
