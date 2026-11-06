"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import type { TableCount } from "@/lib/finance/backup";
import { previewBackup, readBackupFile, restoreBackup } from "@/lib/finance/backup-service";
import type { FormState } from "@/lib/finance/schemas";

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
    console.error("[admin] backup preview failed", error);
    return { ok: false, message: "The backup couldn't be checked. Try again." };
  }
}

/** Adds the backup's missing rows. Nothing already saved is changed or deleted. */
export async function restoreFromBackup(formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = await readBackupFile(formData.get("backup"));
  if (!parsed.ok) return { ok: false, message: parsed.message };
  let fresh: number;
  try {
    fresh = (await restoreBackup(parsed.backup)).reduce((sum, c) => sum + c.fresh, 0);
  } catch (error) {
    console.error("[admin] backup restore failed", error);
    return { ok: false, message: "The restore didn't finish. Nothing already saved was changed; run it again to add the rest." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: fresh ? `Restored ${entries(fresh)}.` : "Nothing to restore: everything in this backup is already here." };
}
