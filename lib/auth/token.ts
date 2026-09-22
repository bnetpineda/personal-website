import { SignJWT, jwtVerify } from "jose";

/*
 * Admin session token (HS256 JWT). No Next.js or server-only imports:
 * used by proxy.ts, lib/auth/session.ts and unit tests.
 */

export const SESSION_COOKIE = "adm_session";
/** Idle timeout. proxy.ts re-issues the token while it's in use, so an installed app stays signed in. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // seconds
/** Tokens older than this get re-issued on the next request. */
export const SESSION_REFRESH_AFTER = 60 * 60 * 24; // seconds

/** Cookie attributes, shared by login (session.ts) and the sliding refresh (proxy.ts). */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  // Scoped to the admin area; deleting must pass the same path (cookies().delete defaults to "/").
  path: "/admin",
  maxAge: SESSION_MAX_AGE,
} as const;

function key(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < 32) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now: Date = new Date()
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_MAX_AGE)
    .sign(key(secret));
}

/** Issue time (seconds) of a valid admin token, or null if it's missing, forged or expired. */
export async function sessionIssuedAt(
  token: string | undefined,
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now?: Date
): Promise<number | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      subject: "admin",
      currentDate: now,
    });
    return payload.role === "admin" && typeof payload.iat === "number" ? payload.iat : null;
  } catch {
    return null;
  }
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now?: Date
): Promise<boolean> {
  return (await sessionIssuedAt(token, secret, now)) != null;
}
