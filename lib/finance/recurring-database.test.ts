import { expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
mock.module("server-only", () => ({}));
const { getDb } = await import("@/lib/db");
const { moveRecurringCursor, postDueRecurring } = await import("./service");
import { cashFlows, categories, recurringCashFlows } from "@/lib/db/schema";

// Opt-in against the development DB only. Items are dated 2001 with an isolated description, and the
// "today" passed in keeps real items (dated now) out of the run. Cleanup removes only what this test made.
const dbTest = test.skipIf(process.env.FINANCE_DB_TESTS !== "1");

dbTest("postDueRecurring posts each occurrence once, advances the cursor and retries items without a rate", async () => {
  const db = getDb(), scope = `qa:${crypto.randomUUID()}`;
  let categoryId: number | undefined;
  try {
    const [category] = await db.insert(categories).values({ name: scope, color: "#112233", kind: "expense" }).returning();
    categoryId = category.id;
    const base = { kind: "expense" as const, amount: 100, categoryId, description: scope, frequency: "monthly" as const, autoPost: true };
    const [rent] = await db.insert(recurringCashFlows).values({ ...base, currency: "PHP", startOn: "2001-01-31", nextOn: "2001-01-31" }).returning();
    // No provider publishes a ZZZ rate: the item must wait, not lose its occurrences.
    const [odd] = await db.insert(recurringCashFlows).values({ ...base, currency: "ZZZ", startOn: "2001-01-15", nextOn: "2001-01-15" }).returning();

    const runs = await Promise.all([postDueRecurring("2001-03-31"), postDueRecurring("2001-03-31")]);
    expect(runs.reduce((n, r) => n + r.posted, 0)).toBe(3);
    expect(runs.some((r) => r.failed.some((f) => f.name === scope))).toBe(true);

    const posted = await db.select().from(cashFlows).where(eq(cashFlows.recurringId, rent.id));
    expect(posted.map((p) => p.occurredOn).sort()).toEqual(["2001-01-31", "2001-02-28", "2001-03-31"]);
    expect(posted.every((p) => p.amountPhp === 100)).toBe(true);
    const [rentAfter] = await db.select().from(recurringCashFlows).where(eq(recurringCashFlows.id, rent.id));
    expect(rentAfter.nextOn).toBe("2001-04-30");
    const [oddAfter] = await db.select().from(recurringCashFlows).where(eq(recurringCashFlows.id, odd.id));
    expect(oddAfter.nextOn).toBe("2001-01-15");
    expect(await db.select().from(cashFlows).where(eq(cashFlows.recurringId, odd.id))).toHaveLength(0);

    // Running again posts nothing new.
    expect((await postDueRecurring("2001-03-31")).posted).toBe(0);

    // A cursor move based on a stale read changes nothing.
    await moveRecurringCursor({ id: rent.id, nextOn: "2001-04-30", handledOn: ["2001-06-30"] }, { nextOn: "2001-05-31", handledOn: [] });
    const [unchanged] = await db.select().from(recurringCashFlows).where(eq(recurringCashFlows.id, rent.id));
    expect(unchanged.nextOn).toBe("2001-04-30");
    await moveRecurringCursor({ id: rent.id, nextOn: "2001-04-30", handledOn: [] }, { nextOn: "2001-04-30", handledOn: ["2001-06-30"] });
    const [moved] = await db.select().from(recurringCashFlows).where(eq(recurringCashFlows.id, rent.id));
    expect(moved.handledOn).toEqual(["2001-06-30"]);
  } finally {
    if (categoryId != null) {
      await db.delete(cashFlows).where(eq(cashFlows.categoryId, categoryId));
      await db.delete(recurringCashFlows).where(eq(recurringCashFlows.categoryId, categoryId));
      await db.delete(categories).where(eq(categories.id, categoryId));
    }
  }
}, 60_000);
