import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { credentialsSchema, type Credentials, type Provider } from "./types";

/*
 * Envelopes: "v1" is keyed from ADMIN_SESSION_SECRET, "v2" from CREDENTIALS_SECRET, so the session
 * secret can be rotated once every saved account is v2. Without CREDENTIALS_SECRET, everything stays v1.
 * The credentials secret defaults to the env var directly (like token.ts): lib/env.ts is server-only and
 * this file is shared with tests.
 */

type Version = "v1" | "v2";

const KDF: Record<Version, { salt: string; info: string }> = {
  v1: { salt: "finance-connections-v1", info: "credentials" },
  v2: { salt: "finance-credentials-v2", info: "account-credentials-v2" },
};

function key(version: Version, secret: string | null) {
  if (!secret || secret.length < 32) throw new Error("A strong encryption secret is required");
  return Buffer.from(hkdfSync("sha256", secret, KDF[version].salt, KDF[version].info, 32));
}

function credentialsSecretFromEnv(): string | null {
  return process.env.CREDENTIALS_SECRET?.trim() || null;
}

/**
 * The provider is authenticated too, so ciphertext cannot be swapped between rows.
 * Seals v2 when a credentials secret is set, otherwise v1 with the session secret.
 */
export function sealCredentials(
  credentials: Credentials,
  sessionSecret: string,
  credentialsSecret: string | null = credentialsSecretFromEnv()
): string {
  const version: Version = credentialsSecret ? "v2" : "v1";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(version, credentialsSecret ?? sessionSecret), iv);
  cipher.setAAD(Buffer.from(credentials.provider));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return [version, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openCredentials(
  value: string,
  provider: Provider,
  sessionSecret: string,
  credentialsSecret: string | null = credentialsSecretFromEnv()
): Credentials {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if ((version !== "v1" && version !== "v2") || !iv || !tag || !encrypted || extra !== undefined) throw new Error("Invalid credential envelope");
  const decipher = createDecipheriv("aes-256-gcm", key(version, version === "v2" ? credentialsSecret : sessionSecret), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(provider));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]);
  const credentials = credentialsSchema.parse(JSON.parse(plain.toString("utf8")));
  if (credentials.provider !== provider) throw new Error("Provider mismatch");
  return credentials;
}

/** True for a v1 envelope once a credentials secret exists: open it, then save `sealCredentials` of it. */
export function needsReseal(value: string, credentialsSecret: string | null = credentialsSecretFromEnv()): boolean {
  return Boolean(credentialsSecret) && value.startsWith("v1.");
}
