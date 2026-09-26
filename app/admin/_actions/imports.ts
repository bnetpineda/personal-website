"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { cashFlows, categories, categoryRules, importedEntries } from "@/lib/db/schema";
import { payeeKey } from "@/lib/finance/payee";
import { providerSchema } from "@/lib/finance/connections/types";
import { applyCategoryRules, ingestEntries, saveStatementBalances } from "@/lib/finance/imports/service";
import { categorizeQuietly, describeAiRun } from "@/lib/finance/imports/ai-service";
import { parseMariBankStatement } from "@/lib/finance/imports/maribank";
import { pdfPages } from "@/lib/finance/imports/pdf-text";
import { ImportError, uniqueEntries } from "@/lib/finance/imports/types";
import { detectFeeMode, mergeWiseStatements, parseWiseStatement } from "@/lib/finance/imports/wise-csv";
import { idSchema, type FormState } from "@/lib/finance/schemas";

/** The tail of an import message: which balances now count in net worth. */
function balancesNote(currencies: string[], warning?: string) {
  const updated = currencies.length ? ` Balance updated: ${currencies.join(", ")}.` : "";
  return `${updated}${warning ? ` ${warning}` : ""}`;
}

function message(error: unknown): FormState {
  return { ok: false, message: error instanceof ImportError ? error.message : "The import could not be saved. Check the statement format and try again." };
}
/** One statement per currency: up to 10 files, each under 750 KB, within the 3 MB action body limit. */
async function csvEntries(data: FormData) {
  const files = data.getAll("file").filter((file): file is File => file instanceof File && file.size > 0);
  if (!files.length) throw new ImportError("Choose at least one Wise CSV file.");
  if (files.length > 10) throw new ImportError("Import up to 10 Wise CSV files at a time.");
  if (files.some((file) => file.size > 750_000)) throw new ImportError("Each Wise CSV file must be smaller than 750 KB.");
  if (files.reduce((sum, file) => sum + file.size, 0) > 2_500_000) throw new ImportError("The selected files are too large together. Import them in smaller groups.");
  const statements = await Promise.all(files.map(async (file) => {
    try { const text = await file.text(); return { name: file.name, ...parseWiseStatement(text, detectFeeMode(text)) }; }
    catch (error) { throw error instanceof ImportError && files.length > 1 ? new ImportError(`${file.name}: ${error.message}`) : error; }
  }));
  return { ...mergeWiseStatements(statements), files: files.length };
}
/**
 * Every Wise CSV at once, in one step: the fee format is detected per file, then rules and AI file
 * the entries before answering. Each currency's closing balance counts as cash in net worth.
 * Re-importing is safe; entries already imported are skipped.
 */
export async function importWiseStatements(data: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const { entries, files, balances, balanceWarning } = await csvEntries(data);
    if (!entries.length) throw new ImportError("These statements have no transactions.");
    const result = await ingestEntries(entries);
    const updated = await saveStatementBalances(balances.map((b) => ({ provider: "wise", account: "personal", ...b })));
    await applyCategoryRules();
    const ai = await categorizeQuietly();
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Imported ${result.inserted} new entries from ${files} ${files === 1 ? "file" : "files"}; ${result.duplicates} were already imported.${balancesNote(updated, balanceWarning)}${describeAiRun(ai)}` };
  } catch (error) { return message(error); }
}

/**
 * MariBank monthly statement PDFs, several at once. Each file must add up to its own summary
 * totals before anything is saved; then rules and AI file the entries, as for Wise.
 */
export async function importMariBankStatements(data: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const files = data.getAll("file").filter((file): file is File => file instanceof File && file.size > 0);
    if (!files.length) throw new ImportError("Choose at least one MariBank statement PDF.");
    if (files.length > 12) throw new ImportError("Import up to 12 MariBank statements at a time.");
    if (files.reduce((sum, file) => sum + file.size, 0) > 2_500_000) throw new ImportError("The selected files are too large together. Import them in smaller groups.");
    const statements = await Promise.all(files.map(async (file) => {
      try { return parseMariBankStatement(await pdfPages(new Uint8Array(await file.arrayBuffer()))); }
      catch (error) { throw error instanceof ImportError && files.length > 1 ? new ImportError(`${file.name}: ${error.message}`) : error; }
    }));
    const entries = uniqueEntries(statements.flatMap((s) => s.entries));
    if (!entries.length) throw new ImportError("These statements have no transactions.");
    const result = await ingestEntries(entries);
    const updated = await saveStatementBalances(statements.flatMap((s) => s.balances));
    await applyCategoryRules();
    const ai = await categorizeQuietly();
    revalidatePath("/admin", "layout");
    const months = statements.length === 1 ? "1 statement" : `${statements.length} statements`;
    return { ok: true, message: `Imported ${result.inserted} new entries from ${months}; ${result.duplicates} were already imported.${balancesNote(updated)}${describeAiRun(ai)}` };
  } catch (error) { return message(error); }
}

export async function saveCategoryRule(_previous: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({ contains: z.string().trim().min(2).max(120), provider: z.union([providerSchema, z.literal("any")]),
    kind: z.enum(["income", "expense"]), categoryId: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: "Enter matching text and choose a category of the same type." };
  const value = parsed.data;
  const [category] = await getDb().select().from(categories).where(eq(categories.id, value.categoryId));
  if (!category || category.archived || category.kind !== value.kind) return { ok: false, message: "Choose an active category matching income or expense." };
  await getDb().insert(categoryRules).values({ ...value, provider: value.provider === "any" ? null : value.provider, autoPost: true });
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Rule saved. It runs before AI on the next import or sync." };
}
/**
 * Teach once: the category for every payment from or to this payee. Saves a rule for future imports
 * and re-files the payee's past AI-filed entries; manual and rule decisions are left alone. Both
 * become examples the model learns from.
 */
export async function teachPayee(payee: string, kind: "income" | "expense", categoryId: number): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({ payee: z.string().trim().min(2).max(120), kind: z.enum(["income", "expense"]), categoryId: z.number().int().positive() })
    .safeParse({ payee, kind, categoryId });
  if (!parsed.success) return { ok: false, message: "Choose a category for this payee." };
  const db = getDb(), value = parsed.data;
  const [category] = await db.select().from(categories).where(eq(categories.id, value.categoryId));
  if (!category || category.archived || category.kind !== value.kind) return { ok: false, message: "Choose an active category matching income or expense." };
  const key = payeeKey(value.payee);
  const e = importedEntries;
  const candidates = await db.select({ id: e.id, description: e.description }).from(e).innerJoin(cashFlows, eq(cashFlows.id, e.id))
    .where(and(eq(e.status, "posted"), eq(e.categorizedBy, "ai"), eq(cashFlows.kind, value.kind))).limit(5000);
  const ids = candidates.filter((c) => payeeKey(c.description) === key).map((c) => c.id);
  const [existing] = await db.select({ id: categoryRules.id }).from(categoryRules)
    .where(and(sql`lower(${categoryRules.contains}) = lower(${value.payee})`, eq(categoryRules.kind, value.kind)));
  // One batch is one transaction: the rule and the re-filed entries land together.
  const rule = existing
    ? db.update(categoryRules).set({ categoryId: category.id, enabled: true, autoPost: true, updatedAt: new Date() }).where(eq(categoryRules.id, existing.id))
    : db.insert(categoryRules).values({ contains: value.payee, provider: null, kind: value.kind, categoryId: category.id, autoPost: true });
  if (ids.length) await db.batch([rule,
    db.update(cashFlows).set({ categoryId: category.id, notes: `Taught once: ${value.payee} is ${category.name}.`, updatedAt: new Date() }).where(inArray(cashFlows.id, ids)),
    db.update(e).set({ categoryId: category.id, categorizedBy: "rule", aiReason: null, updatedAt: new Date() }).where(inArray(e.id, ids))]);
  else await rule;
  revalidatePath("/admin", "layout");
  return { ok: true, message: `${value.payee} is ${category.name} from now on. Moved ${ids.length} past ${ids.length === 1 ? "entry" : "entries"}.` };
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof enabled !== "boolean") return { ok: false, message: "Invalid rule." };
  await getDb().update(categoryRules).set({ enabled }).where(eq(categoryRules.id, id));
  revalidatePath("/admin", "layout");
  return { ok: true, message: enabled ? "Rule resumed." : "Rule paused." };
}
