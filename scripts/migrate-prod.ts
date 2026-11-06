/*
 * Applies pending migrations to production (Neon `main`). Run before pushing code that needs them:
 *   bun run db:migrate:prod
 * Reads PROD_DATABASE_URL_UNPOOLED from .env.local (gitignored); `bun run db:migrate` stays on dev.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const url = process.env.PROD_DATABASE_URL_UNPOOLED;
if (!url || url.includes("-pooler")) {
  console.error("Set PROD_DATABASE_URL_UNPOOLED in .env.local to production's direct (unpooled) Neon URL.");
  process.exit(1);
}
console.log(`Migrating production: ${new URL(url).host}`);
const run = Bun.spawnSync(["bunx", "drizzle-kit", "migrate"], { env: { ...process.env, DRIZZLE_TARGET: "production" }, stdout: "inherit", stderr: "inherit" });
process.exit(run.exitCode ?? 1);
