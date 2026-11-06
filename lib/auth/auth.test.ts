import { describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { lockedOut } from "./lockout";
import { hashPassword, verifyPassword } from "./password";
import { SESSION_MAX_AGE, readSessionToken, sessionIssuedAt, signSessionToken, verifySessionToken } from "./token";

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
    expect(await readSessionToken(await signSessionToken(secret, issued, 3), secret, issued)).toEqual({ issuedAt: issued.getTime() / 1000, epoch: 3 });
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
