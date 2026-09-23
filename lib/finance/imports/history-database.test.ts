import { expect, mock, test } from "bun:test";
import { and, eq } from "drizzle-orm";
mock.module("server-only", () => ({}));
const { getDb } = await import("@/lib/db");
const { advanceHistory, startBinanceHistory } = await import("./history-service");
const { env } = await import("@/lib/env");
import { accountConnections, importedEntries, investmentSyncs } from "@/lib/db/schema";
import { sealCredentials } from "../connections/crypto";
import type { ProviderIO } from "../connections/providers";

test.skipIf(process.env.FINANCE_DB_TESTS !== "1")("Binance history saves cursors atomically and resumes after failures, concurrent attempts and account changes", async () => {
  const db = getDb(), uid = String(1_000_000_000 + Math.floor(Math.random() * 1_000_000_000)), accountKey = `uid:${uid}`;
  const credentials = { provider: "binance" as const, apiKey: "qa-key-".repeat(8), apiSecret: "qa-secret-".repeat(8) };
  const encryptedCredentials = sealCredentials(credentials, env.sessionSecret());
  const created = await db.insert(accountConnections).values({ provider: "binance", encryptedCredentials }).onConflictDoNothing().returning({ provider: accountConnections.provider });
  // Keep any real connection intact. The opaque envelope is used only for the DB version guard;
  // injected credentials and transports ensure no real credential is decrypted or sent anywhere.
  const [guardRow] = await db.select({ encryptedCredentials: accountConnections.encryptedCredentials, enabled: accountConnections.enabled }).from(accountConnections).where(eq(accountConnections.provider, "binance"));
  if (!guardRow.enabled) { console.info("Skipped: the existing Binance connection is paused."); return; }
  const loadConnection = async () => ({ row: guardRow, credentials });
  const advance = (id: string) => advanceHistory(id, io, loadConnection);
  const fromIds: string[] = [];
  let failed = false, returnedUid = uid, onTrade: (() => Promise<void>) | undefined;
  const io: ProviderIO = { text: async () => "", pause: async () => {}, quotes: async () => new Map(), json: async (url) => {
    if (url.pathname.endsWith("/time")) return { serverTime: Date.now() };
    if (url.pathname.endsWith("/apiRestrictions")) return { enableReading: true, enableWithdrawals: false, enableSpotAndMarginTrading: false };
    if (url.pathname.endsWith("/account")) return { uid: returnedUid };
    if (url.pathname.endsWith("/exchangeInfo")) return { symbols: [{ symbol: "QAUSDT", baseAsset: "QA", quoteAsset: "USDT" }] };
    if (url.pathname.endsWith("/myTrades")) {
      if (failed) throw new Error("Synthetic outage");
      const from = url.searchParams.get("fromId")!; fromIds.push(from);
      if (onTrade) await onTrade();
      const start = Number(from), length = start === 0 ? 1000 : start === 1000 ? 2 : 0;
      return Array.from({ length }, (_, i) => ({ id: start + i, symbol: "QAUSDT", qty: "1", quoteQty: "10", price: "10", commission: "0", commissionAsset: "QA", time: Date.parse("2020-01-01") + start + i, isBuyer: true }));
    }
    return url.pathname.includes("simple-earn") ? { total: 0, rows: [] } : [];
  } };
  try {
    await startBinanceHistory({ from: "2020-01-01", pairs: ["QAUSDT"] }, io, loadConnection);
    const jobs = await db.select().from(investmentSyncs).where(eq(investmentSyncs.accountKey, accountKey));
    expect(jobs).toHaveLength(2);
    const spot = jobs.find((j) => j.scope === "spot:QAUSDT")!;
    const activity = jobs.find((j) => j.scope === "activity")!;
    const current = async () => (await db.select().from(investmentSyncs).where(eq(investmentSyncs.id, spot.id)))[0];
    expect(await advance(spot.id)).toMatchObject({ ok: true, more: true });
    expect((await current()).cursor).toBe("1000");
    failed = true;
    expect((await advance(spot.id)).ok).toBe(false);
    expect((await current()).cursor).toBe("1000");
    failed = false;
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    onTrade = async () => { entered(); await gate; };
    const firstAttempt = advance(spot.id);
    await started;
    const secondAttempt = await advance(spot.id);
    release();
    const attempts = [await firstAttempt, secondAttempt];
    onTrade = undefined;
    expect(attempts.filter((a) => a.ok)).toHaveLength(1);
    expect((await current()).cursor).toBe("1002");
    expect((await current()).completedAt).not.toBeNull();
    expect(await db.select().from(importedEntries).where(eq(importedEntries.accountKey, accountKey))).toHaveLength(1002);
    expect(fromIds).toEqual(["0", "1000"]);
    returnedUid = "999999999";
    expect(await advance(spot.id)).toMatchObject({ ok: false });
    expect((await current()).cursor).toBe("1002");
    returnedUid = uid;
    expect(await advance(activity.id)).toMatchObject({ ok: true, more: true });
    expect((await db.select().from(investmentSyncs).where(eq(investmentSyncs.id, activity.id)))[0].cursor).toBe("2020-01-31");
    // Disconnect/pause during the network request invalidates the batch before its cursor can move.
    await db.update(investmentSyncs).set({ cursor: "0", completedAt: null }).where(eq(investmentSyncs.id, spot.id));
    onTrade = async () => { await db.update(investmentSyncs).set({ enabled: false, lease: null }).where(eq(investmentSyncs.id, spot.id)); };
    expect((await advance(spot.id)).ok).toBe(false);
    expect((await current()).cursor).toBe("0");
    expect(await db.select().from(importedEntries).where(eq(importedEntries.accountKey, accountKey))).toHaveLength(1002);
  } finally {
    await db.delete(importedEntries).where(eq(importedEntries.accountKey, accountKey));
    await db.delete(investmentSyncs).where(eq(investmentSyncs.accountKey, accountKey));
    if (created.length) await db.delete(accountConnections).where(and(eq(accountConnections.provider, "binance"), eq(accountConnections.encryptedCredentials, encryptedCredentials)));
  }
}, 60_000);
