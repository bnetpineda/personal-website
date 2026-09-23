"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { notificationDismissals } from "@/lib/db/schema";
import type { FormState } from "@/lib/finance/schemas";

export async function dismissNotification(key: string, dismissed: boolean): Promise<FormState> {
  await requireAdmin();
  if (!z.string().min(1).max(200).safeParse(key).success || typeof dismissed !== "boolean") return { ok: false, message: "Invalid notification." };
  if (dismissed) await getDb().insert(notificationDismissals).values({ key }).onConflictDoNothing();
  else await getDb().delete(notificationDismissals).where(eq(notificationDismissals.key, key));
  revalidatePath("/admin", "layout");
  return { ok: true, message: dismissed ? "Notification dismissed." : "Notification restored." };
}
