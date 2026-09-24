import { expect, mock, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import type { SpotTrade } from "./types";

const trade = (id: number, overrides: Partial<SpotTrade> = {}): SpotTrade => ({ symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT", side: "BUY",
  quantity: 1, quoteQuantity: 100, price: 100, commission: 0, commissionAsset: "USDT", executedAt: `2001-01-0${id}T00:00:00.000Z`, ...overrides });

test.skipIf(process.env.FINANCE_DB_TESTS !== "1")("spot FIFO cache rebuilds on status changes, prunes old snapshots and survives concurrent rebuilds", async () => {
  mock.module("server-only", () => ({}));
  const { getDb } = await import("@/lib/db");
  const { readSpotFifo } = await import("./spot-fifo");
  const { importedEntries, spotFifo, spotFifoMeta } = await import("@/lib/db/schema");
  const db = getDb(), accountKey = `qa:${crypto.randomUUID()}`;
  const cleanup = () => Promise.all([
    db.delete(spotFifo).where(eq(spotFifo.accountKey, accountKey)),
    db.delete(spotFifoMeta).where(eq(spotFifoMeta.accountKey, accountKey)),
    db.delete(importedEntries).where(eq(importedEntries.accountKey, accountKey)),
  ]);
  try {
    await db.insert(importedEntries).values([1, 2].map((id) => ({ provider: "binance" as const, accountKey, externalId: `spot:BTCUSDT:${id}`,
      occurredOn: `2001-01-0${id}`, kind: "trade" as const, amount: -100, currency: "USDT", description: `${accountKey} buy ${id}`, trade: trade(id) })));

    expect((await readSpotFifo(accountKey, null)).fifo[0]).toMatchObject({ bought: 2, remaining: 2, cost: 200 });
    // Served from the cache on the second read.
    expect((await readSpotFifo(accountKey, null)).fifo[0]).toMatchObject({ bought: 2 });

    // Ignoring a fill changes the source fingerprint, even when the app clock lags the database clock.
    await db.update(importedEntries).set({ status: "ignored" }).where(and(eq(importedEntries.accountKey, accountKey), eq(importedEntries.externalId, "spot:BTCUSDT:2")));
    const ignored = await readSpotFifo(accountKey, null);
    expect(ignored.fifo[0]).toMatchObject({ bought: 1, cost: 100 });
    expect([...ignored.ignoredBases]).toEqual(["BTC"]);

    // Only the full history and the latest snapshot key are kept.
    await readSpotFifo(accountKey, "2001-01-01T12:00:00.000Z");
    await readSpotFifo(accountKey, "2001-01-02T12:00:00.000Z");
    const keys = await db.select({ asOf: spotFifoMeta.asOf }).from(spotFifoMeta).where(eq(spotFifoMeta.accountKey, accountKey));
    expect(keys.map((key) => key.asOf).sort()).toEqual(["", "2001-01-02T12:00:00.000Z"]);

    // Two rebuilds of the same key at once must both return numbers instead of failing on the primary key.
    await db.update(importedEntries).set({ status: "pending" }).where(eq(importedEntries.accountKey, accountKey));
    const [a, b] = await Promise.all([readSpotFifo(accountKey, null), readSpotFifo(accountKey, null)]);
    expect(a.fifo[0]).toMatchObject({ bought: 2 });
    expect(b.fifo[0]).toMatchObject({ bought: 2 });
  } finally {
    await cleanup();
  }
});
