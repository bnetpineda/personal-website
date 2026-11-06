import "server-only";
import { cache } from "react";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { adminState } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SESSION_ENDED_PATH, readSessionToken, signSessionToken } from "./token";

/** The current session epoch. No row yet means nobody has signed out everywhere: epoch 0. */
async function currentEpoch(): Promise<number> {
  const [row] = await getDb().select({ epoch: adminState.sessionEpoch }).from(adminState).where(eq(adminState.id, 1));
  return row?.epoch ?? 0;
}

export async function createSession() {
  const token = await signSessionToken(env.sessionSecret(), new Date(), await currentEpoch());
  (await cookies()).set({ name: SESSION_COOKIE, value: token, ...SESSION_COOKIE_OPTIONS });
}

export async function deleteSession() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_OPTIONS.path });
}

/** Invalidates every session token issued so far, on every device. */
export async function bumpSessionEpoch(): Promise<void> {
  await getDb()
    .insert(adminState)
    .values({ id: 1, sessionEpoch: 1 })
    .onConflictDoUpdate({ target: adminState.id, set: { sessionEpoch: sql`${adminState.sessionEpoch} + 1`, updatedAt: new Date() } });
}

/** Cached per request, so every data read can call it cheaply: one epoch query per request, and only for a valid token. */
export const isAdmin = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await readSessionToken(token, env.sessionSecret());
  return claims != null && claims.epoch === (await currentEpoch());
});

/**
 * The real auth gate (proxy.ts is only an optimistic redirect). Call it first in every
 * Server Action and data read - and never inside try/catch, since redirect() throws.
 */
export async function requireAdmin(): Promise<void> {
  if (await isAdmin()) return;
  // A cookie that's still signed but no longer valid (signed out everywhere) has to be cleared at the login page.
  const stale = (await cookies()).has(SESSION_COOKIE);
  redirect(stale ? SESSION_ENDED_PATH : "/admin/login");
}
