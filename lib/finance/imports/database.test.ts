import { expect, mock, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
mock.module("server-only", () => ({}));
const { getDb } = await import("@/lib/db");
const { ingestEntries, postImportedEntry, applyCategoryRules } = await import("./service");
import { cashFlows, categories, categoryRules, importedEntries } from "@/lib/db/schema";
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
