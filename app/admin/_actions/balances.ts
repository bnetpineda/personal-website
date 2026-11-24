"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { cashFlows, categories, holdings, liabilities } from "@/lib/db/schema";
import { round2 } from "@/lib/finance/calc";
import { debtPaymentSchema, failure, idSchema, invalid, liabilitySchema, manualAccountSchema, type FormState } from "@/lib/finance/schemas";
import { ensureFx, phpRatesOn, snapshotQuietly } from "@/lib/finance/service";

/*
 * Manual accounts (holdings no account syncs) and debts. Both count in net worth unless archived, so
 * every change re-records today's net-worth point. Toasts name the account, never its amount.
 */

function done(message: string): FormState {
  after(snapshotQuietly);
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

function editedId(formData: FormData) {
  const raw = formData.get("id");
  return typeof raw === "string" && raw ? idSchema.safeParse(raw) : null;
}

async function warmFx(currency: string) {
  try {
    await ensureFx([currency]);
  } catch {
    // Non-fatal: it counts in net worth once an exchange-rate refresh succeeds.
  }
}

/** A manual account is one unit worth its value; the value is also its cost, so it shows no made-up P/L. */
export async function saveManualAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = editedId(formData);
  if (id && !id.success) return failure("Unknown account.", formData);
  const parsed = manualAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  await warmFx(input.currency);

  const values = {
    name: input.name,
    assetClass: input.assetClass,
    platform: input.platform ?? null,
    notes: input.notes ?? null,
    currency: input.currency,
    quantity: 1,
    avgCost: input.value,
    lastPrice: input.value,
    priceSource: "manual" as const,
    priceRef: null,
    priceUpdatedAt: new Date(),
    // Updating an archived account's value brings it back into net worth.
    archived: false,
  };
  const db = getDb();
  if (id) {
    const updated = await db.update(holdings).set(values).where(eq(holdings.id, id.data)).returning({ id: holdings.id });
    if (!updated.length) return failure("That account no longer exists.", formData);
  } else {
    await db.insert(holdings).values(values);
  }
  return done(id ? `Saved ${input.name}.` : `Added ${input.name}. It counts in net worth.`);
}

export async function setManualAccountArchived(id: string, archived: boolean): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown account.");
  await getDb().update(holdings).set({ archived }).where(eq(holdings.id, parsed.data));
  return done(archived ? "Archived: left out of net worth." : "Restored: counts in net worth again.");
}

export async function deleteManualAccount(id: string): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown account.");
  await getDb().delete(holdings).where(eq(holdings.id, parsed.data));
  return done("Deleted.");
}

export async function saveDebt(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = editedId(formData);
  if (id && !id.success) return failure("Unknown debt.", formData);
  const parsed = liabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  await warmFx(input.currency);

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
    archived: false,
  };
  const db = getDb();
  if (id) {
    const updated = await db.update(liabilities).set(values).where(eq(liabilities.id, id.data)).returning({ id: liabilities.id });
    if (!updated.length) return failure("That debt no longer exists.", formData);
  } else {
    await db.insert(liabilities).values(values);
  }
  return done(id ? `Saved ${input.name}.` : `Added ${input.name}. It comes off net worth.`);
}

export async function setDebtArchived(id: string, archived: boolean): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown debt.");
  await getDb().update(liabilities).set({ archived }).where(eq(liabilities.id, parsed.data));
  return done(archived ? "Archived: left out of net worth." : "Restored: comes off net worth again.");
}

export async function deleteDebt(id: string): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown debt.");
  await getDb().delete(liabilities).where(eq(liabilities.id, parsed.data));
  return done("Deleted.");
}

export interface DebtPaymentResult extends FormState {
  /** What "Undo" needs: the amount taken off the balance and the expense it logged, if any. */
  undo?: { liabilityId: string; reduced: number; entryId: string | null };
}

/** "Pay": takes the payment off the balance and, unless unticked, logs it as an expense linked to the debt. */
export async function payDebt(_prev: DebtPaymentResult, formData: FormData): Promise<DebtPaymentResult> {
  await requireAdmin();
  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return failure("Unknown debt.", formData);
  const parsed = debtPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  const db = getDb();

  const [debt] = await db.select().from(liabilities).where(eq(liabilities.id, id.data)).limit(1);
  if (!debt) return failure("That debt no longer exists.", formData);
  const [category] = input.logExpense && input.categoryId ? await db.select().from(categories).where(eq(categories.id, input.categoryId)).limit(1) : [];
  if (input.logExpense && (!category || category.kind !== "expense" || category.archived)) {
    return failure("Pick a spending category.", formData, { categoryId: ["Pick a spending category"] });
  }
  let rate: number | null = null;
  if (input.logExpense) {
    try {
      rate = (await phpRatesOn([{ currency: debt.currency, on: input.occurredOn }]))(debt.currency, input.occurredOn);
    } catch {
      rate = null;
    }
    if (rate == null) return failure(`Couldn't get a ${debt.currency}→PHP rate. Try again.`, formData);
  }

  // Paying more than is owed clears the balance; the expense still records what was paid.
  const reduced = Math.min(input.amount, debt.balance);
  const entryId = input.logExpense ? crypto.randomUUID() : null;
  const update = db.update(liabilities).set({ balance: sql`greatest(${liabilities.balance} - ${reduced}, 0)` }).where(eq(liabilities.id, debt.id));
  if (entryId) {
    await db.batch([update, db.insert(cashFlows).values({
      id: entryId, kind: "expense", occurredOn: input.occurredOn, amount: input.amount, currency: debt.currency,
      amountPhp: round2(input.amount * rate!), categoryId: category!.id, description: `${debt.name} payment`,
      account: input.account ?? null, liabilityId: debt.id,
    })]);
  } else {
    await update;
  }
  // No amounts in the message: toasts aren't blurred by privacy mode.
  const result = done(debt.balance - reduced <= 0.005 ? `Paid off ${debt.name}. Archive it to hide it.` : `Paid ${debt.name}${entryId ? " · logged as spending" : ""}.`);
  return { ...result, undo: { liabilityId: debt.id, reduced, entryId } };
}

/** "Undo" for payDebt: puts the balance back and removes the expense it logged. Running it twice changes nothing. */
export async function undoDebtPayment(undo: { liabilityId: string; reduced: number; entryId: string | null }): Promise<FormState> {
  await requireAdmin();
  const liabilityId = idSchema.safeParse(undo?.liabilityId);
  const entryId = undo?.entryId == null ? null : idSchema.safeParse(undo.entryId);
  if (!liabilityId.success || (entryId && !entryId.success) || !(Number.isFinite(undo.reduced) && undo.reduced >= 0 && undo.reduced < 1e12)) {
    return failure("Couldn't undo that payment.");
  }
  const db = getDb();
  if (entryId?.success) {
    // One statement: the balance comes back only if this call removed the logged expense.
    const restored = await db.execute(sql`
      with removed as (delete from ${cashFlows} where ${cashFlows.id} = ${entryId.data} and ${cashFlows.liabilityId} = ${liabilityId.data} returning id)
      update ${liabilities} set balance = balance + ${undo.reduced}, updated_at = now()
      where ${liabilities.id} = ${liabilityId.data} and exists (select 1 from removed) returning id`);
    return done(restored.rows.length ? "Payment undone." : "That payment was already undone.");
  }
  await db.update(liabilities).set({ balance: sql`${liabilities.balance} + ${undo.reduced}` }).where(eq(liabilities.id, liabilityId.data));
  return done("Payment undone.");
}
