import { expect, mock, test } from "bun:test";
import { and, eq, inArray, sql } from "drizzle-orm";
mock.module("server-only", () => ({}));
const { getDb } = await import("@/lib/db");
const { ingestEntries, applyCategoryRules, twinCtes } = await import("./service");
import { cashFlows, categories, categoryRules, importedEntries } from "@/lib/db/schema";
import type { ImportEntry } from "./types";

// Explicitly opt in against the configured development DB. All records have an isolated account key,
// and cleanup targets only IDs created by this test. No provider credentials or live APIs are used.
const dbTest = test.skipIf(process.env.FINANCE_DB_TESTS !== "1");

const entry = (scope: string, externalId: string, occurredOn: string, amount: number): ImportEntry =>
  ({ provider: "wise", accountKey: scope, externalId, occurredOn, kind: "payment", amount, currency: "PHP", description: scope, realizedPnl: null });

async function cleanup(scope: string, categoryId: number | undefined, extra: string[] = []) {
  const db = getDb();
  const stored = await db.select({ id: importedEntries.id }).from(importedEntries).where(eq(importedEntries.accountKey, scope));
  const ids = [...stored.map((r) => r.id), ...extra];
  await db.delete(importedEntries).where(eq(importedEntries.accountKey, scope));
  if (ids.length) await db.delete(cashFlows).where(inArray(cashFlows.id, ids));
  if (categoryId != null) {
    await db.delete(cashFlows).where(eq(cashFlows.categoryId, categoryId));
    await db.delete(categoryRules).where(eq(categoryRules.categoryId, categoryId));
    await db.delete(categories).where(eq(categories.id, categoryId));
  }
}

dbTest("atomic imports and rule posting withstand concurrent retries", async () => {
  const db = getDb(), scope = `qa:${crypto.randomUUID()}`;
  const entries = [1, 2, 3].map((i) => entry(scope, `TEST-${i}`, `2001-01-0${i}`, -10 * i));
  let categoryId: number | undefined;
  try {
    const [category] = await db.insert(categories).values({ name: scope, color: "#112233", kind: "expense" }).returning();
    categoryId = category.id;
    const results = await Promise.all([ingestEntries(entries), ingestEntries(entries)]);
    expect(results.reduce((n, r) => n + r.inserted, 0)).toBe(3);
    expect(results.reduce((n, r) => n + r.duplicates, 0)).toBe(3);
    let stored = await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope));
    const ids = stored.map((r) => r.id);
    expect(stored).toHaveLength(3);

    // An identical re-import writes nothing: the rows keep their version.
    const before = new Map(stored.map((r) => [r.id, r.updatedAt.getTime()]));
    const again = await ingestEntries(entries);
    expect(again).toEqual({ inserted: 0, duplicates: 3 });
    const xmin = await db.execute(sql`select id, xmin::text as v from imported_entries where account_key = ${scope}`);
    const after = await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope));
    expect(after.every((r) => before.get(r.id) === r.updatedAt.getTime())).toBe(true);
    const again2 = await ingestEntries(entries);
    expect(again2.duplicates).toBe(3);
    const xmin2 = await db.execute(sql`select id, xmin::text as v from imported_entries where account_key = ${scope}`);
    expect(xmin2.rows).toEqual(xmin.rows);

    await expect(ingestEntries([{ ...entries[0], amount: -999 }, { ...entries[0], externalId: "NEW" }])).rejects.toThrow("different amounts");
    expect(await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope))).toHaveLength(3);

    await db.insert(categoryRules).values({ contains: scope, kind: "expense", categoryId, autoPost: true });
    const runs = await Promise.all([applyCategoryRules(ids), applyCategoryRules(ids)]);
    expect(runs.reduce((n, r) => n + r.posted, 0)).toBe(3);
    expect(await db.select().from(cashFlows).where(inArray(cashFlows.id, ids))).toHaveLength(3);

    const first = stored.find((r) => r.externalId === "TEST-1")!;
    await db.delete(cashFlows).where(eq(cashFlows.id, first.id));
    await ingestEntries(entries);
    expect((await applyCategoryRules(ids)).posted).toBe(0);
    stored = await db.select().from(importedEntries).where(eq(importedEntries.accountKey, scope));
    expect(stored.every((r) => r.status === "posted")).toBe(true);
    expect(await db.select().from(cashFlows).where(eq(cashFlows.id, first.id))).toHaveLength(0);
  } finally {
    await cleanup(scope, categoryId);
  }
}, 60_000);

dbTest("one logged entry stands in for one import only", async () => {
  const db = getDb(), scope = `qa:${crypto.randomUUID()}`;
  let categoryId: number | undefined;
  const loggedId = crypto.randomUUID();
  try {
    const [category] = await db.insert(categories).values({ name: scope, color: "#112233", kind: "expense" }).returning();
    categoryId = category.id;
    // Logged by hand: "Lunch ₱500" on the day the bank shows two ₱500 card payments.
    await db.insert(cashFlows).values({ id: loggedId, kind: "expense", occurredOn: "2001-02-03", amount: 500, currency: "PHP", amountPhp: 500,
      categoryId, description: scope });
    await ingestEntries([entry(scope, "CARD-A", "2001-02-03", -500), entry(scope, "CARD-B", "2001-02-03", -500), entry(scope, "OTHER", "2001-02-03", -75)]);
    const ids = (await db.select({ id: importedEntries.id }).from(importedEntries).where(eq(importedEntries.accountKey, scope))).map((r) => r.id);

    const pairs = await db.execute(sql`with source as (select * from imported_entries where account_key = ${scope} and status = 'pending'), ${twinCtes}
      select i.external_id, t.twin_id from twins t join imported_entries i on i.id = t.id order by i.external_id`);
    const twinOf = Object.fromEntries(pairs.rows.map((r) => [r.external_id, r.twin_id]));
    expect(twinOf.OTHER).toBeNull();
    expect([twinOf["CARD-A"], twinOf["CARD-B"]].filter((id) => id === loggedId)).toHaveLength(1);
    expect([twinOf["CARD-A"], twinOf["CARD-B"]].filter((id) => id == null)).toHaveLength(1);

    // Rules post the second ₱500 payment and the other one; the twin waits for review.
    await db.insert(categoryRules).values({ contains: scope, kind: "expense", categoryId, autoPost: true });
    expect((await applyCategoryRules(ids)).posted).toBe(2);
    const waiting = await db.select().from(importedEntries).where(and(eq(importedEntries.accountKey, scope), eq(importedEntries.status, "pending")));
    expect(waiting).toHaveLength(1);

    // Once that import is matched to the logged entry, the logged entry can't hide another payment.
    await db.update(importedEntries).set({ status: "ignored", twinCashFlowId: loggedId }).where(eq(importedEntries.id, waiting[0].id));
    const claimAgain = async () => { await db.update(importedEntries).set({ twinCashFlowId: loggedId }).where(inArray(importedEntries.id, ids.filter((id) => id !== waiting[0].id))); };
    await expect(claimAgain()).rejects.toThrow();
    await ingestEntries([entry(scope, "CARD-C", "2001-02-03", -500)]);
    const [c] = await db.select().from(importedEntries).where(and(eq(importedEntries.accountKey, scope), eq(importedEntries.externalId, "CARD-C")));
    expect((await applyCategoryRules([c.id])).posted).toBe(1);

    // Deleting the logged entry frees the link instead of blocking the delete.
    await db.delete(cashFlows).where(eq(cashFlows.id, loggedId));
    const [unlinked] = await db.select().from(importedEntries).where(eq(importedEntries.id, waiting[0].id));
    expect(unlinked.twinCashFlowId).toBeNull();
  } finally {
    await cleanup(scope, categoryId, [loggedId]);
  }
}, 60_000);
