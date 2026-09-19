"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { refreshAllPrices, type RefreshSummary } from "@/lib/finance/service";

export async function refreshPrices(): Promise<RefreshSummary> {
  await requireAdmin();
  const summary = await refreshAllPrices();
  revalidatePath("/admin", "layout");
  return summary;
}
