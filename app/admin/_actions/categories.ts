"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { cashFlows, categories } from "@/lib/db/schema";
import { categorySchema, failure, invalid, type FormState } from "@/lib/finance/schemas";

/** Postgres error code from a (possibly Drizzle-wrapped) driver error. */
function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

export async function saveCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const rawId = formData.get("id");
  const id = typeof rawId === "string" && rawId ? Number(rawId) : null;
  if (id !== null && !(Number.isInteger(id) && id > 0)) return failure("Unknown category.", formData);

  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const input = parsed.data;
  const values = {
    kind: input.kind,
    name: input.name,
    color: input.color,
    // Budgets only make sense for spending.
    monthlyBudget: input.kind === "expense" ? (input.monthlyBudget ?? null) : null,
  };

  const db = getDb();
  try {
    if (id !== null) {
      const updated = await db
        .update(categories)
        .set({ name: values.name, color: values.color, monthlyBudget: values.monthlyBudget })
        .where(eq(categories.id, id))
        .returning({ id: categories.id });
      if (updated.length === 0) return failure("That category no longer exists.", formData);
    } else {
      await db.insert(categories).values({ ...values, sortOrder: 1000 });
    }
  } catch (err) {
    if (pgCode(err) === "23505") {
      return failure("That name is already used.", formData, { name: ["That name is already used"] });
    }
    throw err;
  }

  revalidatePath("/admin", "layout");
  return { ok: true, message: id !== null ? `Saved ${input.name}.` : `Added ${input.name}.` };
}

export async function setCategoryArchived(id: number, archived: boolean): Promise<FormState> {
  await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return failure("Unknown category.");
  await getDb().update(categories).set({ archived }).where(eq(categories.id, id));
  revalidatePath("/admin", "layout");
  return { ok: true, message: archived ? "Archived." : "Restored." };
}

export async function deleteCategory(id: number): Promise<FormState> {
  await requireAdmin();
  if (!Number.isInteger(id) || id <= 0) return failure("Unknown category.");

  const db = getDb();
  const [usage] = await db.select({ n: count() }).from(cashFlows).where(eq(cashFlows.categoryId, id));
  if (usage.n > 0) {
    return failure(`Used by ${usage.n} ${usage.n === 1 ? "entry" : "entries"} — archive it instead.`);
  }
  try {
    await db.delete(categories).where(eq(categories.id, id));
  } catch (err) {
    if (pgCode(err) === "23503") return failure("Still in use — archive it instead.");
    throw err;
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Deleted." };
}
