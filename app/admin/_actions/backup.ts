"use server";

import { requireAdmin } from "@/lib/auth/session";
import type { TableCount } from "@/lib/finance/backup";
import { previewBackup, readBackupFile, restoreBackup } from "@/lib/finance/backup-service";
import type { FormState } from "@/lib/finance/schemas";
import { logError } from "@/lib/log";
import { refreshAdmin } from "@/lib/finance/refresh";

export interface RestorePreview extends FormState {
  counts?: Omit<TableCount, "table">[];
  fresh?: number;
}

const entries = (n: number) => `${n} new ${n === 1 ? "entry" : "entries"}`;

/** Dry run: what restoring this file would add. Writes nothing. */
export async function previewRestore(formData: FormData): Promise<RestorePreview> {
  await requireAdmin();
  const parsed = await readBackupFile(formData.get("backup"));
  if (!parsed.ok) return { ok: false, message: parsed.message };
  try {
    const counts = await previewBackup(parsed.backup);
    const fresh = counts.reduce((sum, c) => sum + c.fresh, 0);
    return { ok: true, counts: counts.map(({ label, fresh, present }) => ({ label, fresh, present })), fresh };
  } catch (error) {
    logError("backup preview failed", error);
    return { ok: false, message: "The backup couldn't be checked. Try again." };
  }
}

/** Adds the backup's missing rows. Nothing already saved is changed or deleted. */
export async function restoreFromBackup(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = await readBackupFile(formData.get("backup"));
  if (!parsed.ok) return { ok: false, message: parsed.message };
  let fresh: number;
  let rules = 0;
  try {
    const counts = await restoreBackup(parsed.backup);
    fresh = counts.reduce((sum, c) => sum + c.fresh, 0);
    rules = counts.find((c) => c.table === "categoryRules")?.fresh ?? 0;
  } catch (error) {
    logError("backup restore failed", error);
    return { ok: false, message: "The restore didn't finish. Nothing already saved was changed; run it again to add the rest." };
  }
  refreshAdmin();
  // Restored rules are off (see lib/finance/backup.ts), so say where to turn them back on.
  const rulesNote = rules ? ` ${rules} category ${rules === 1 ? "rule is" : "rules are"} turned off; turn on the ones you want on Categories.` : "";
  return { ok: true, message: fresh ? `Restored ${entries(fresh)}.${rulesNote}` : "Nothing to restore: everything in this backup is already here." };
}
