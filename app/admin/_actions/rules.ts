"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { categories, categoryRules } from "@/lib/db/schema";
import { providerSchema } from "@/lib/finance/connections/types";
import { failure, idSchema, invalid, type FormState } from "@/lib/finance/schemas";

const ruleSchema = z.object({
  id: z.preprocess((v) => (v === "" ? undefined : v), idSchema.optional()),
  contains: z.string().trim().min(2, { error: "Enter at least 2 characters" }).max(120, { error: "Keep it under 120 characters" }),
  provider: z.union([providerSchema, z.literal("any")], { error: "Choose an account" }),
  kind: z.enum(["income", "expense"], { error: "Choose income or spending" }),
  categoryId: z.coerce.number({ error: "Choose a category" }).int().positive({ error: "Choose a category" }),
});

/**
 * Adds a category rule, or changes one (with `id`). Every rule saved here posts automatically, so
 * editing an old suggest-only rule ("Left to AI") brings it in line. Errors come back per field.
 */
export async function saveRule(_previous: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = ruleSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return invalid(parsed.error, data, "Check the highlighted fields.");
  const { id, ...value } = parsed.data;
  const db = getDb();
  const [category] = await db.select().from(categories).where(eq(categories.id, value.categoryId));
  if (!category || category.archived || category.kind !== value.kind) {
    return failure("Choose an active category of the same type.", data, { categoryId: ["Choose an active category of the same type"] });
  }
  const row = { ...value, provider: value.provider === "any" ? null : value.provider, autoPost: true };
  if (id) {
    const [updated] = await db.update(categoryRules).set({ ...row, updatedAt: new Date() }).where(eq(categoryRules.id, id)).returning({ id: categoryRules.id });
    if (!updated) return failure("That rule no longer exists.", data);
  } else {
    await db.insert(categoryRules).values(row);
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: id ? "Rule saved." : "Rule saved. It runs before AI on the next import or sync." };
}

/** Removes a rule. Entries it already filed keep their category. */
export async function deleteRule(id: string): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown rule.");
  await getDb().delete(categoryRules).where(eq(categoryRules.id, parsed.data));
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Rule deleted. Entries it filed keep their category." };
}
