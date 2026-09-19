import { SignJWT, jwtVerify } from "jose";

/*
 * Admin session token (HS256 JWT). No Next.js or server-only imports:
 * used by proxy.ts, lib/auth/session.ts and unit tests.
 */

export const SESSION_COOKIE = "adm_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // seconds

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

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now?: Date
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      subject: "admin",
      currentDate: now,
    });
    return payload.role === "admin";
  } catch {
    return false;
  }
}
