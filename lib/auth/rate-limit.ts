import "server-only";
import { createHash } from "node:crypto";
import { and, count, eq, gte, lt, ne, or, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ipBucket, lockedOut } from "./lockout";
import { DEVICE_COOKIE, DEVICE_COOKIE_OPTIONS, signDeviceToken, verifyDeviceToken } from "./token";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const PER_IP_WINDOW_MS = 15 * MINUTE;
const GLOBAL_WINDOW_MS = 60 * MINUTE;
const FAILURE_RETENTION_MS = 7 * DAY;
const SUCCESS_RETENTION_MS = 30 * DAY;

/**
 * Vercel overwrites x-forwarded-for with the real client IP, so the first entry is trustworthy there.
 * IPv6 clients are counted by their /64 network (see ipBucket).
 */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256")
    .update(`${ipBucket(ip)}|${process.env.ADMIN_SESSION_SECRET?.trim() ?? ""}`)
    .digest("hex");
}

/** This browser carries a valid device cookie from an earlier sign-in. */
export async function isKnownDevice(): Promise<boolean> {
  return verifyDeviceToken((await cookies()).get(DEVICE_COOKIE)?.value, env.sessionSecret());
}

/** Marks this browser as the owner's for a year; set on every successful sign-in. */
export async function rememberDevice(): Promise<void> {
  (await cookies()).set({ name: DEVICE_COOKIE, value: await signDeviceToken(env.sessionSecret()), ...DEVICE_COOKIE_OPTIONS });
}

export type LoginClaim = { allowed: true; attemptId: number } | { allowed: false };

/**
 * Records this attempt as a failure FIRST, then counts, so simultaneous requests can't all see an empty window.
 * Each insert commits before its own count runs, so of any group of requests that pass, the one that counted
 * last sees every other's row: at most PER_IP_MAX pass per client and GLOBAL_MAX overall, however many arrive at
 * once. A refused attempt's row is removed again, so hammering a locked login doesn't extend the lock.
 * Runs before any password hashing, so a locked-out client can't burn CPU or memory either.
 */
export async function claimLoginAttempt(ipHash: string, knownDevice: boolean): Promise<LoginClaim> {
  const db = getDb();
  const [row] = await db.insert(loginAttempts).values({ ipHash, success: false }).returning({ id: loginAttempts.id });
  const now = Date.now();
  const [counts] = await db
    .select({
      perIp: sql<number>`count(*) filter (where ${loginAttempts.ipHash} = ${ipHash} and ${loginAttempts.createdAt} >= ${new Date(now - PER_IP_WINDOW_MS).toISOString()}::timestamptz)`.mapWith(Number),
      global: count(),
    })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.success, false), gte(loginAttempts.createdAt, new Date(now - GLOBAL_WINDOW_MS))));
  // Both counts include this attempt's own row.
  const locked = lockedOut({ perIpFailures: counts.perIp - 1, globalFailures: counts.global - 1, knownDevice });
  if (!locked) return { allowed: true, attemptId: row.id };
  await db.delete(loginAttempts).where(eq(loginAttempts.id, row.id));
  return { allowed: false };
}

/** A wrong password leaves the claimed row as a failure. A right one turns it into a success and clears this client's failures. */
export async function settleLoginAttempt(ipHash: string, attemptId: number, success: boolean): Promise<void> {
  if (!success) return;
  const db = getDb();
  await db.batch([
    db.update(loginAttempts).set({ success: true }).where(eq(loginAttempts.id, attemptId)),
    db.delete(loginAttempts).where(and(eq(loginAttempts.ipHash, ipHash), eq(loginAttempts.success, false), ne(loginAttempts.id, attemptId))),
  ]);
}

/** Failures go after a week, successes after a month. */
export async function pruneLoginAttempts(): Promise<void> {
  const now = Date.now();
  await getDb()
    .delete(loginAttempts)
    .where(or(
      and(eq(loginAttempts.success, false), lt(loginAttempts.createdAt, new Date(now - FAILURE_RETENTION_MS))),
      lt(loginAttempts.createdAt, new Date(now - SUCCESS_RETENTION_MS))
    ));
}
