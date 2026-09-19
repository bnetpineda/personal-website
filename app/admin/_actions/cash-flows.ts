"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { cashFlows, categories } from "@/lib/db/schema";
import { fxToPhp, round2 } from "@/lib/finance/calc";
import { cashFlowSchema, failure, idSchema, invalid, type FormState } from "@/lib/finance/schemas";
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
    description: input.description,
    account: input.account ?? null,
    notes: input.notes ?? null,
  };

  if (existing) await db.update(cashFlows).set(values).where(eq(cashFlows.id, existing.id));
  else await db.insert(cashFlows).values(values);

  revalidatePath("/admin", "layout");
  return { ok: true, message: existing ? "Saved." : input.kind === "expense" ? "Expense added." : "Income added." };
}

export async function deleteCashFlow(id: string): Promise<FormState> {
  await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return failure("Unknown entry.");
  await getDb().delete(cashFlows).where(eq(cashFlows.id, parsed.data));
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Deleted." };
}
