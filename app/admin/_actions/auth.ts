"use server";

import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { verifyPassword } from "@/lib/auth/password";
import { clientIpHash, isLockedOut, recordLoginAttempt } from "@/lib/auth/rate-limit";
import { createSession, deleteSession } from "@/lib/auth/session";

export interface LoginState {
  error?: string;
}

/** Only same-site admin paths — blocks //evil.com, /\evil.com and absolute URLs. */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !/^\/admin(\/[\w\-./?=&%]*|\?[\w\-.=&%]*)?$/.test(value) || value.startsWith("/admin/login")) {
    return "/admin";
  }
  return value;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) return { error: "Enter your password." };

  const ipHash = await clientIpHash();
  if (await isLockedOut(ipHash)) return { error: "Too many attempts. Try again in 15 minutes." };

  const ok = password.length <= 256 && (await verifyPassword(password, env.adminPasswordHash()));
  await recordLoginAttempt(ipHash, ok);
  if (!ok) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { error: "Wrong password." };
  }

  await createSession();
  redirect(safeNext(formData.get("next")));
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/admin/login");
}
