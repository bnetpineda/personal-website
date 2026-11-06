"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { failure, goalSchema, idSchema, invalid, type FormState } from "@/lib/finance/schemas";

function done(message: string): FormState {
  revalidatePath("/admin", "layout");
  return { ok: true, message };
}

export async function saveGoal(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const raw = formData.get("id");
  const id = typeof raw === "string" && raw ? idSchema.safeParse(raw) : null;
  if (id && !id.success) return failure("Unknown goal.", formData);
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  const values = {
    name: input.name,
    measure: input.measure,
    target: input.target,
    // Only a goal you track by hand keeps an amount saved; the others read live figures.
    saved: input.measure === "manual" ? (input.saved ?? 0) : null,
    targetOn: input.targetOn ?? null,
  };
  const db = getDb();
  if (id) {
    const updated = await db.update(goals).set(values).where(eq(goals.id, id.data)).returning({ id: goals.id });
    if (!updated.length) return failure("That goal no longer exists.", formData);
  } else {
    await db.insert(goals).values(values);
  }
  return done(id ? `Saved ${input.name}.` : `Added ${input.name}.`);
}

export async function setGoalArchived(id: string, archived: boolean): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown goal.");
  await getDb().update(goals).set({ archived }).where(eq(goals.id, parsed.data));
  return done(archived ? "Archived." : "Restored.");
}

export async function deleteGoal(id: string): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown goal.");
  await getDb().delete(goals).where(eq(goals.id, parsed.data));
  return done("Deleted.");
}
