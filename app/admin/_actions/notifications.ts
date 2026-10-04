"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { notificationDismissals } from "@/lib/db/schema";
import type { FormState } from "@/lib/finance/schemas";

const keysSchema = z.array(z.string().min(1).max(200)).min(1).max(20);

/** Dismisses (or restores) alerts together, e.g. all of one account's alerts on the dashboard. */
export async function dismissNotifications(keys: string[], dismissed: boolean): Promise<FormState> {
  await requireAdmin();
  const parsed = keysSchema.safeParse(keys);
  if (!parsed.success || typeof dismissed !== "boolean") return { ok: false, message: "Invalid notification." };
  if (dismissed) await getDb().insert(notificationDismissals).values(parsed.data.map((key) => ({ key }))).onConflictDoNothing();
  else await getDb().delete(notificationDismissals).where(inArray(notificationDismissals.key, parsed.data));
  revalidatePath("/admin", "layout");
  const one = parsed.data.length === 1;
  return { ok: true, message: dismissed ? (one ? "Alert dismissed." : `${parsed.data.length} alerts dismissed.`) : one ? "Alert restored." : "Alerts restored." };
}
