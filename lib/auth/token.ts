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

/**
 * Where requireAdmin sends a device whose token is signed but revoked (an older epoch). proxy.ts can't
 * see epochs, so it clears the cookie there instead of bouncing the "signed in" visitor back to /admin.
 */
export const SESSION_ENDED_PATH = "/admin/login?session=ended";

/** What a valid token says: when it was issued, and the session epoch ("Sign out everywhere" bumps it) it belongs to. */
export interface SessionClaims {
  issuedAt: number;
  epoch: number;
}

function key(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < 32) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now: Date = new Date(),
  epoch = 0
): Promise<string> {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error("Session epoch must be a non-negative integer.");
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ role: "admin", epoch })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_MAX_AGE)
    .sign(key(secret));
}

/** Claims of a valid admin token, or null if it's missing, forged or expired. Tokens from before epochs count as epoch 0. */
export async function readSessionToken(
  token: string | undefined,
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now?: Date
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      subject: "admin",
      currentDate: now,
    });
    if (payload.role !== "admin" || typeof payload.iat !== "number") return null;
    const epoch = payload.epoch ?? 0;
    if (typeof epoch !== "number" || !Number.isSafeInteger(epoch) || epoch < 0) return null;
    return { issuedAt: payload.iat, epoch };
  } catch {
    return null;
  }
}

/** Issue time (seconds) of a valid admin token, or null if it's missing, forged or expired. */
export async function sessionIssuedAt(
  token: string | undefined,
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now?: Date
): Promise<number | null> {
  return (await readSessionToken(token, secret, now))?.issuedAt ?? null;
}

/** Signature and expiry only. The epoch is checked against the database in session.ts. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now?: Date
): Promise<boolean> {
  return (await readSessionToken(token, secret, now)) != null;
}
