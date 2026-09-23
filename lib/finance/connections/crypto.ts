import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { credentialsSchema, type Credentials, type Provider } from "./types";

function key(secret: string) {
  if (secret.length < 32) throw new Error("A strong encryption secret is required");
  return Buffer.from(hkdfSync("sha256", secret, "finance-connections-v1", "credentials", 32));
}

/** The provider is authenticated too, so ciphertext cannot be swapped between rows. */
export function sealCredentials(credentials: Credentials, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(credentials.provider));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openCredentials(value: string, provider: Provider, secret: string): Credentials {
  const [version, iv, tag, encrypted, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted || extra !== undefined) throw new Error("Invalid credential envelope");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(provider));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]);
  const credentials = credentialsSchema.parse(JSON.parse(plain.toString("utf8")));
  if (credentials.provider !== provider) throw new Error("Provider mismatch");
  return credentials;
}
