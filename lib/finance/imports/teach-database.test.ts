import { expect, mock, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
mock.module("server-only", () => ({}));
const { getDb } = await import("@/lib/db");
const { teachPayeeNow, undoAutoTaught } = await import("./teach-service");
import { autoTaughtPayees, cashFlows, categories, categoryRules, importedEntries } from "@/lib/db/schema";

// Opt-in against the development DB. Every row uses its own account key, payee and category, and cleanup
// removes only those. No provider credentials or live APIs are used.
const dbTest = test.skipIf(process.env.FINANCE_DB_TESTS !== "1");

/** Letters only: payee keys drop digits, so a uuid would collide with other test payees. */
const letters = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => String.fromCharCode(97 + (b % 26))).join("");

dbTest("auto-sorting a payee moves its unsure entries, and Undo puts back everything still untouched", async () => {
  const db = getDb(), scope = `qa:${crypto.randomUUID()}`, payee = `Qashop ${letters()}`;
  let categoryId: number | undefined, otherCreated: number | undefined;
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  try {
    let [other] = await db.select().from(categories).where(and(eq(categories.name, "Other"), eq(categories.kind, "expense"), eq(categories.archived, false)));
    if (!other) { [other] = await db.insert(categories).values({ name: "Other", color: "#888888", kind: "expense" }).returning(); otherCreated = other.id; }
    const [target] = await db.insert(categories).values({ name: scope, color: "#112233", kind: "expense" }).returning();
    categoryId = target.id;
    const reason = `Jev: Other, closest ${scope} (70% likely)`;
    await db.insert(cashFlows).values(ids.map((id, i) => ({ id, kind: "expense" as const, occurredOn: `2001-02-0${i + 1}`, amount: 100 + i, currency: "PHP", amountPhp: 100 + i,
      categoryId: other.id, description: `Card payment: ${payee}`, notes: "Categorized by AI: unsure" })));
    await db.insert(importedEntries).values(ids.map((id, i) => ({ id, provider: "wise" as const, accountKey: scope, externalId: `T-${i}`, occurredOn: `2001-02-0${i + 1}`,
      kind: "payment" as const, amount: -(100 + i), currency: "PHP", description: `Card payment: ${payee}`, status: "posted" as const,
      categoryId: other.id, categorizedBy: "ai" as const, aiReason: reason })));

    const taught = await teachPayeeNow(payee, "expense", target.id, { auto: true });
    expect(taught).toMatchObject({ ok: true, moved: 3 });
    const [record] = await db.select().from(autoTaughtPayees).where(eq(autoTaughtPayees.payee, payee));
    expect(record.entriesBefore).toHaveLength(3);
    expect(record.ruleBefore).toBeNull();
    const [rule] = await db.select().from(categoryRules).where(eq(categoryRules.id, record.ruleId!));
    expect(rule).toMatchObject({ categoryId: target.id, autoPost: true, contains: payee });
    const moved = await db.select({ categoryId: cashFlows.categoryId, notes: cashFlows.notes }).from(cashFlows).where(inArray(cashFlows.id, ids));
    expect(moved.every((f) => f.categoryId === target.id && f.notes?.startsWith("Sorted automatically"))).toBe(true);

    // The person re-files one entry by hand before undoing: that one stays as they left it.
    await db.update(importedEntries).set({ categorizedBy: "manual" }).where(eq(importedEntries.id, ids[2]));

    expect(await undoAutoTaught(record.id)).toMatchObject({ ok: true });
    const back = await db.select({ id: importedEntries.id, categorizedBy: importedEntries.categorizedBy, aiReason: importedEntries.aiReason, flowCategory: cashFlows.categoryId, notes: cashFlows.notes })
      .from(importedEntries).innerJoin(cashFlows, eq(cashFlows.id, importedEntries.id)).where(inArray(importedEntries.id, ids));
    const byId = new Map(back.map((r) => [r.id, r]));
    for (const id of ids.slice(0, 2)) expect(byId.get(id)).toMatchObject({ categorizedBy: "ai", aiReason: reason, flowCategory: other.id, notes: "Categorized by AI: unsure" });
    expect(byId.get(ids[2])).toMatchObject({ categorizedBy: "manual", flowCategory: target.id });
    expect(await db.select().from(categoryRules).where(eq(categoryRules.id, record.ruleId!))).toHaveLength(0);
    expect(await undoAutoTaught(record.id)).toMatchObject({ ok: false });
  } finally {
    await db.delete(autoTaughtPayees).where(eq(autoTaughtPayees.payee, payee));
    await db.delete(importedEntries).where(eq(importedEntries.accountKey, scope));
    await db.delete(cashFlows).where(inArray(cashFlows.id, ids));
    if (categoryId != null) {
      await db.delete(categoryRules).where(eq(categoryRules.categoryId, categoryId));
      await db.delete(categories).where(eq(categories.id, categoryId));
    }
    if (otherCreated != null) await db.delete(categories).where(eq(categories.id, otherCreated));
  }
});
