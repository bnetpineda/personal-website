"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { holdings, liabilities } from "@/lib/db/schema";
import { failure, idSchema, invalid, liabilitySchema, manualAccountSchema, type FormState } from "@/lib/finance/schemas";
import { ensureFx, snapshotQuietly } from "@/lib/finance/service";

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
