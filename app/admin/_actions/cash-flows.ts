"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pgCode } from "@/lib/db/errors";
import { cashFlows, categories, liabilities, recurringCashFlows } from "@/lib/db/schema";
import { fxToPhp, round2 } from "@/lib/finance/calc";
import { addDays } from "@/lib/finance/dates";
import { nextOccurrence, scheduleOf } from "@/lib/finance/recurrence";
import {
  cashFlowSchema,
  failure,
  idSchema,
  invalid,
  restoreCashFlowSchema,
  type FormState,
  type RestoreCashFlowInput,
} from "@/lib/finance/schemas";
import { ensureFx } from "@/lib/finance/service";

export async function saveCashFlow(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? idSchema.safeParse(rawId) : null;
  if (id && !id.success) return failure("Unknown entry.", formData);

  const parsed = cashFlowSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  const db = getDb();

  const [category] = await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1);
  if (!category || category.kind !== input.kind) {
    return failure("Pick a category.", formData, { categoryId: ["Pick a category"] });
  }

  const [existing] = id ? await db.select().from(cashFlows).where(eq(cashFlows.id, id.data)).limit(1) : [];
  if (id && !existing) return failure("That entry no longer exists.", formData);
  // Archived categories can't take new entries, but existing ones may keep them.
  if (category.archived && existing?.categoryId !== category.id) {
    return failure("That category is archived.", formData, { categoryId: ["That category is archived"] });
  }

  // Posting a due occurrence of a recurring item that waits for confirmation.
  const [recurring] =
    !existing && input.recurringId && input.recurringOn
      ? await db.select().from(recurringCashFlows).where(eq(recurringCashFlows.id, input.recurringId)).limit(1)
      : [];
  if (input.recurringId && !existing && (!recurring || recurring.kind !== input.kind)) {
    return failure("That recurring item no longer exists.", formData);
  }

  let rate: number | null;
  try {
    rate = fxToPhp(await ensureFx([input.currency]), input.currency);
  } catch {
    rate = null;
  }
  if (rate == null) {
    return failure(`Couldn't get a ${input.currency}→PHP rate. Try again.`, formData, {
      currency: ["No FX rate available"],
    });
  }

  // Keep the original conversion unless the amount or currency changed.
  const amountPhp =
    existing && existing.amount === input.amount && existing.currency === input.currency
      ? existing.amountPhp
      : round2(input.amount * rate);

  const values = {
    kind: input.kind,
    occurredOn: input.occurredOn,
    amount: input.amount,
    currency: input.currency,
    amountPhp,
    categoryId: input.categoryId,
    description: input.description ?? category.name,
    account: input.account ?? null,
    notes: input.notes ?? null,
  };

  let createdId: string | undefined;
  if (existing) {
    await db.update(cashFlows).set(values).where(eq(cashFlows.id, existing.id));
  } else if (recurring && input.recurringOn) {
    const on = input.recurringOn;
    createdId = crypto.randomUUID();
    const insert = db.insert(cashFlows).values({ ...values, id: createdId, recurringId: recurring.id, recurringOn: on });
    try {
      if (recurring.nextOn && recurring.nextOn <= on) {
        await db.batch([
          insert,
          db
            .update(recurringCashFlows)
            .set({ nextOn: nextOccurrence(scheduleOf(recurring), addDays(on, 1)) })
            .where(and(eq(recurringCashFlows.id, recurring.id), eq(recurringCashFlows.nextOn, recurring.nextOn))),
        ]);
      } else {
        await insert;
      }
    } catch (err) {
      if (pgCode(err) === "23505") return failure("That one is already posted.", formData);
      throw err;
    }
  } else {
    createdId = crypto.randomUUID();
    await db.insert(cashFlows).values({ ...values, id: createdId });
  }

  revalidatePath("/admin", "layout");
  if (existing) return { ok: true, message: `Saved ${values.description}.` };
  return {
    ok: true,
    message: `${input.kind === "expense" ? "Expense" : "Income"} added · ${values.description}`,
    id: createdId,
  };
}

/** Deletes an entry and hands back what it was, so the client can offer "Undo". */
export async function deleteCashFlow(id: string): Promise<FormState & { deleted?: RestoreCashFlowInput }> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown entry.");
  const [row] = await getDb().delete(cashFlows).where(eq(cashFlows.id, parsed.data)).returning();
  revalidatePath("/admin", "layout");
  if (!row) return { ok: true, message: "Already deleted." };
  const deleted: RestoreCashFlowInput = {
    id: row.id,
    kind: row.kind,
    occurredOn: row.occurredOn,
    amount: row.amount,
    currency: row.currency,
    amountPhp: row.amountPhp,
    categoryId: row.categoryId,
    description: row.description,
    account: row.account,
    notes: row.notes,
    recurringId: row.recurringId,
    recurringOn: row.recurringOn,
    liabilityId: row.liabilityId,
  };
  return { ok: true, message: `Deleted ${row.description}.`, deleted };
}

/** "Undo" for deleteCashFlow: puts the entry back with its original id and PHP amount. */
export async function restoreCashFlow(row: RestoreCashFlowInput): Promise<FormState> {
  await requireAdmin();
  const parsed = restoreCashFlowSchema.safeParse(row);
  if (!parsed.success) return failure("Couldn't restore that entry.");
  const input = parsed.data;
  const db = getDb();

  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.categoryId)).limit(1);
  if (!category) return failure("Its category no longer exists.");
  // Links to things deleted since are dropped rather than failing the restore.
  const [recurring] = input.recurringId
    ? await db.select({ id: recurringCashFlows.id }).from(recurringCashFlows).where(eq(recurringCashFlows.id, input.recurringId)).limit(1)
    : [];
  const [liability] = input.liabilityId
    ? await db.select({ id: liabilities.id }).from(liabilities).where(eq(liabilities.id, input.liabilityId)).limit(1)
    : [];

  const inserted = await db
    .insert(cashFlows)
    .values({
      ...input,
      recurringId: recurring ? input.recurringId : null,
      recurringOn: recurring ? input.recurringOn : null,
      liabilityId: liability ? input.liabilityId : null,
    })
    .onConflictDoNothing()
    .returning({ id: cashFlows.id });
  revalidatePath("/admin", "layout");
  if (inserted.length === 0) return failure("It's already back.");
  return { ok: true, message: `Restored ${input.description}.` };
}
