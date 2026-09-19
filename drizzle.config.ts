import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Same env files Next uses (.env.local etc.); variables already set in the shell win.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations need a direct (unpooled) connection.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
