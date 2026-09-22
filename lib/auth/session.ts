import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, signSessionToken, verifySessionToken } from "./token";

export async function createSession() {
  const token = await signSessionToken(env.sessionSecret());
  (await cookies()).set({ name: SESSION_COOKIE, value: token, ...SESSION_COOKIE_OPTIONS });
}

export async function deleteSession() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: SESSION_COOKIE_OPTIONS.path });
}

/** Cached per request, so every data read can call it cheaply. */
export const isAdmin = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, env.sessionSecret());
});

/**
 * The real auth gate (proxy.ts is only an optimistic redirect). Call it first in every
 * Server Action and data read — and never inside try/catch, since redirect() throws.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
