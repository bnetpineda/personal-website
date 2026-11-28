import { describe, expect, test } from "bun:test";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { BACKUP_TABLES } from "./backup";

/*
 * A new table is either in the backup or listed here with the reason it isn't, so adding one can't
 * silently leave its data out of every export.
 */
const NOT_BACKED_UP: Record<string, string> = {
  account_connections: "encrypted credentials; reconnecting an account restores it",
  login_attempts: "short-lived rate-limit records",
  admin_state: "session epoch: restoring it would sign sessions back in",
  spot_fifo: "cache, rebuilt from imported trades",
  spot_fifo_meta: "cache fingerprint, rebuilt from imported trades",
  ai_summaries: "regenerated from the data by the daily job",
  fx_rate_history: "cache of past exchange rates, refetched from Frankfurter",
  daily_job_runs: "operational log of the daily cron, pruned after 60 days",
  auto_taught_payees: "undo log for payees the daily job sorted; the rules themselves are backed up",
  ai_usage_snapshots: "telemetry cache, repushed periodically from Zephyrus-G14",
};
/** Backup keys that differ from the schema export's name. */
const KEY_TO_EXPORT: Record<string, string> = { recurring: "recurringCashFlows" };

describe("backup coverage", () => {
  test("every table is backed up or deliberately left out", () => {
    const tables = Object.entries(schema).flatMap(([name, value]) => (is(value, PgTable) ? [{ name, table: getTableName(value) }] : []));
    const backedUp = new Set<string>(BACKUP_TABLES.map(({ key }) => KEY_TO_EXPORT[key] ?? key));
    const uncovered = tables.filter(({ name, table }) => !backedUp.has(name) && !(table in NOT_BACKED_UP)).map(({ table }) => table);
    expect(uncovered).toEqual([]);
  });

  test("the lists don't name tables that no longer exist", () => {
    const names = new Set(Object.keys(schema));
    const tableNames = new Set<string>(Object.values(schema).flatMap((value) => (is(value, PgTable) ? [getTableName(value)] : [])));
    expect(BACKUP_TABLES.map(({ key }) => KEY_TO_EXPORT[key] ?? key).filter((name) => !names.has(name))).toEqual([]);
    expect(Object.keys(NOT_BACKED_UP).filter((table) => !tableNames.has(table))).toEqual([]);
  });
});
