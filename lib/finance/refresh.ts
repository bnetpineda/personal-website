import "server-only";
import { revalidatePath } from "next/cache";

/**
 * After a write, re-renders the admin with fresh data. Layout scope so the shell's "Needs you" badge
 * updates too. Every admin mutation goes through here, so narrowing what refreshes is one change.
 */
export function refreshAdmin() {
  revalidatePath("/admin", "layout");
}
