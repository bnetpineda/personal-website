"use server";

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { cashFlows, recurringCashFlows } from "@/lib/db/schema";
import { scheduleOf, unmarkHandled } from "@/lib/finance/recurrence";
import { failure, idSchema, type FormState } from "@/lib/finance/schemas";
import { moveRecurringCursor } from "@/lib/finance/service";

const undoSchema = z.object({
  /** The occurrences the Skip or Post handled. */
  undone: z.array(z.object({ id: idSchema, on: z.iso.date() })).min(1).max(100),
  /** True when the action was a Post, so the entries it created come back out. */
  posted: z.boolean().default(false),
});

/** How recent a posted entry must be for Undo to remove it: the toast's lifetime, with room to spare. */
const UNDO_WINDOW = sql`now() - interval '10 minutes'`;

/**
 * "Undo" for Skip, Post and Post all on recurring items that wait for confirmation. Removes the
 * entries the Post just created (only ones created in the last few minutes, so an entry the daily
 * cron posted earlier is never taken out) and marks each occurrence unhandled again, so it shows in
 * Needs confirming. The cursor move is guarded: if something else moved it since, that item is left alone.
 */
export async function undoRecurring(input: z.input<typeof undoSchema>): Promise<FormState> {
  await requireAdmin();
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) return failure("Couldn't undo that.");
  const { undone, posted } = parsed.data;
  const db = getDb();

  const byItem = new Map<string, string[]>();
  for (const o of undone) byItem.set(o.id, [...(byItem.get(o.id) ?? []), o.on]);
  const rows = await db.select().from(recurringCashFlows).where(inArray(recurringCashFlows.id, [...byItem.keys()]));

  const deletes = posted
    ? undone.map((o) =>
        db
          .delete(cashFlows)
          .where(and(eq(cashFlows.recurringId, o.id), eq(cashFlows.recurringOn, o.on), gte(cashFlows.createdAt, UNDO_WINDOW)))
          .returning({ id: cashFlows.id })
      )
    : [];
  const rewinds = rows.map((r) => moveRecurringCursor(r, unmarkHandled(scheduleOf(r), r, byItem.get(r.id) ?? [])));
  const queries = [...deletes, ...rewinds];
  if (queries.length === 0) return failure("Nothing to undo.");
  const [first, ...rest] = queries;
  await db.batch([first, ...rest]);
  revalidatePath("/admin", "layout");
  return { ok: true, message: posted ? "Undone: back in Needs confirming." : "Undone: no longer skipped." };
}
