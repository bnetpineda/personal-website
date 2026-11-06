"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { writeAiSummary } from "@/lib/finance/ai-summary-service";
import type { FormState } from "@/lib/finance/schemas";

/** "Refresh" on the Overview's feedback panel: always writes a new one. No amounts in the message. */
export async function refreshAiSummary(): Promise<FormState> {
  await requireAdmin();
  try {
    const run = await writeAiSummary({ force: true });
    if (run.status === "unconfigured") return { ok: false, message: "Add AI_GATEWAY_API_KEY to get AI feedback." };
    revalidatePath("/admin");
    return { ok: true, message: "Feedback updated." };
  } catch (error) {
    console.error("[admin] AI summary failed", error);
    return { ok: false, message: "The AI Gateway didn't answer. Try again in a minute." };
  }
}
