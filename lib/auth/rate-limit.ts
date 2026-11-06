import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, gte, lt, or } from "drizzle-orm";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { lockedOut } from "./lockout";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const PER_IP_WINDOW_MS = 15 * MINUTE;
const GLOBAL_WINDOW_MS = 60 * MINUTE;
/** A client that signed in within this long skips the global limit, so a stranger's guessing can't lock the owner out. */
const KNOWN_DEVICE_MS = 30 * DAY;
const FAILURE_RETENTION_MS = 7 * DAY;

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
  const failures = (since: number, ...filters: Parameters<typeof and>) =>
    db.select({ n: count() }).from(loginAttempts)
      .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, new Date(since)), ...filters));
  const [[perIp], [global], [known]] = await Promise.all([
    failures(now - PER_IP_WINDOW_MS, eq(loginAttempts.ipHash, ipHash)),
    failures(now - GLOBAL_WINDOW_MS),
    db.select({ n: count() }).from(loginAttempts)
      .where(and(eq(loginAttempts.ipHash, ipHash), eq(loginAttempts.success, true), gte(loginAttempts.createdAt, new Date(now - KNOWN_DEVICE_MS)))),
  ]);
  return lockedOut({ perIpFailures: perIp.n, globalFailures: global.n, knownDevice: known.n > 0 });
}

export async function recordLoginAttempt(ipHash: string, success: boolean): Promise<void> {
  const db = getDb();
  await db.insert(loginAttempts).values({ ipHash, success });
  // A successful login clears this client's recent failures.
  if (success) {
    await db.delete(loginAttempts).where(and(eq(loginAttempts.ipHash, ipHash), eq(loginAttempts.success, false)));
  }
}

/** Failures go after a week; successes stay as long as they mark a known device. */
export async function pruneLoginAttempts(): Promise<void> {
  const now = Date.now();
  await getDb()
    .delete(loginAttempts)
    .where(or(
      and(eq(loginAttempts.success, false), lt(loginAttempts.createdAt, new Date(now - FAILURE_RETENTION_MS))),
      lt(loginAttempts.createdAt, new Date(now - KNOWN_DEVICE_MS))
    ));
}
