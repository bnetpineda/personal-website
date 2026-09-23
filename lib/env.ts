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

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export const env = {
  databaseUrl: () => required("DATABASE_URL", (v) => /^postgres(ql)?:\/\//.test(v)),
  adminPasswordHash: () => required("ADMIN_PASSWORD_HASH", (v) => v.startsWith("scrypt:")),
  sessionSecret: () => required("ADMIN_SESSION_SECRET", (v) => v.length >= 32),
  cronSecret: () => optional("CRON_SECRET"),
  finnhubApiKey: () => optional("FINNHUB_API_KEY"),
  coingeckoApiKey: () => optional("COINGECKO_API_KEY"),
  aiGatewayApiKey: () => optional("AI_GATEWAY_API_KEY"),
  aiCategorizeModel: () => optional("AI_CATEGORIZE_MODEL") ?? "anthropic/claude-haiku-4.5",
};
