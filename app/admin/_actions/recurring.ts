"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { cashFlows, categories, recurringCashFlows } from "@/lib/db/schema";
import { fxToPhp, round2 } from "@/lib/finance/calc";
import { addDays, todayManila } from "@/lib/finance/dates";
import { nextOccurrence, scheduleOf } from "@/lib/finance/recurrence";
import { failure, idSchema, invalid, recurringSchema, type FormState } from "@/lib/finance/schemas";
import { ensureFx, postDueRecurring } from "@/lib/finance/service";

const daySchema = z.iso.date();

/** Posts anything the change made due (e.g. a start date in the past) and describes it. */
async function postNow(message: string): Promise<string> {
  const { posted } = await postDueRecurring();
  return posted > 0 ? `${message} Posted ${posted} ${posted === 1 ? "entry" : "entries"} so far.` : message;
}

export async function saveRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? idSchema.safeParse(rawId) : null;
  if (id && !id.success) return failure("Unknown item.", formData);

  const parsed = recurringSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  const db = getDb();

  const [category] = await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
  if (!category || category.kind !== input.kind) {
    return failure("Pick a category.", formData, { categoryId: ["Pick a category"] });
  }

  const [existing] = id ? await db.select().from(recurringCashFlows).where(eq(recurringCashFlows.id, id.data)).limit(1) : [];
  if (id && !existing) return failure("That item no longer exists.", formData);
  if (category.archived && existing?.categoryId !== category.id) {
    return failure("That category is archived.", formData, { categoryId: ["That category is archived"] });
  }

  const today = todayManila();
  const schedule = scheduleOf(input);
  const scheduleChanged =
    !existing ||
    existing.frequency !== input.frequency ||
    existing.startOn !== input.startOn ||
    existing.endOn !== input.endOn ||
    existing.secondDay !== input.secondDay;
  // New items start at their first date, so a past start fills in the entries since then.
  // Edits only reschedule what's still ahead; past entries are left as they are.
  const nextOn = !existing
    ? nextOccurrence(schedule, input.startOn)
    : scheduleChanged
      ? nextOccurrence(schedule, input.startOn > today ? input.startOn : today)
      : existing.nextOn;

  const values = {
    kind: input.kind,
    amount: input.amount,
    currency: input.currency,
    categoryId: input.categoryId,
    description: input.description,
    account: input.account ?? null,
    notes: input.notes ?? null,
    frequency: input.frequency,
    startOn: input.startOn,
    secondDay: input.secondDay,
    endOn: input.endOn,
    nextOn,
    autoPost: input.autoPost,
  };

  if (existing) await db.update(recurringCashFlows).set(values).where(eq(recurringCashFlows.id, existing.id));
  else await db.insert(recurringCashFlows).values(values);

  const message = await postNow(existing ? "Saved." : `Added ${input.description}.`);
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

export async function setRecurringPaused(id: string, paused: boolean): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown item.");
  const db = getDb();
  const [row] = await db.select().from(recurringCashFlows).where(eq(recurringCashFlows.id, parsed.data)).limit(1);
  if (!row) return failure("That item no longer exists.");

  const today = todayManila();
  // Resuming skips whatever fell due while paused.
  const set = paused ? { paused } : { paused, nextOn: nextOccurrence(scheduleOf(row), row.startOn > today ? row.startOn : today) };
  await db.update(recurringCashFlows).set(set).where(eq(recurringCashFlows.id, row.id));

  const message = paused ? "Paused." : await postNow("Resumed.");
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

/** Skips one due occurrence of an item that waits for confirmation. */
export async function skipRecurring(id: string, on: string): Promise<FormState> {
  await requireAdmin();
  const parsedId = idSchema.safeParse(id);
  const parsedOn = daySchema.safeParse(on);
  if (!parsedId.success || !parsedOn.success) return failure("Unknown item.");
  const db = getDb();
  const [row] = await db.select().from(recurringCashFlows).where(eq(recurringCashFlows.id, parsedId.data)).limit(1);
  if (!row) return failure("That item no longer exists.");

  if (row.nextOn && row.nextOn <= parsedOn.data) {
    await db
      .update(recurringCashFlows)
      .set({ nextOn: nextOccurrence(scheduleOf(row), addDays(parsedOn.data, 1)) })
      .where(and(eq(recurringCashFlows.id, row.id), eq(recurringCashFlows.nextOn, row.nextOn)));
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Skipped." };
}

export async function deleteRecurring(id: string): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown item.");
  // Entries already posted stay; their recurring_id becomes null.
  await getDb().delete(recurringCashFlows).where(eq(recurringCashFlows.id, parsed.data));
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Deleted." };
}

const occurrenceSchema = z.array(z.object({ id: idSchema, on: daySchema })).min(1).max(100);

/**
 * One-tap "Post" (and "Post all") for due items that wait for confirmation: posts each
 * occurrence at the item's saved amount and moves its cursor past the latest one posted.
 */
export async function postRecurring(occurrences: { id: string; on: string }[]): Promise<FormState> {
  await requireAdmin();
  const parsed = occurrenceSchema.safeParse(occurrences);
  if (!parsed.success) return failure("Unknown item.");
  const db = getDb();

  const ids = [...new Set(parsed.data.map((o) => o.id))];
  const rows = await db.select().from(recurringCashFlows).where(inArray(recurringCashFlows.id, ids));
  if (rows.length === 0) return failure("Those items no longer exist.");

  let fx: Awaited<ReturnType<typeof ensureFx>> = {};
  try {
    fx = await ensureFx([...new Set(rows.map((r) => r.currency))]);
  } catch {
    // Non-PHP items are reported below.
  }

  const entries: (typeof cashFlows.$inferInsert)[] = [];
  const cursors = [];
  const skipped: string[] = [];
  for (const r of rows) {
    const rate = fxToPhp(fx, r.currency);
    if (rate == null) {
      skipped.push(r.description);
      continue;
    }
    const days = parsed.data.filter((o) => o.id === r.id).map((o) => o.on).sort();
    for (const on of days) {
      entries.push({
        kind: r.kind,
        occurredOn: on,
        amount: r.amount,
        currency: r.currency,
        amountPhp: round2(r.amount * rate),
        categoryId: r.categoryId,
        description: r.description,
        account: r.account,
        notes: r.notes,
        recurringId: r.id,
        recurringOn: on,
      });
    }
    const last = days[days.length - 1];
    if (r.nextOn && r.nextOn <= last) {
      cursors.push(
        db
          .update(recurringCashFlows)
          .set({ nextOn: nextOccurrence(scheduleOf(r), addDays(last, 1)) })
          .where(and(eq(recurringCashFlows.id, r.id), eq(recurringCashFlows.nextOn, r.nextOn)))
      );
    }
  }
  if (entries.length === 0) return failure(`No FX rate for ${skipped.join(", ")} yet — try again.`);

  // Duplicates (already posted by the cron or another tab) are skipped by the unique index.
  const insert = db.insert(cashFlows).values(entries).onConflictDoNothing().returning({ id: cashFlows.id });
  const [inserted] = await db.batch([insert, ...cursors]);
  revalidatePath("/admin", "layout");

  const posted = inserted.length;
  const message =
    posted === 0 ? "Already posted." : posted === 1 ? `Posted ${entries[0].description}.` : `Posted ${posted} entries.`;
  return { ok: true, message: skipped.length ? `${message} Skipped ${skipped.join(", ")} (no FX rate).` : message };
}
