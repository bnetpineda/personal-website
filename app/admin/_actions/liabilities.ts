"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { cashFlows, categories, liabilities } from "@/lib/db/schema";
import { fxToPhp, round2 } from "@/lib/finance/calc";
import { failure, idSchema, invalid, liabilitySchema, paymentSchema, type FormState } from "@/lib/finance/schemas";
import { ensureFx, snapshotQuietly } from "@/lib/finance/service";

function done(message: string): FormState {
  after(snapshotQuietly);
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

export async function saveLiability(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? idSchema.safeParse(rawId) : null;
  if (id && !id.success) return failure("Unknown debt.", formData);

  const parsed = liabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;

  try {
    await ensureFx([input.currency]);
  } catch {
    // Non-fatal: counted in net worth once an FX refresh succeeds.
  }

  const values = {
    kind: input.kind,
    name: input.name,
    lender: input.lender ?? null,
    balance: input.balance,
    currency: input.currency,
    creditLimit: input.creditLimit ?? null,
    interestRate: input.interestRate ?? null,
    dueDay: input.dueDay ?? null,
    minPayment: input.minPayment ?? null,
    notes: input.notes ?? null,
  };

  const db = getDb();
  if (id) {
    const updated = await db
      .update(liabilities)
      .set(values)
      .where(eq(liabilities.id, id.data))
      .returning({ id: liabilities.id });
    if (updated.length === 0) return failure("That debt no longer exists.", formData);
  } else {
    await db.insert(liabilities).values(values);
  }
  return done(id ? `Saved ${input.name}.` : `Added ${input.name}.`);
}

export async function setLiabilityArchived(id: string, archived: boolean): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown debt.");
  await getDb().update(liabilities).set({ archived }).where(eq(liabilities.id, parsed.data));
  return done(archived ? "Archived." : "Restored.");
}

export async function deleteLiability(id: string): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown debt.");
  await getDb().delete(liabilities).where(eq(liabilities.id, parsed.data));
  return done("Deleted.");
}

export interface PaymentResult extends FormState {
  /** What "Undo" needs: the amount taken off the balance and the expense it logged, if any. */
  undo?: { liabilityId: string; reduced: number; entryId: string | null };
}

/** "Pay": takes the payment off the balance and, if asked, logs it as an expense linked to the debt. */
export async function payLiability(_prev: FormState, formData: FormData): Promise<PaymentResult> {
  await requireAdmin();

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return failure("Unknown debt.", formData);
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  const db = getDb();

  const [debt] = await db.select().from(liabilities).where(eq(liabilities.id, id.data)).limit(1);
  if (!debt) return failure("That debt no longer exists.", formData);

  const [category] = input.logExpense
    ? await db.select().from(categories).where(eq(categories.id, input.categoryId!)).limit(1)
    : [];
  if (input.logExpense && (!category || category.kind !== "expense" || category.archived)) {
    return failure("Pick a category.", formData, { categoryId: ["Pick a category"] });
  }

  let rate: number | null = 1;
  if (input.logExpense) {
    try {
      rate = fxToPhp(await ensureFx([debt.currency]), debt.currency);
    } catch {
      rate = null;
    }
    if (rate == null) return failure(`Couldn't get a ${debt.currency}→PHP rate. Try again.`, formData);
  }

  // Paying more than is owed just clears the balance.
  const reduced = Math.min(input.amount, debt.balance);
  const entryId = input.logExpense ? crypto.randomUUID() : null;
  const update = db
    .update(liabilities)
    .set({ balance: sql`greatest(${liabilities.balance} - ${reduced}, 0)` })
    .where(eq(liabilities.id, debt.id));
  if (entryId) {
    await db.batch([
      update,
      db.insert(cashFlows).values({
        id: entryId,
        kind: "expense",
        occurredOn: input.occurredOn,
        amount: input.amount,
        currency: debt.currency,
        amountPhp: round2(input.amount * rate!),
        categoryId: category!.id,
        description: `${debt.name} payment`,
        account: input.account ?? null,
        liabilityId: debt.id,
      }),
    ]);
  } else {
    await update;
  }

  // No amounts in the message: toasts aren't blurred by privacy mode.
  const result = done(
    debt.balance - reduced <= 0
      ? `Paid off ${debt.name}. Archive it to hide it.`
      : `Paid ${debt.name}${entryId ? " · logged as an expense" : ""}.`
  );
  return { ...result, undo: { liabilityId: debt.id, reduced, entryId } };
}

/** "Undo" for payLiability: restores the balance and removes the expense it logged. */
export async function undoPayment(undo: { liabilityId: string; reduced: number; entryId: string | null }): Promise<FormState> {
  await requireAdmin();
  const liabilityId = idSchema.safeParse(undo.liabilityId);
  const entryId = undo.entryId == null ? null : idSchema.safeParse(undo.entryId);
  if (!liabilityId.success || (entryId && !entryId.success) || !(Number.isFinite(undo.reduced) && undo.reduced >= 0)) {
    return failure("Couldn't undo that payment.");
  }
  const db = getDb();
  if (entryId?.success) {
    const removed = await db.delete(cashFlows).where(eq(cashFlows.id, entryId.data)).returning({ id: cashFlows.id });
    if (removed.length === 0) return done("That payment was already undone.");
  }
  await db.update(liabilities).set({ balance: sql`${liabilities.balance} + ${undo.reduced}` }).where(eq(liabilities.id, liabilityId.data));
  return done("Payment undone.");
}
