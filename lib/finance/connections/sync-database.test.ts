import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { accountConnections } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sealCredentials } from "./crypto";
import type { ProviderIO } from "./providers";
import { syncAccount } from "./service";

const unused = async (): Promise<never> => { throw new Error("Unexpected request"); };
const emptyWallet = (body: Record<string, unknown>): unknown => {
  switch (body.type) {
    case "userRole": return { role: "user" };
    case "perpDexs": return [null];
    case "userAbstraction": return "default";
    case "spotMetaAndAssetCtxs": return [{ tokens: [{ name: "USDC", index: 0 }], universe: [] }, []];
    case "spotClearinghouseState": return { balances: [] };
    case "borrowLendUserState": return { tokenToState: [] };
    case "delegatorSummary": return { delegated: "0.0", undelegated: "0.0", totalPendingWithdrawal: "0.0" };
    case "clearinghouseState": return { marginSummary: { accountValue: "0.0" }, assetPositions: [] };
    default: return [];
  }
};
const io = (fail?: string): ProviderIO => ({ text: unused, quotes: unused, pause: async () => {}, json: async (_url, _headers, _signal, body) => {
  const query = body as Record<string, unknown>;
  if (query.type === fail) throw new Error(`Synthetic ${fail} outage`);
  return emptyWallet(query);
} });

test.skipIf(process.env.FINANCE_DB_TESTS !== "1")("sync leases: one run at a time, a cooldown, older reports refused, history failures keep balances, and the lease is always released", async () => {
  const db = getDb(), c = accountConnections;
  const address = "0x" + "ab".repeat(20);
  // Only a database with no Hyperliquid connection is used, so a real one is never touched.
  const created = await db.insert(c).values({ provider: "hyperliquid", encryptedCredentials: sealCredentials({ provider: "hyperliquid", address }, env.sessionSecret()) })
    .onConflictDoNothing().returning({ provider: c.provider });
  if (!created.length) { console.info("Skipped: a Hyperliquid connection already exists in this database."); return; }
  const rewind = () => db.update(c).set({ lastAttemptAt: new Date(Date.now() - 120_000) }).where(eq(c.provider, "hyperliquid"));
  const row = async () => (await db.select().from(c).where(eq(c.provider, "hyperliquid")))[0];
  try {
    const results = await Promise.all([syncAccount("hyperliquid", { io: io() }), syncAccount("hyperliquid", { io: io() })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)?.message).toContain("Sync unavailable");
    expect((await row()).syncLease).toBeNull();

    // A minute's cooldown after an attempt.
    expect((await syncAccount("hyperliquid", { io: io() })).message).toContain("wait a minute");

    // A history failure still saves the new balances.
    await rewind();
    const history = await syncAccount("hyperliquid", { io: io("userFunding") });
    expect(history).toMatchObject({ ok: false });
    expect(history.message).toStartWith("Balances updated.");
    expect((await row()).historyError).toBeTruthy();
    expect((await row()).snapshot).not.toBeNull();

    // A report older than the saved one is refused and the saved balances stay.
    await db.update(c).set({ snapshot: { asOf: "2999-01-01T00:00:00.000Z", positions: [], warnings: [] } }).where(eq(c.provider, "hyperliquid"));
    await rewind();
    expect((await syncAccount("hyperliquid", { io: io() })).message).toContain("older report");
    expect((await row()).snapshot?.asOf).toBe("2999-01-01T00:00:00.000Z");

    // A failed snapshot records the error and releases the lease.
    await rewind();
    expect((await syncAccount("hyperliquid", { io: io("userRole") })).ok).toBe(false);
    const failed = await row();
    expect(failed.error).toBeTruthy();
    expect(failed.syncLease).toBeNull();
    expect(failed.leaseExpiresAt).toBeNull();
  } finally {
    await db.delete(c).where(eq(c.provider, "hyperliquid"));
  }
});
