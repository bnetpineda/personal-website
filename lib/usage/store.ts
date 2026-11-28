import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiUsageSnapshots } from "@/lib/db/schema";
import type { AiUsagePayload, AiUsageSnapshot } from "./types";

export const AI_USAGE_CACHE_TAG = "ai-usage";
export const DEFAULT_USAGE_MACHINE_ID = "zephyrus-g14";

/**
 * Reads the latest synced AI usage snapshot for the public landing page.
 * Returns null if the database is not configured (e.g. during static builds) or no snapshot exists yet.
 */
export async function getAiUsageSnapshot(machineId = DEFAULT_USAGE_MACHINE_ID): Promise<AiUsagePayload | null> {
  if (!process.env.DATABASE_URL?.trim()) return null;
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(aiUsageSnapshots)
      .where(eq(aiUsageSnapshots.machineId, machineId))
      .limit(1);
    if (row) {
      return {
        snapshot: row.snapshot,
        updatedAt: row.updatedAt.toISOString(),
      };
    }
    // Fallback to the most recently updated machine if the default id isn't present yet.
    const [latest] = await db
      .select()
      .from(aiUsageSnapshots)
      .orderBy(desc(aiUsageSnapshots.updatedAt))
      .limit(1);
    if (!latest) return null;
    return {
      snapshot: latest.snapshot,
      updatedAt: latest.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error("[ai-usage] failed to read snapshot:", error);
    return null;
  }
}

export async function upsertAiUsageSnapshot(snapshot: AiUsageSnapshot): Promise<{ updatedAt: Date }> {
  const db = getDb();
  const now = new Date();
  await db
    .insert(aiUsageSnapshots)
    .values({
      machineId: snapshot.machineId,
      machineLabel: snapshot.machineLabel,
      timezone: snapshot.timezone,
      snapshot,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiUsageSnapshots.machineId,
      set: {
        machineLabel: snapshot.machineLabel,
        timezone: snapshot.timezone,
        snapshot,
        updatedAt: now,
      },
    });
  return { updatedAt: now };
}
