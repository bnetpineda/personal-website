"use server";

import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { accountConnections, importedEntries, investmentReports, investmentSyncs } from "@/lib/db/schema";
import { ConnectionError } from "@/lib/finance/connections/types";
import { advanceHistory, historySetupSchema, startBinanceHistory, startHeldSpotHistory } from "@/lib/finance/imports/history-service";
import { parseIbkrHistory } from "@/lib/finance/imports/provider-parsers";
import { categorizeQuietly } from "@/lib/finance/imports/ai-service";
import { applyCategoryRules, ingestQuery } from "@/lib/finance/imports/service";
import { ImportError, sameSource, sourceKey, type HistoryCoverage, type ImportEntry } from "@/lib/finance/imports/types";
import { idSchema, type FormState } from "@/lib/finance/schemas";

function failure(error: unknown): FormState {
  return { ok: false, message: error instanceof ImportError || error instanceof ConnectionError ? error.message : "The history could not be imported. Check report fields or provider access. Previous records were kept." };
}

async function report(data: FormData) {
  const file = data.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 2_500_000) throw new ImportError("Choose an IBKR Activity Flex XML file up to 2.5 MB. Split larger histories into shorter periods.");
  const text = await file.text(), parsed = parseIbkrHistory(text);
  if (parsed.entries.length > 25_000) throw new ImportError("Import up to 25,000 entries per file. Export a shorter date range.");
  return { ...parsed, hash: createHash("sha256").update(text).digest("hex") };
}
export interface HistoryPreview extends FormState { entries?: ImportEntry[]; total?: number; duplicates?: number; conflicts?: number; coverage?: HistoryCoverage; accounts?: string[] }
export async function previewInvestmentReport(data: FormData): Promise<HistoryPreview> {
  await requireAdmin();
  try {
    const parsed = await report(data);
    const existing = parsed.entries.length ? await getDb().select().from(importedEntries).where(and(eq(importedEntries.provider, "ibkr"),
      inArray(importedEntries.accountKey, parsed.accounts!), inArray(importedEntries.externalId, parsed.entries.map((e) => e.externalId)))) : [];
    const byKey = new Map(existing.map((e) => [sourceKey(e), e]));
    const duplicates = parsed.entries.filter((e) => byKey.has(sourceKey(e))).length;
    const conflicts = parsed.entries.filter((e) => { const old = byKey.get(sourceKey(e)); return old && !sameSource(e, old); }).length;
    return { ok: true, total: parsed.entries.length, duplicates, conflicts, coverage: parsed.coverage, accounts: parsed.accounts, entries: parsed.entries.slice(0, 10) };
  } catch (error) { return failure(error); }
}
export async function importInvestmentReport(data: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    const parsed = await report(data), db = getDb();
    const [saved] = await db.batch([db.execute(ingestQuery(parsed.entries)),
      db.insert(investmentReports).values({ provider: "ibkr", fileHash: parsed.hash, accounts: parsed.accounts!,
        fromDate: parsed.coverage.from, toDate: parsed.coverage.to, entries: parsed.entries.length }).onConflictDoNothing(),
    ]);
    await applyCategoryRules();
    after(categorizeQuietly);
    revalidatePath("/admin", "layout");
    return { ok: true, message: `Imported ${Number(saved.rows[0]?.inserted ?? 0)} new entries; skipped ${Number(saved.rows[0]?.duplicates ?? 0)} duplicates. Review cash activity in the inbox.` };
  } catch (error) { return failure(error); }
}
export async function configureInvestmentHistory(_previous: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = historySetupSchema.safeParse(Object.fromEntries(data));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await startBinanceHistory(parsed.data);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "History streams saved. Use Continue all to import older activity now; daily sync also advances saved streams." };
  } catch (error) { return failure(error); }
}
export async function prepareHoldingCosts(): Promise<FormState & { jobs?: { id: string; scope: string; enabled: boolean }[]; skipped?: string[] }> {
  await requireAdmin();
  try {
    const result = await startHeldSpotHistory();
    revalidatePath("/admin", "layout");
    return { ok: true, ...result };
  } catch (error) { return failure(error); }
}
export async function holdingCostRefreshJobs() {
  await requireAdmin();
  const db = getDb();
  const [connection] = await db.select({ snapshot: accountConnections.snapshot, enabled: accountConnections.enabled })
    .from(accountConnections).where(eq(accountConnections.provider, "binance"));
  if (!connection?.enabled || !connection.snapshot?.accountKey) return [];
  const jobs = await db.select({ id: investmentSyncs.id, scope: investmentSyncs.scope }).from(investmentSyncs)
    .where(and(eq(investmentSyncs.accountKey, connection.snapshot.accountKey), eq(investmentSyncs.enabled, true)));
  return jobs.filter((j) => j.scope.startsWith("spot:")).slice(0, 20);
}
export async function continueInvestmentHistory(id: string): Promise<FormState & { more?: boolean }> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, message: "Unknown import." };
  const result = await advanceHistory(id);
  revalidatePath("/admin", "layout");
  return result;
}
export async function setHistoryEnabled(id: string, enabled: boolean): Promise<FormState> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || typeof enabled !== "boolean") return { ok: false, message: "Unknown import." };
  await getDb().update(investmentSyncs).set({ enabled, lease: null, leaseExpiresAt: null }).where(eq(investmentSyncs.id, id));
  revalidatePath("/admin", "layout");
  return { ok: true, message: enabled ? "History import resumed." : "History import paused; saved records were kept." };
}
