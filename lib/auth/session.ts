import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSessionToken, verifySessionToken } from "./token";

// Scoped to the admin area; deleting must pass the same path (cookies().delete defaults to "/").
const COOKIE_PATH = "/admin";

export async function createSession() {
  const token = await signSessionToken(env.sessionSecret());
  (await cookies()).set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: SESSION_MAX_AGE,
  });
}

export async function deleteSession() {
  (await cookies()).delete({ name: SESSION_COOKIE, path: COOKIE_PATH });
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
