import "server-only";

/*
 * Lazy, per-variable env access for the admin area. Nothing is read at import time,
 * so `next build` (and the public site) never needs these secrets to exist.
 */

function required(name: string, check?: (value: string) => boolean): string {
  const value = process.env[name]?.trim();
  if (!value || (check && !check(value))) {
    throw new Error(`Missing or invalid env var ${name}. See .env.example.`);
  }
  return value;
}

function optional(name: string, check?: (value: string) => boolean): string | undefined {
  const value = process.env[name]?.trim() || undefined;
  if (value && check && !check(value)) throw new Error(`Invalid env var ${name}. See .env.example.`);
  return value;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL", (v) => /^postgres(ql)?:\/\//.test(v)),
  adminPasswordHash: () => required("ADMIN_PASSWORD_HASH", (v) => v.startsWith("scrypt:")),
  sessionSecret: () => required("ADMIN_SESSION_SECRET", (v) => v.length >= 32),
  /** Encrypts saved account credentials (v2 envelopes). Unset: they stay keyed from the session secret (v1). */
  credentialsSecret: () => optional("CREDENTIALS_SECRET", (v) => v.length >= 32),
  cronSecret: () => optional("CRON_SECRET"),
  coingeckoApiKey: () => optional("COINGECKO_API_KEY"),
  aiGatewayApiKey: () => optional("AI_GATEWAY_API_KEY"),
  aiCategorizeModel: () => optional("AI_CATEGORIZE_MODEL") ?? "anthropic/claude-haiku-4.5",
  /** Writes the Overview's short feedback; the cheapest capable model is plenty for a few lines. */
  aiSummaryModel: () => optional("AI_SUMMARY_MODEL") ?? "anthropic/claude-haiku-5.5",
};
