"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { accountConnections } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { sealCredentials } from "@/lib/finance/connections/crypto";
import { syncAccount, syncAllAccounts } from "@/lib/finance/connections/service";
import { credentialsSchema, syncProviderSchema, type SyncProvider } from "@/lib/finance/connections/types";
import type { FormState } from "@/lib/finance/schemas";
import { ensureFx, snapshotQuietly } from "@/lib/finance/service";
import { applyCategoryRules } from "@/lib/finance/imports/service";
import { categorizeQuietly, describeAiRun } from "@/lib/finance/imports/ai-service";

/** After a sync, rules and AI file the new activity before the action answers; the result is the message tail. */
async function refreshTotals({ categorize = false } = {}) {
  const rows = await getDb().select({ snapshot: accountConnections.snapshot }).from(accountConnections);
  try { await ensureFx(rows.flatMap((r) => r.snapshot?.positions.map((p) => p.currency) ?? [])); } catch { /* UI reports missing FX. */ }
  after(snapshotQuietly);
  let summary = "";
  if (categorize) {
    await applyCategoryRules();
    summary = describeAiRun(await categorizeQuietly());
  }
  revalidatePath("/admin", "layout");
  return summary;
}

export async function saveConnection(_previous: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = credentialsSchema.safeParse(Object.fromEntries(data));
  // Do not use invalid()/failure(formData): those helpers echo secrets to the client.
  if (!parsed.success) return { ok: false, message: "Check the connection details.", errors: z.flattenError(parsed.error).fieldErrors };
  const credentials = parsed.data;
  const expiry = z.union([z.iso.date(), z.literal("")]).safeParse(data.get("credentialsExpireOn") ?? "");
  if (!expiry.success) return { ok: false, message: "Check the credential expiry date." };
  const db = getDb();
  try {
    const [current] = await db.select({ lastAttemptAt: accountConnections.lastAttemptAt }).from(accountConnections)
      .where(eq(accountConnections.provider, credentials.provider));
    if (current?.lastAttemptAt && Date.now() - current.lastAttemptAt.getTime() < 60_000) {
      return { ok: false, message: "Wait one minute after the last sync before replacing credentials." };
    }
    const values = { encryptedCredentials: sealCredentials(credentials, env.sessionSecret()), enabled: true,
      credentialsExpireOn: expiry.data || null, historySyncedAt: null, historyError: null, historyCoverage: null,
      includeInNetWorth: false, snapshot: null, lastSyncedAt: null, lastAttemptAt: null, error: null, syncLease: null, leaseExpiresAt: null };
    await db.insert(accountConnections).values({ provider: credentials.provider, ...values })
      .onConflictDoUpdate({ target: accountConnections.provider, set: values });
    const result = await syncAccount(credentials.provider);
    const summary = await refreshTotals({ categorize: true });
    return { ok: true, message: result.ok ? `Connected and synced. Review the balances before including them in net worth.${summary}` : "Connection saved. Open its sync status to resolve the first sync." };
  } catch {
    return { ok: false, message: "The connection could not be saved. Try again." };
  }
}

export async function saveConnectionExpiry(_previous: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const provider = syncProviderSchema.safeParse(data.get("provider"));
  const date = z.union([z.iso.date(), z.literal("")]).safeParse(data.get("credentialsExpireOn"));
  if (!provider.success || !date.success) return { ok: false, message: "Check the expiry date." };
  await getDb().update(accountConnections).set({ credentialsExpireOn: date.data || null }).where(eq(accountConnections.provider, provider.data));
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Credential reminder updated." };
}

export async function syncConnections(provider?: SyncProvider): Promise<FormState> {
  await requireAdmin();
  if (provider !== undefined && !syncProviderSchema.safeParse(provider).success) return { ok: false, message: "Unknown provider." };
  try {
    const results = provider ? [await syncAccount(provider)] : await syncAllAccounts();
    const summary = await refreshTotals({ categorize: true });
    if (results.length === 0) return { ok: false, message: "Connect an account first." };
    const failed = results.filter((r) => !r.ok);
    return { ok: failed.length === 0, message: `${failed.length ? failed.map((r) => `${r.provider.toUpperCase()}: ${r.message}`).join(" ") : "Account balances updated."}${summary}` };
  } catch {
    return { ok: false, message: "Sync could not finish. Try again later." };
  }
}

export async function updateConnection(provider: SyncProvider, setting: "enabled" | "includeInNetWorth", value: boolean): Promise<FormState> {
  await requireAdmin();
  if (!syncProviderSchema.safeParse(provider).success || !["enabled", "includeInNetWorth"].includes(setting) || typeof value !== "boolean") {
    return { ok: false, message: "Invalid connection setting." };
  }
  const db = getDb();
  const [row] = await db.select({ snapshot: accountConnections.snapshot }).from(accountConnections).where(eq(accountConnections.provider, provider));
  if (!row) return { ok: false, message: "Connect this account first." };
  if (setting === "includeInNetWorth" && value && !row.snapshot) return { ok: false, message: "Sync successfully before including the account in net worth." };
  // Invalidate an in-flight sync when pausing. Its old lease cannot write afterwards.
  await db.update(accountConnections).set({ [setting]: value, ...(setting === "enabled" && !value ? { syncLease: null, leaseExpiresAt: null } : {}) })
    .where(eq(accountConnections.provider, provider));
  await refreshTotals();
  return { ok: true, message: setting === "enabled" ? (value ? "Automatic sync resumed." : "Automatic sync paused; saved balances remain.")
    : value ? "Synced balances included in net worth." : "Synced balances excluded from net worth." };
}

export async function disconnectAccount(provider: SyncProvider): Promise<FormState> {
  await requireAdmin();
  if (!syncProviderSchema.safeParse(provider).success) return { ok: false, message: "Unknown provider." };
  await getDb().delete(accountConnections).where(eq(accountConnections.provider, provider));
  await refreshTotals();
  return { ok: true, message: "Disconnected. Revoke the token in the provider's app if you no longer need it." };
}
