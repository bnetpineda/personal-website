"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pgCode } from "@/lib/db/errors";
import { cashFlows, categories, recurringCashFlows } from "@/lib/db/schema";
import { categorySchema, failure, invalid, type FormState } from "@/lib/finance/schemas";

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
  const [recurring] = await db.select({ n: count() }).from(recurringCashFlows).where(eq(recurringCashFlows.categoryId, id));
  if (recurring.n > 0) {
    return failure(`Used by ${recurring.n} recurring ${recurring.n === 1 ? "item" : "items"} — archive it instead.`);
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

/** All expense budgets in one form: fields named `budget:<categoryId>`; blank clears a budget. */
export async function updateBudgets(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();

  const updates: { id: number; budget: number | null }[] = [];
  const errors: Record<string, string[]> = {};
  for (const [key, value] of formData) {
    if (!key.startsWith("budget:") || typeof value !== "string") continue;
    const id = Number(key.slice("budget:".length));
    if (!Number.isInteger(id) || id <= 0) continue;
    if (value.trim() === "") {
      updates.push({ id, budget: null });
      continue;
    }
    const budget = Number(value.replace(/[,\s₱]/g, ""));
    if (!Number.isFinite(budget) || budget < 0 || budget > 999_999_999_999) errors[key] = ["Enter a valid amount"];
    else updates.push({ id, budget: budget === 0 ? null : budget });
  }
  if (Object.keys(errors).length > 0) return failure("Fix the highlighted budgets.", formData, errors);

  const db = getDb();
  const current = await db
    .select({ id: categories.id, monthlyBudget: categories.monthlyBudget })
    .from(categories)
    .where(eq(categories.kind, "expense"));
  const byId = new Map(current.map((c) => [c.id, c.monthlyBudget]));
  const changed = updates.filter((u) => byId.has(u.id) && byId.get(u.id) !== u.budget);
  if (changed.length === 0) return { ok: true, message: "No changes." };

  const [first, ...rest] = changed.map((u) =>
    db
      .update(categories)
      .set({ monthlyBudget: u.budget })
      .where(and(eq(categories.id, u.id), eq(categories.kind, "expense")))
  );
  await db.batch([first, ...rest]);
  revalidatePath("/admin", "layout");
  return { ok: true, message: changed.length === 1 ? "Updated 1 budget." : `Updated ${changed.length} budgets.` };
}
