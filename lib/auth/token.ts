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
/**
 * Absolute lifetime from the password sign-in, however often the session is used. Without it a stolen cookie
 * that is used at least once a month would work forever, because every use re-issues it.
 */
export const SESSION_ABSOLUTE_MAX_AGE = 60 * 60 * 24 * 90; // seconds

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
 * The link carries a proof bound to that exact token (see endedSessionProof), so a link from another site
 * can't sign a working session out.
 */
export const SESSION_ENDED_PATH = "/admin/login?session=ended";

export function sessionEndedPath(proof: string): string {
  return `${SESSION_ENDED_PATH}&proof=${encodeURIComponent(proof)}`;
}

/** HMAC of the revoked token's claims. Only the server (which saw the epoch was stale) can make it. */
export async function endedSessionProof(claims: SessionClaims, secret: string | undefined = process.env.ADMIN_SESSION_SECRET): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey("raw", signingKey(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(`session-ended|${claims.issuedAt}|${claims.authTime}|${claims.epoch}`));
  let binary = "";
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Constant-time check of a proof from the URL against the token in the cookie. */
export async function isEndedSessionProof(proof: string | null, claims: SessionClaims, secret: string | undefined = process.env.ADMIN_SESSION_SECRET): Promise<boolean> {
  if (!proof) return false;
  const expected = await endedSessionProof(claims, secret);
  if (proof.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= proof.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** What a valid token says: when it was issued, when the password was last entered, and its session epoch ("Sign out everywhere" bumps it). */
export interface SessionClaims {
  issuedAt: number;
  /** Seconds. Refreshes carry it over unchanged, so SESSION_ABSOLUTE_MAX_AGE counts from the real sign-in. */
  authTime: number;
  epoch: number;
}

/** Trimmed like lib/env.ts does, so a value pasted with a trailing newline signs and verifies with the same key everywhere. */
export function signingKey(secret: string | undefined): Uint8Array<ArrayBuffer> {
  const trimmed = secret?.trim();
  if (!trimmed || trimmed.length < 32) throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(trimmed);
}

/** Seconds a token issued now may live: the idle timeout, cut short by the absolute lifetime. */
export function sessionLifetime(issuedAt: number, authTime: number): number {
  return Math.max(0, Math.min(SESSION_MAX_AGE, authTime + SESSION_ABSOLUTE_MAX_AGE - issuedAt));
}

/** A fresh sign-in by default; a refresh passes the old token's authTime so the absolute lifetime keeps counting. */
export async function signSessionToken(
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now: Date = new Date(),
  epoch = 0,
  authTime?: number
): Promise<string> {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new Error("Session epoch must be a non-negative integer.");
  const issuedAt = Math.floor(now.getTime() / 1000);
  const auth = authTime ?? issuedAt;
  if (!Number.isSafeInteger(auth) || auth > issuedAt) throw new Error("Session auth time must be whole seconds, not in the future.");
  const lifetime = sessionLifetime(issuedAt, auth);
  if (lifetime <= 0) throw new Error("This session reached its absolute lifetime; sign in again.");
  return new SignJWT({ role: "admin", epoch, auth_time: auth })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + lifetime)
    .sign(signingKey(secret));
}

/** Claims of a valid admin token, or null if it's missing, forged, expired or past its absolute lifetime. Tokens from before epochs count as epoch 0. */
export async function readSessionToken(
  token: string | undefined,
  secret: string | undefined = process.env.ADMIN_SESSION_SECRET,
  now?: Date
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), {
      algorithms: ["HS256"],
      subject: "admin",
      currentDate: now,
    });
    if (payload.role !== "admin" || typeof payload.iat !== "number") return null;
    const epoch = payload.epoch ?? 0;
    if (typeof epoch !== "number" || !Number.isSafeInteger(epoch) || epoch < 0) return null;
    // Tokens from before auth_time count from their own issue time.
    const authTime = payload.auth_time ?? payload.iat;
    if (typeof authTime !== "number" || !Number.isSafeInteger(authTime) || authTime > payload.iat) return null;
    const nowSeconds = Math.floor((now ?? new Date()).getTime() / 1000);
    if (nowSeconds - authTime > SESSION_ABSOLUTE_MAX_AGE) return null;
    return { issuedAt: payload.iat, authTime, epoch };
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

/* ---------- known device ---------- */

/**
 * A signed, long-lived cookie set on every successful sign-in (and on any signed-in visit that lacks it). It marks
 * this browser as one the owner uses, which exempts it from the global login limit. It is keyed by the browser,
 * not the IP, so a phone on mobile data keeps it as its address changes. It never grants access by itself.
 */
export const DEVICE_COOKIE = "adm_device";
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365; // seconds

export const DEVICE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/admin",
  maxAge: DEVICE_MAX_AGE,
} as const;

export async function signDeviceToken(secret: string | undefined = process.env.ADMIN_SESSION_SECRET, now: Date = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ role: "device" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin-device")
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + DEVICE_MAX_AGE)
    .sign(signingKey(secret));
}

/** True for a device cookie this server signed that hasn't expired. A session token is not accepted here, nor the reverse. */
export async function verifyDeviceToken(token: string | undefined, secret: string | undefined = process.env.ADMIN_SESSION_SECRET, now?: Date): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), { algorithms: ["HS256"], subject: "admin-device", currentDate: now });
    return payload.role === "device";
  } catch {
    return false;
  }
}
