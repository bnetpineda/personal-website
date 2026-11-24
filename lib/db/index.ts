import "server-only";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "./schema";
import { timedFetch } from "./timed-fetch";

neonConfig.fetchFunction = timedFetch();

let db: NeonHttpDatabase<typeof schema> | undefined;

/** Neon HTTP client, created on first use so builds never need DATABASE_URL. */
export function getDb() {
  db ??= drizzle({ client: neon(env.databaseUrl()), schema });
  return db;
}
