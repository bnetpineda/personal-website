"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { categories, categoryRules, importedEntries } from "@/lib/db/schema";
import { providerSchema } from "@/lib/finance/connections/types";
import { transferEligible } from "@/lib/finance/imports/review";
import { applyCategoryRules, postImportedEntry } from "@/lib/finance/imports/service";
import { categorizeQuietly, categorizeWithAi } from "@/lib/finance/imports/ai-service";
import { ImportError, sameSource, sourceKey, type ImportEntry } from "@/lib/finance/imports/types";
import { parseWiseStatement } from "@/lib/finance/imports/wise-csv";
import { previewWiseBalances, saveWiseImport, type WiseBalancePreview } from "@/lib/finance/imports/wise-balances";
import { snapshotQuietly } from "@/lib/finance/service";
import { idSchema, type FormState } from "@/lib/finance/schemas";

function message(error: unknown): FormState {
  return { ok: false, message: error instanceof ImportError ? error.message : "The import could not be saved. Check the statement format and try again." };
}
async function csvEntries(data: FormData) {
  const file = data.get("file");
  const mode = z.enum(["included", "separate"]).safeParse(data.get("feeMode"));
  if (!mode.success) throw new ImportError("Choose how fees appear in this statement.");
  if (!(file instanceof File) || file.size === 0 || file.size > 750_000) throw new ImportError("Choose a Wise CSV file smaller than 750 KB.");
  return parseWiseStatement(await file.text(), mode.data);
}
export interface ImportPreview extends FormState { entries?: ImportEntry[]; total?: number; duplicates?: number; conflicts?: number; balances?: WiseBalancePreview[]; balanceWarning?: string }
export async function previewWiseImport(data: FormData): Promise<ImportPreview> {
  await requireAdmin();
  try {
    const { entries, balances, balanceWarning } = await csvEntries(data);
    if (!entries.length && !balances.length) throw new ImportError("The statement has no transactions or closing balances.");
    const existing = entries.length ? await getDb().select().from(importedEntries).where(and(eq(importedEntries.provider, "wise"), inArray(importedEntries.externalId, entries.map((r) => r.externalId)))) : [];
    const byKey = new Map(existing.map((r) => [sourceKey(r), r]));
    const duplicates = entries.filter((e) => byKey.has(sourceKey(e))).length;
    const conflicts = entries.filter((e) => { const old = byKey.get(sourceKey(e)); return old && !sameSource(e, old); }).length;
    return { ok: true, entries: entries.slice(0, 10), total: entries.length, duplicates, conflicts, balances: await previewWiseBalances(balances), balanceWarning };
  } catch (error) { return message(error); }
}
export async function importWiseStatement(data: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const { entries, balances } = await csvEntries(data);
    const result = await saveWiseImport(entries, balances, data);
    await applyCategoryRules();
    after(categorizeQuietly);
    if (result.balances) after(snapshotQuietly);
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Imported ${result.inserted} new entries; skipped ${result.duplicates} duplicates. Updated ${result.balances} Wise balances.${result.older ? ` Kept ${result.older} newer saved balances.` : ""}` };
  } catch (error) { return message(error); }
}

export async function reviewImportedEntry(_previous: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({ id: idSchema, decision: z.enum(["post", "reviewed", "ignored", "transfer"]),
    categoryId: z.coerce.number().int().nonnegative().optional(), allowDuplicate: z.string().optional() }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Choose how to review this entry." };
  const { id, decision, categoryId, allowDuplicate } = parsed.data;
  try {
    if (decision === "post") {
      if (!categoryId) throw new ImportError("Choose a category.");
      await postImportedEntry(id, categoryId, allowDuplicate === "on");
    } else {
      const changed = await getDb().update(importedEntries).set({ status: decision, categorizedBy: "manual", aiReason: null, aiSuggestion: null }).where(and(eq(importedEntries.id, id), eq(importedEntries.status, "pending"),
        decision === "transfer" ? inArray(importedEntries.kind, ["payment", "transfer", "other"]) : undefined)).returning({ id: importedEntries.id });
      if (!changed.length) throw new ImportError("This entry is already reviewed, or cannot be treated as a transfer.");
    }
    revalidatePath("/admin", "layout");
    return { ok: true, message: decision === "post" ? "Entry added to Transactions." : "Review saved." };
  } catch (error) { return message(error); }
}

export async function reopenImportedEntry(id: string): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Unknown entry." };
  // Posted entries are managed in Transactions. Never recreate a deleted posted entry on re-import.
  const result = await getDb().execute(sql`with selected as materialized (
    select id, transfer_id from imported_entries where id = ${id}::uuid and status in ('ignored','reviewed','transfer') for update
  ) update imported_entries set status = 'pending', transfer_id = null, categorized_by = null, ai_reason = null, ai_suggestion = null, updated_at = now()
    where id in (select id from selected) or transfer_id in (select transfer_id from selected where transfer_id is not null) returning id`);
  revalidatePath("/admin", "layout");
  return { ok: result.rows.length > 0, message: result.rows.length ? "Returned to the inbox. Any linked transfer was also reopened." : "Posted entries are managed in Transactions." };
}

export async function matchImportedTransfer(_previous: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({ first: idSchema, second: idSchema }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Choose both sides of the transfer." };
  const { first, second } = parsed.data;
  const db = getDb();
  const entries = await db.select().from(importedEntries).where(inArray(importedEntries.id, [first, second]));
  if (entries.length !== 2 || !transferEligible(entries[0], entries[1])) return { ok: false, message: "Choose opposite movements in different accounts or currencies, within seven days, that are still awaiting review." };
  const transferId = crypto.randomUUID();
  const result = await db.execute(sql`with candidates as materialized (
    select id, status from imported_entries where id in (${first}::uuid, ${second}::uuid) order by id for update
  ) update imported_entries set status = 'transfer', transfer_id = ${transferId}::uuid, category_id = null, categorized_by = 'manual', ai_reason = null, ai_suggestion = null, updated_at = now()
    where id in (select id from candidates) and (select count(*) from candidates where status = 'pending') = 2 returning id`);
  revalidatePath("/admin", "layout");
  return { ok: result.rows.length === 2, message: result.rows.length === 2 ? "Transfer linked. Both principal movements are excluded from income and expenses; fees remain separate." : "An entry changed during review. Refresh and try again." };
}

export async function saveCategoryRule(_previous: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({ contains: z.string().trim().min(2).max(120), provider: z.union([providerSchema, z.literal("any")]),
    kind: z.enum(["income", "expense"]), categoryId: z.coerce.number().int().positive(), autoPost: z.string().optional() }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Enter matching text and choose a category of the same type." };
  const value = parsed.data;
  const [category] = await getDb().select().from(categories).where(eq(categories.id, value.categoryId));
  if (!category || category.archived || category.kind !== value.kind) return { ok: false, message: "Choose an active category matching income or expense." };
  await getDb().insert(categoryRules).values({ ...value, provider: value.provider === "any" ? null : value.provider, autoPost: value.autoPost === "on" });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Rule saved. It will run on the next import or sync; use Apply rules for existing entries." };
}
export async function setRuleEnabled(id: string, enabled: boolean): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof enabled !== "boolean") return { ok: false, message: "Invalid rule." };
  await getDb().update(categoryRules).set({ enabled }).where(eq(categoryRules.id, id));
  revalidatePath("/admin", "layout");
  return { ok: true, message: enabled ? "Rule resumed." : "Rule paused." };
}
export async function runCategoryRules(): Promise<FormState> {
  await requireAdmin();
  try {
    const result = await applyCategoryRules();
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Rules applied: ${result.posted} posted, ${result.suggested} suggested. Uncertain matches remain in the inbox.` };
  } catch { return { ok: false, message: "Rules could not finish. Completed entries are saved; retry safely." }; }
}
export async function runAiCategorization(): Promise<FormState> {
  await requireAdmin();
  try {
    await applyCategoryRules();
    const r = await categorizeWithAi({ retry: true });
    revalidatePath("/admin", "layout");
    if (r.skipped) return { ok: false, message: "Add AI_GATEWAY_API_KEY to the environment to turn on AI categorization." };
    const moved = r.posted + r.transfers + r.investment + r.ignored;
    const linked = r.linked ? ` Linked ${r.linked} matching transfer ${r.linked === 1 ? "pair" : "pairs"}.` : "";
    if (!moved && !r.held && !r.unsure) return { ok: true, message: linked.trim() || "Nothing is waiting for AI review. Entries covered by suggest-only rules stay with you." };
    return { ok: true, message: `AI reviewed ${moved + r.held + r.unsure} entries: ${r.posted} posted, ${r.transfers} transfers, ${r.investment} investment, ${r.ignored} ignored.${linked}${r.held ? ` ${r.held} possible duplicates or missing exchange rates stay in the inbox.` : ""}${r.unsure ? ` ${r.unsure} left in the inbox with a suggestion.` : ""}` };
  } catch (error) { return message(error); }
}
