import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { ScryptOptions } from "node:crypto";

/*
 * Admin password hashing (scrypt, no dependencies).
 * Stored format: `scrypt:N:r:p:<salt b64url>:<hash b64url>` — deliberately free of `$`,
 * because @next/env expands `$VARS` inside .env files.
 * Kept free of Next/server-only imports so `bun test` and scripts/admin-setup.mjs can load it.
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
// 128 * N * r = 32 MiB, which trips Node's default 32 MiB `maxmem` guard.
const MAX_MEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [N, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  const validParams = [N, r, p].every((n) => Number.isSafeInteger(n) && n > 0) && N <= 2 ** 20;
  if (!validParams || salt.length < 8 || expected.length < 16) return false;

  try {
    const actual = await derive(password, salt, expected.length, { N, r, p, maxmem: MAX_MEM * 4 });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
