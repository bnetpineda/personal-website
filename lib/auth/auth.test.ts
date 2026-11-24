import { describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { adminContentSecurityPolicy } from "./csp";
import { ipBucket, lockedOut } from "./lockout";
import { hashPassword, verifyPassword } from "./password";
import {
  DEVICE_MAX_AGE,
  SESSION_MAX_AGE,
  endedSessionProof,
  isEndedSessionProof,
  readSessionToken,
  sessionEndedPath,
  sessionIssuedAt,
  sessionLifetime,
  signDeviceToken,
  signSessionToken,
  verifyDeviceToken,
  verifySessionToken,
} from "./token";

describe("password hashing", () => {
  test("round-trips and rejects wrong passwords", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt:32768:8:1:")).toBe(true);
    expect(hash).not.toContain("$");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", hash)).toBe(false);
  });

  test("uses a fresh salt each time", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  test("rejects malformed stored hashes instead of throwing", async () => {
    for (const bad of ["", "plain", "scrypt:1:2:3", "bcrypt:32768:8:1:c2FsdHNhbHQ:aGFzaA", "scrypt:x:8:1:c2FsdHNhbHQ:aGFzaGhhc2hoYXNoaGFzaA"]) {
      expect(await verifyPassword("anything", bad)).toBe(false);
    }
  });
});

describe("session token", () => {
  const secret = "s".repeat(40);

  test("verifies a fresh token", async () => {
    const token = await signSessionToken(secret);
    expect(await verifySessionToken(token, secret)).toBe(true);
  });

  test("rejects a wrong secret, a missing token and garbage", async () => {
    const token = await signSessionToken(secret);
    expect(await verifySessionToken(token, "t".repeat(40))).toBe(false);
    expect(await verifySessionToken(undefined, secret)).toBe(false);
    expect(await verifySessionToken("not.a.jwt", secret)).toBe(false);
  });

  test("expires after the max age", async () => {
    const issued = new Date("2026-09-01T00:00:00Z");
    const token = await signSessionToken(secret, issued);
    const almost = new Date(issued.getTime() + (SESSION_MAX_AGE - 60) * 1000);
    const after = new Date(issued.getTime() + (SESSION_MAX_AGE + 60) * 1000);
    expect(await verifySessionToken(token, secret, almost)).toBe(true);
    expect(await verifySessionToken(token, secret, after)).toBe(false);
  });

  test("sessionIssuedAt returns the issue time for refreshes, null when invalid", async () => {
    const issued = new Date("2026-09-01T00:00:00Z");
    const token = await signSessionToken(secret, issued);
    expect(await sessionIssuedAt(token, secret, issued)).toBe(issued.getTime() / 1000);
    expect(await sessionIssuedAt(token, "t".repeat(40), issued)).toBeNull();
    expect(await sessionIssuedAt(undefined, secret)).toBeNull();
  });

  test("refuses to sign with a short secret", async () => {
    await expect(signSessionToken("short")).rejects.toThrow();
  });

  test("carries the session epoch, and tokens from before epochs count as epoch 0", async () => {
    const issued = new Date("2026-09-01T00:00:00Z");
    expect(await readSessionToken(await signSessionToken(secret, issued, 3), secret, issued)).toEqual({ issuedAt: issued.getTime() / 1000, authTime: issued.getTime() / 1000, epoch: 3 });
    expect((await readSessionToken(await signSessionToken(secret, issued), secret, issued))?.epoch).toBe(0);
    const legacy = await new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setSubject("admin").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    expect((await readSessionToken(legacy, secret))?.epoch).toBe(0);
    const bad = await new SignJWT({ role: "admin", epoch: "1" }).setProtectedHeader({ alg: "HS256" }).setSubject("admin").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    expect(await readSessionToken(bad, secret)).toBeNull();
    await expect(signSessionToken(secret, issued, -1)).rejects.toThrow();
    await expect(signSessionToken(secret, issued, 1.5)).rejects.toThrow();
  });
});

describe("login lockout", () => {
  test("the per-client limit always applies", () => {
    expect(lockedOut({ perIpFailures: 4, globalFailures: 0, knownDevice: false })).toBe(false);
    expect(lockedOut({ perIpFailures: 5, globalFailures: 0, knownDevice: false })).toBe(true);
    expect(lockedOut({ perIpFailures: 5, globalFailures: 0, knownDevice: true })).toBe(true);
  });

  test("the global limit skips a device that signed in recently", () => {
    expect(lockedOut({ perIpFailures: 0, globalFailures: 29, knownDevice: false })).toBe(false);
    expect(lockedOut({ perIpFailures: 0, globalFailures: 30, knownDevice: false })).toBe(true);
    expect(lockedOut({ perIpFailures: 0, globalFailures: 500, knownDevice: true })).toBe(false);
  });
});

describe("ipBucket", () => {
  test("keeps IPv4 whole and unwraps IPv4-mapped IPv6", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket(" ::ffff:203.0.113.7 ")).toBe("203.0.113.7");
    expect(ipBucket("")).toBe("unknown");
  });

  test("counts every address in an IPv6 /64 as one client", () => {
    const a = ipBucket("2001:db8:85a3:12:1111:2222:3333:4444");
    expect(a).toBe("2001:db8:85a3:12::/64");
    expect(ipBucket("2001:0db8:85a3:0012:ffff:ffff:ffff:ffff")).toBe(a);
    expect(ipBucket("2001:DB8:85a3:12::1")).toBe(a);
    expect(ipBucket("[2001:db8:85a3:12::99]:443")).toBe(a);
    expect(ipBucket("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(ipBucket("2001:db8:85a3:13::1")).not.toBe(a);
  });

  test("leaves anything unparseable as its own bucket", () => {
    expect(ipBucket("2001:db8::85a3::1")).toBe("2001:db8::85a3::1");
    expect(ipBucket("zz::1")).toBe("zz::1");
  });
});

describe("absolute session lifetime", () => {
  const secret = "s".repeat(40);
  const day = 24 * 60 * 60 * 1000;
  const signIn = new Date("2026-09-01T00:00:00Z");
  const authTime = signIn.getTime() / 1000;

  test("refreshes keep the sign-in time, so daily use can't keep a session alive past 90 days", async () => {
    const fresh = await readSessionToken(await signSessionToken(secret, signIn), secret, signIn);
    expect(fresh?.authTime).toBe(authTime);
    // A refresh 80 days in carries the original sign-in time and only lives 10 more days.
    const at80 = new Date(signIn.getTime() + 80 * day);
    const refreshed = await signSessionToken(secret, at80, 0, authTime);
    expect((await readSessionToken(refreshed, secret, at80))?.authTime).toBe(authTime);
    expect(await verifySessionToken(refreshed, secret, new Date(signIn.getTime() + 89 * day))).toBe(true);
    expect(await verifySessionToken(refreshed, secret, new Date(signIn.getTime() + 91 * day))).toBe(false);
    expect(sessionLifetime(at80.getTime() / 1000, authTime)).toBe(10 * 24 * 60 * 60);
    await expect(signSessionToken(secret, new Date(signIn.getTime() + 91 * day), 0, authTime)).rejects.toThrow();
  });

  test("a forged auth time later than the issue time is refused", async () => {
    await expect(signSessionToken(secret, signIn, 0, authTime + 60)).rejects.toThrow();
    const bad = await new SignJWT({ role: "admin", auth_time: authTime + 60 }).setProtectedHeader({ alg: "HS256" }).setSubject("admin").setIssuedAt(authTime).setExpirationTime(authTime + 3600).sign(new TextEncoder().encode(secret));
    expect(await readSessionToken(bad, secret, signIn)).toBeNull();
  });

  test("tokens from before auth_time count from their issue time", async () => {
    const legacy = await new SignJWT({ role: "admin", epoch: 0 }).setProtectedHeader({ alg: "HS256" }).setSubject("admin").setIssuedAt(authTime).setExpirationTime(authTime + SESSION_MAX_AGE).sign(new TextEncoder().encode(secret));
    expect((await readSessionToken(legacy, secret, signIn))?.authTime).toBe(authTime);
  });
});

describe("session secret", () => {
  test("a trailing newline or space signs and verifies with the same key", async () => {
    const secret = "s".repeat(40);
    const token = await signSessionToken(`${secret}\n`);
    expect(await verifySessionToken(token, secret)).toBe(true);
    expect(await verifySessionToken(await signSessionToken(secret), ` ${secret} `)).toBe(true);
    await expect(signSessionToken(`${"s".repeat(31)}   `)).rejects.toThrow();
  });
});

describe("device cookie", () => {
  const secret = "s".repeat(40);

  test("verifies its own tokens only, and expires after a year", async () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const device = await signDeviceToken(secret, now);
    expect(await verifyDeviceToken(device, secret, now)).toBe(true);
    expect(await verifyDeviceToken(device, "t".repeat(40), now)).toBe(false);
    expect(await verifyDeviceToken(device, secret, new Date(now.getTime() + (DEVICE_MAX_AGE + 60) * 1000))).toBe(false);
    expect(await verifyDeviceToken(undefined, secret)).toBe(false);
    // Neither token passes for the other.
    expect(await verifyDeviceToken(await signSessionToken(secret, now), secret, now)).toBe(false);
    expect(await readSessionToken(device, secret, now)).toBeNull();
  });
});

describe("session-ended proof", () => {
  const secret = "s".repeat(40);
  const claims = { issuedAt: 1_780_000_000, authTime: 1_779_000_000, epoch: 2 };

  test("matches only the token it was made for", async () => {
    const proof = await endedSessionProof(claims, secret);
    expect(proof).toMatch(/^[\w-]{43}$/);
    expect(await isEndedSessionProof(proof, claims, secret)).toBe(true);
    expect(await isEndedSessionProof(proof, { ...claims, epoch: 3 }, secret)).toBe(false);
    expect(await isEndedSessionProof(proof, { ...claims, issuedAt: claims.issuedAt + 1 }, secret)).toBe(false);
    expect(await isEndedSessionProof(proof, claims, "t".repeat(40))).toBe(false);
    expect(await isEndedSessionProof(null, claims, secret)).toBe(false);
    expect(await isEndedSessionProof(`${proof}x`, claims, secret)).toBe(false);
    expect(sessionEndedPath(proof)).toBe(`/admin/login?session=ended&proof=${proof}`);
  });
});

describe("admin CSP", () => {
  test("allows only nonce'd scripts in production and never framing", () => {
    const csp = adminContentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic';");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  test("development adds eval and the hot-reload socket", () => {
    const csp = adminContentSecurityPolicy("abc123", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' ws: wss:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
