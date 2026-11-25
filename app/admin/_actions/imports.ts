"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { categoryRules } from "@/lib/db/schema";
import { applyCategoryRules, ingestEntries, saveStatementBalances } from "@/lib/finance/imports/service";
import { categorizeQuietly, describeAiRun } from "@/lib/finance/imports/ai-service";
import { actionDeadline } from "@/lib/finance/deadline";
import { parseStatementPdf, statementFileType } from "@/lib/finance/imports/detect";
import { PdfPasswordError, pdfPages } from "@/lib/finance/imports/pdf-text";
import type { StatementBalance } from "@/lib/finance/statement-balances";
import { ImportError, uniqueEntries } from "@/lib/finance/imports/types";
import { detectFeeMode, mergeWiseStatements, parseWiseStatement } from "@/lib/finance/imports/wise-csv";
import { idSchema, type FormState } from "@/lib/finance/schemas";
import { refreshAdmin } from "@/lib/finance/refresh";
import { teachPayeeNow, undoAutoTaught } from "@/lib/finance/imports/teach-service";

/** The tail of an import message: which balances now count in net worth. */
function balancesNote(currencies: string[], warning?: string) {
  const updated = currencies.length ? ` Balance updated: ${currencies.join(", ")}.` : "";
  return `${updated}${warning ? ` ${warning}` : ""}`;
}

function message(error: unknown): FormState {
  if (error instanceof PdfPasswordError) return { ok: false, needsPassword: true, message: error.message };
  return { ok: false, message: error instanceof ImportError ? error.message : "The import could not be saved. Check the statement format and try again." };
}
/** Wise CSVs: one statement per currency, each under 750 KB. Several are merged into one set of entries and balances. */
async function wiseEntries(files: File[], named: boolean) {
  if (files.length > 10) throw new ImportError("Import up to 10 Wise CSV files at a time.");
  if (files.some((file) => file.size > 750_000)) throw new ImportError("Each Wise CSV file must be smaller than 750 KB.");
  const statements = await Promise.all(files.map(async (file) => {
    try { const text = await file.text(); return { name: file.name, ...parseWiseStatement(text, detectFeeMode(text)) }; }
    catch (error) { throw error instanceof ImportError && named ? new ImportError(`${file.name}: ${error.message}`) : error; }
  }));
  const merged = mergeWiseStatements(statements);
  return { entries: merged.entries, balances: merged.balances.map((b): StatementBalance => ({ provider: "wise", account: "personal", ...b })), warning: merged.balanceWarning };
}

/**
 * Opens a PDF with no password, then with each one given until one works: the person's banks each
 * use their own, and one upload can mix them. Passwords only open the file in memory; none is kept.
 */
async function openPdf(file: File, passwords: string[]) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try { return await pdfPages(bytes.slice()); }
  catch (error) { if (!(error instanceof PdfPasswordError) || !passwords.length) throw error; }
  for (const password of passwords) {
    try { return await pdfPages(bytes.slice(), { password }); }
    catch (error) { if (!(error instanceof PdfPasswordError)) throw error; }
  }
  throw new PdfPasswordError(true);
}

/**
 * Every statement at once, from any bank: Wise CSVs and MariBank or GoTyme PDFs, mixed in one pick or
 * drop. Each file says which bank it is from (detect.ts) and must add up to its own totals before
 * anything is saved; then rules and AI file the entries before answering. Each closing balance counts
 * as cash in net worth. Re-importing is safe; entries already imported are skipped.
 */
export async function importStatements(data: FormData): Promise<FormState> {
  const deadline = actionDeadline();
  await requireAdmin();
  try {
    const files = data.getAll("file").filter((file): file is File => file instanceof File && file.size > 0);
    const passwords = data.getAll("password").filter((p): p is string => typeof p === "string" && p.length > 0);
    if (!files.length) throw new ImportError("Choose at least one statement: Wise CSVs, or MariBank or GoTyme PDFs.");
    const odd = files.find((file) => !statementFileType(file.name));
    if (odd) throw new ImportError(`${odd.name} isn't a statement. Upload Wise CSVs or MariBank and GoTyme PDFs.`);
    if (files.length > 15) throw new ImportError("Import up to 15 statements at a time.");
    if (files.reduce((sum, file) => sum + file.size, 0) > 2_500_000) throw new ImportError("The selected files are too large together. Import them in smaller groups.");
    if (passwords.length > 5 || passwords.some((p) => p.length > 128)) throw new PdfPasswordError(true);
    const named = files.length > 1;
    const csvs = files.filter((file) => statementFileType(file.name) === "csv");
    const pdfs = files.filter((file) => statementFileType(file.name) === "pdf");
    const [wise, statements] = await Promise.all([
      csvs.length ? wiseEntries(csvs, named) : null,
      Promise.all(pdfs.map(async (file) => {
        try { return parseStatementPdf(await openPdf(file, passwords)); }
        catch (error) { throw error instanceof ImportError && !(error instanceof PdfPasswordError) && named ? new ImportError(`${file.name}: ${error.message}`) : error; }
      })),
    ]);
    const entries = uniqueEntries([...(wise?.entries ?? []), ...statements.flatMap((s) => s.entries)]);
    const balances = [...(wise?.balances ?? []), ...statements.flatMap((s) => s.balances)];
    if (!entries.length && !balances.length) throw new ImportError(named ? "These statements have no transactions." : "This statement has no transactions.");
    const result = entries.length ? await ingestEntries(entries) : { inserted: 0, duplicates: 0 };
    const updated = await saveStatementBalances(balances);
    await applyCategoryRules();
    const ai = await categorizeQuietly({ deadline });
    refreshAdmin();
    const banks = [...new Set([...(wise ? ["Wise"] : []), ...statements.map((s) => s.bank)])].join(", ");
    const count = files.length === 1 ? "1 file" : `${files.length} files`;
    return { ok: true, message: `Imported ${result.inserted} new entries from ${count} (${banks}); ${result.duplicates} were already imported.${balancesNote(updated, wise?.warning)}${describeAiRun(ai)}` };
  } catch (error) { return message(error); }
}

// Adding and editing category rules: saveRule in ./rules.ts.
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
  const result = await teachPayeeNow(parsed.data.payee, parsed.data.kind, parsed.data.categoryId);
  if (result.ok) refreshAdmin();
  return { ok: result.ok, message: result.message };
}

/** Puts back a payee the daily job sorted on its own; it returns to Sort these for good. */
export async function undoAutoTaughtPayee(id: string): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Unknown payee." };
  const result = await undoAutoTaught(id);
  if (result.ok) refreshAdmin();
  return result;
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof enabled !== "boolean") return { ok: false, message: "Invalid rule." };
  await getDb().update(categoryRules).set({ enabled }).where(eq(categoryRules.id, id));
  refreshAdmin();
  return { ok: true, message: enabled ? "Rule resumed." : "Rule paused." };
}
