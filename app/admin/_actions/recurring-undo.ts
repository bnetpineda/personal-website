"use server";

import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { cashFlows, recurringCashFlows } from "@/lib/db/schema";
import { failure, idSchema, type FormState } from "@/lib/finance/schemas";

const daySchema = z.iso.date();

const undoSchema = z.object({
  /** Each item's next date as it was before the Skip or Post, to put back. */
  cursors: z.array(z.object({ id: idSchema, nextOn: daySchema.nullable() })).min(1).max(100),
  /** Occurrences a Post created entries for, to take back out. */
  posted: z.array(z.object({ id: idSchema, on: daySchema })).max(100).default([]),
});

/** How recent a posted entry must be for Undo to remove it: the toast's lifetime, with room to spare. */
const UNDO_WINDOW = sql`now() - interval '10 minutes'`;

/**
 * "Undo" for Skip, Post and Post all on recurring items that wait for confirmation. Removes the
 * entries the Post just created (only ones created in the last few minutes, so an entry the daily
 * cron posted earlier is never taken out) and moves each item's next date back to where it was, so
 * the occurrence shows in Needs confirming again. A cursor is only ever moved back, never forward.
 */
export async function undoRecurring(input: z.input<typeof undoSchema>): Promise<FormState> {
  await requireAdmin();
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) return failure("Couldn't undo that.");
  const { cursors, posted } = parsed.data;
  const db = getDb();

  const deletes = posted.map((o) =>
    db
      .delete(cashFlows)
      .where(and(eq(cashFlows.recurringId, o.id), eq(cashFlows.recurringOn, o.on), gte(cashFlows.createdAt, UNDO_WINDOW)))
      .returning({ id: cashFlows.id })
  );
  const rewinds = cursors
    .filter((c): c is { id: string; nextOn: string } => c.nextOn != null)
    .map((c) =>
      db
        .update(recurringCashFlows)
        .set({ nextOn: c.nextOn })
        .where(
          and(
            eq(recurringCashFlows.id, c.id),
            // Only back: a later change (an edit, the cron) that moved it elsewhere stays.
            or(isNull(recurringCashFlows.nextOn), gte(recurringCashFlows.nextOn, c.nextOn))
          )
        )
        .returning({ id: recurringCashFlows.id })
    );
  const queries = [...deletes, ...rewinds];
  if (queries.length === 0) return failure("Nothing to undo.");
  const [first, ...rest] = queries;
  await db.batch([first, ...rest]);
  revalidatePath("/admin", "layout");
  return { ok: true, message: posted.length ? "Undone: back in Needs confirming." : "Undone: no longer skipped." };
}

