import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "./password";
import { SESSION_MAX_AGE, sessionIssuedAt, signSessionToken, verifySessionToken } from "./token";

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
});
