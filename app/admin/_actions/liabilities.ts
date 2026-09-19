"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { liabilities } from "@/lib/db/schema";
import { failure, idSchema, invalid, liabilitySchema, type FormState } from "@/lib/finance/schemas";
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
