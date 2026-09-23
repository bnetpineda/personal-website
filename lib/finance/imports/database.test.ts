import { expect, mock, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
mock.module("server-only", () => ({}));
const { getDb } = await import("@/lib/db");
const { ingestEntries, ingestQuery, postImportedEntry, applyCategoryRules } = await import("./service");
const { previewWiseBalances, saveWiseImport, wiseBalanceQuery } = await import("./wise-balances");
import { cashFlows, categories, categoryRules, holdings, importedEntries } from "@/lib/db/schema";
import type { ImportEntry } from "./types";

// Explicitly opt in against the configured development DB. All records have an isolated account key,
// and cleanup targets only IDs created by this test. No provider credentials or live APIs are used.
test.skipIf(process.env.FINANCE_DB_TESTS !== "1")("atomic imports and posting withstand concurrent retries", async () => {
  const db = getDb(), scope = `qa:${crypto.randomUUID()}`;
  const entries: ImportEntry[] = [1, 2, 3].map((i) => ({ provider: "wise", accountKey: scope, externalId: `TEST-${i}`, occurredOn: `2001-01-0${i}`,
    kind: "payment", amount: -10 * i, currency: "PHP", description: scope, realizedPnl: null }));
  let categoryId: number | undefined;
  let ids: string[] = [];
  try {
    const [category] = await db.insert(categories).values({ name: scope, color: "#112233", kind: "expense" }).returning();
    categoryId = category.id;
    const results = await Promise.all([ingestEntries(entries), ingestEntries(entries)]);
    expect(results.reduce((n, r) => n + r.inserted, 0)).toBe(3);
    expect(results.reduce((n, r) => n + r.duplicates, 0)).toBe(3);
    let stored = await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope));
    ids = stored.map((r) => r.id);
    expect(stored).toHaveLength(3);
    await expect(ingestEntries([{ ...entries[0], amount: -999 }, { ...entries[0], externalId: "NEW" }])).rejects.toThrow("different amounts");
    expect(await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope))).toHaveLength(3);
    const first = stored.find((r) => r.externalId === "TEST-1")!;
    const attempts = await Promise.allSettled([postImportedEntry(first.id, categoryId), postImportedEntry(first.id, categoryId)]);
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(cashFlows).where(eq(cashFlows.id, first.id))).toHaveLength(1);
    await db.insert(categoryRules).values({ contains: scope, kind: "expense", categoryId, autoPost: true });
    const runs = await Promise.all([applyCategoryRules(ids), applyCategoryRules(ids)]);
    expect(runs.reduce((n, r) => n + r.posted, 0)).toBe(2);
    expect(await db.select().from(cashFlows).where(inArray(cashFlows.id, ids))).toHaveLength(3);
    await db.delete(cashFlows).where(eq(cashFlows.id, first.id));
    await ingestEntries(entries);
    expect((await applyCategoryRules(ids)).posted).toBe(0);
    stored = await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope));
    expect(stored.every((r) => r.status === "posted")).toBe(true);
    expect(await db.select().from(cashFlows).where(eq(cashFlows.id, first.id))).toHaveLength(0);
  } finally {
    const stored = await db.select({ id: importedEntries.id }).from(importedEntries).where(eq(importedEntries.accountKey, scope));
    ids = stored.map((r) => r.id);
    if (ids.length) await db.delete(cashFlows).where(inArray(cashFlows.id, ids));
    await db.delete(importedEntries).where(eq(importedEntries.accountKey, scope));
    if (categoryId != null) { await db.delete(categoryRules).where(eq(categoryRules.categoryId, categoryId)); await db.delete(categories).where(eq(categories.id, categoryId)); }
  }
}, 60_000);

test.skipIf(process.env.FINANCE_DB_TESTS !== "1")("Wise cash updates are atomic, idempotent and cannot replace newer or concurrently edited holdings", async () => {
  const db = getDb(), scope = `qa:${crypto.randomUUID()}`, holdingId = crypto.randomUUID();
  const entry: ImportEntry = { provider: "wise", accountKey: scope, externalId: "WISE-BALANCE-TEST", occurredOn: "2001-01-02",
    kind: "payment", amount: 10, currency: "XTS", description: scope, realizedPnl: null };
  const balance = { currency: "XTS", amount: 110, asOf: "2001-01-02" };
  const form = async (b = balance) => {
    const [preview] = await previewWiseBalances([b]);
    const target = preview.choices.find((c) => c.id === holdingId)!;
    const data = new FormData(); data.set("updateBalances", "on"); data.set("holding:XTS", holdingId); data.set("version:XTS", target.updatedAt);
    return data;
  };
  const savedHolding = async () => (await db.select().from(holdings).where(eq(holdings.id, holdingId)))[0];
  try {
    await db.insert(holdings).values({ id: holdingId, assetClass: "cash", name: scope, platform: "Wise", quantity: 100, avgCost: 1, currency: "XTS" });
    expect(await saveWiseImport([entry], [balance], await form())).toMatchObject({ inserted: 1, balances: 1 });
    expect(await savedHolding()).toMatchObject({ quantity: 110, statementAsOf: "2001-01-02", statementSource: "wise:personal" });
    expect(await saveWiseImport([entry], [balance], await form())).toMatchObject({ inserted: 0, duplicates: 1 });
    const old = { ...balance, asOf: "2001-01-01", amount: 100 };
    expect(await saveWiseImport([{ ...entry, externalId: "OLD" }], [old], await form(old))).toMatchObject({ inserted: 1, older: 1, balances: 0 });
    expect((await savedHolding()).quantity).toBe(110);
    const next = { ...balance, amount: 120, asOf: "2001-01-03" };
    await expect(saveWiseImport([{ ...entry, amount: 999 }], [next], await form(next))).rejects.toThrow("Nothing was imported");
    expect((await savedHolding()).quantity).toBe(110);
    const data = await form(next);
    await db.update(holdings).set({ notes: "Synthetic concurrent edit" }).where(eq(holdings.id, holdingId));
    await expect(saveWiseImport([{ ...entry, externalId: "STALE" }], [next], data)).rejects.toThrow("changed after preview");
    // Exercise the SQL guard itself: a concurrent change after server validation also rolls back the transaction insert.
    await expect(db.batch([db.execute(ingestQuery([{ ...entry, externalId: "ROLLBACK" }])), db.execute(wiseBalanceQuery([{ ...next, id: holdingId, version: String(data.get("version:XTS")) }]))])).rejects.toThrow();
    expect(await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope))).toHaveLength(2);
    expect((await savedHolding()).quantity).toBe(110);
    const attempts = await Promise.allSettled([saveWiseImport([{ ...entry, externalId: "NEXT" }], [next], await form(next)), saveWiseImport([{ ...entry, externalId: "NEXT" }], [next], await form(next))]);
    expect(attempts.some((r) => r.status === "fulfilled")).toBe(true);
    expect((await savedHolding()).quantity).toBe(120);
    expect(await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope))).toHaveLength(3);
  } finally {
    await db.delete(importedEntries).where(eq(importedEntries.accountKey, scope));
    await db.delete(holdings).where(eq(holdings.id, holdingId));
  }
}, 60_000);
