"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { categories, categoryRules } from "@/lib/db/schema";
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
export async function setRuleEnabled(id: string, enabled: boolean): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof enabled !== "boolean") return { ok: false, message: "Invalid rule." };
  await getDb().update(categoryRules).set({ enabled }).where(eq(categoryRules.id, id));
  revalidatePath("/admin", "layout");
  return { ok: true, message: enabled ? "Rule resumed." : "Rule paused." };
}
