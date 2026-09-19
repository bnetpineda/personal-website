import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, gte, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";

const MINUTE = 60_000;
const PER_IP = { max: 5, windowMs: 15 * MINUTE };
const GLOBAL = { max: 30, windowMs: 60 * MINUTE };
const RETENTION_MS = 7 * 24 * 60 * MINUTE;

/** Vercel overwrites x-forwarded-for with the real client IP, so the first entry is trustworthy there. */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256")
    .update(`${ip}|${process.env.ADMIN_SESSION_SECRET ?? ""}`)
    .digest("hex");
}

/** Checked before any password hashing, so a locked-out client can't burn CPU. */
export async function isLockedOut(ipHash: string): Promise<boolean> {
  const db = getDb();
  const now = Date.now();
  const [[perIp], [global]] = await Promise.all([
    db
      .select({ n: count() })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.ipHash, ipHash),
          eq(loginAttempts.success, false),
          gte(loginAttempts.createdAt, new Date(now - PER_IP.windowMs))
        )
      ),
    db
      .select({ n: count() })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, new Date(now - GLOBAL.windowMs)))),
  ]);
  return perIp.n >= PER_IP.max || global.n >= GLOBAL.max;
}

export async function recordLoginAttempt(ipHash: string, success: boolean): Promise<void> {
  const db = getDb();
  await db.insert(loginAttempts).values({ ipHash, success });
  // A successful login clears this client's recent failures.
  if (success) {
    await db.delete(loginAttempts).where(and(eq(loginAttempts.ipHash, ipHash), eq(loginAttempts.success, false)));
  }
}

export async function pruneLoginAttempts(): Promise<void> {
  await getDb()
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, new Date(Date.now() - RETENTION_MS)));
}
