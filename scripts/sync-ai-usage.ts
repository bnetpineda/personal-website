/*
 * Collects local AI coding usage from T3 Code on Zephyrus-G14 (Claude Code, Codex, Antigravity,
 * OpenCode) and pushes numeric aggregates to the personal website.
 *
 * Modes:
 *   bun scripts/sync-ai-usage.ts --dry-run   # Print computed summary without writing
 *   bun scripts/sync-ai-usage.ts --db        # Upsert directly into DATABASE_URL (local dev)
 *   bun scripts/sync-ai-usage.ts             # POST to $USAGE_SYNC_URL with $USAGE_SYNC_SECRET
 *
 * Zero prompts, file paths, or session text ever leave the machine.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";
import {
  buildUsageSnapshot,
  type ModelRateMap,
  type RawUsageRecord,
  type UsageBackfillFile,
} from "../lib/usage/collect";
import { aiUsageSnapshotSchema } from "../lib/usage/schema";
import { formatTokens, formatUsd, type UsageProviderId } from "../lib/usage/types";

loadEnvConfig(process.cwd());

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const directDb = args.has("--db");
const directProdDb = args.has("--prod-db");

const userdataDir = process.env.T3_USERDATA_DIR || join(homedir(), ".t3", "userdata");
const backfillDir =
  process.env.USAGE_BACKFILL_DIR || join(homedir(), ".local", "share", "personal-website-usage");
const machineId = process.env.USAGE_MACHINE_ID || "zephyrus-g14";
const machineLabel = process.env.USAGE_MACHINE_LABEL || "Zephyrus-G14";
const timezone = process.env.USAGE_TIMEZONE || "Asia/Manila";

interface ScanCacheFileEntry {
  p?: string;
  r?: unknown[][];
}

interface ScanCacheDoc {
  models?: string[];
  sessions?: string[];
  files?: Record<string, ScanCacheFileEntry>;
}

function normalizeProvider(raw: string | undefined): UsageProviderId | null {
  if (!raw) return null;
  if (raw === "claude" || raw === "claudeAgent") return "claude";
  if (raw === "codex") return "codex";
  if (raw === "antigravity") return "antigravity";
  if (raw === "opencode") return "opencode";
  return null;
}

function findLatestScanCache(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const matches = readdirSync(dir)
    .map((name) => {
      const m = /^usage-scan-cache-v(\d+)\.json$/.exec(name);
      return m ? { name, version: Number(m[1]) } : null;
    })
    .filter((x): x is { name: string; version: number } => x !== null)
    .sort((a, b) => b.version - a.version);
  return matches[0] ? join(dir, matches[0].name) : null;
}

function loadModelRates(dir: string): ModelRateMap {
  const ratesPath = join(dir, "usage-model-rates.json");
  if (!existsSync(ratesPath)) {
    throw new Error(`Missing model rates file at ${ratesPath}`);
  }
  const parsed = JSON.parse(readFileSync(ratesPath, "utf8")) as { document?: ModelRateMap };
  return parsed.document ?? {};
}

function readScanCacheRecords(dir: string): RawUsageRecord[] {
  const cachePath = findLatestScanCache(dir);
  if (!cachePath) return [];
  const doc = JSON.parse(readFileSync(cachePath, "utf8")) as ScanCacheDoc;
  const models = doc.models ?? [];
  const sessions = doc.sessions ?? [];
  const files = doc.files ?? {};
  const records: RawUsageRecord[] = [];

  for (const entry of Object.values(files)) {
    const provider = normalizeProvider(entry.p);
    if (!provider || !Array.isArray(entry.r)) continue;
    for (const r of entry.r) {
      if (!Array.isArray(r) || r.length < 8) continue;
      const ts = Number(r[0]);
      const modelIdx = Number(r[1]);
      const sessionIdx = Number(r[2]);
      if (!Number.isFinite(ts) || ts <= 0) continue;

      const model = models[modelIdx] ?? "unknown";
      const sessionId = sessions[sessionIdx] ?? `s-${sessionIdx}`;
      const uncachedInput = Number(r[3] ?? 0) || 0;
      const cacheRead = Number(r[4] ?? 0) || 0;
      const cacheWrite = Number(r[5] ?? 0) || 0;
      const output = Number(r[6] ?? 0) || 0;
      const dedupKey = typeof r[8] === "string" ? r[8] : null;
      const speedFlag = Number(r[10] ?? 0);
      const cacheWrite1h = Number(r[13] ?? 0) || 0;

      records.push({
        timestampMs: ts,
        provider,
        model,
        sessionId,
        uncachedInput,
        cacheRead,
        cacheWrite,
        cacheWrite1h,
        output,
        speed: speedFlag === 1 ? "fast" : "standard",
        dedupKey,
      });
    }
  }
  return records;
}

function readAntigravityRecords(dir: string): RawUsageRecord[] {
  const dbPath = join(dir, "statev2.sqlite");
  if (!existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true });
  try {
    // Map threadId -> latest antigravity model name
    const modelByThread = new Map<string, string>();
    const runRows = db
      .query(
        "SELECT thread_id, payload_json FROM orchestration_v2_projection_runs WHERE provider = 'antigravity'"
      )
      .all() as { thread_id: string; payload_json: string }[];
    for (const row of runRows) {
      try {
        const parsed = JSON.parse(row.payload_json) as {
          modelSelection?: { model?: string };
        };
        if (parsed.modelSelection?.model) {
          modelByThread.set(row.thread_id, parsed.modelSelection.model);
        }
      } catch {
        // Ignore malformed run payload
      }
    }

    const turnRows = db
      .query(
        "SELECT thread_id, started_at, completed_at, payload_json FROM orchestration_v2_projection_provider_turns WHERE payload_json LIKE '%antigravity%'"
      )
      .all() as {
      thread_id: string;
      started_at: string | null;
      completed_at: string | null;
      payload_json: string;
    }[];

    const records: RawUsageRecord[] = [];
    for (const row of turnRows) {
      let parsed: {
        id?: string;
        completedAt?: string;
        startedAt?: string;
        turnTokenUsage?: {
          inputTokens?: number;
          cachedInputTokens?: number;
          cacheCreationTokens?: number;
          outputTokens?: number;
        };
      };
      try {
        parsed = JSON.parse(row.payload_json);
      } catch {
        continue;
      }
      const usage = parsed.turnTokenUsage;
      if (!usage) continue;

      const tsIso = parsed.completedAt ?? row.completed_at ?? parsed.startedAt ?? row.started_at;
      const timestampMs = tsIso ? Date.parse(tsIso) : NaN;
      if (!Number.isFinite(timestampMs)) continue;

      const totalInput = Math.max(0, Number(usage.inputTokens ?? 0) || 0);
      const cacheRead = Math.max(0, Number(usage.cachedInputTokens ?? 0) || 0);
      const cacheWrite = Math.max(0, Number(usage.cacheCreationTokens ?? 0) || 0);
      const uncachedInput = Math.max(0, totalInput - cacheRead);
      const output = Math.max(0, Number(usage.outputTokens ?? 0) || 0);
      if (uncachedInput + cacheRead + cacheWrite + output <= 0) continue;

      records.push({
        timestampMs,
        provider: "antigravity",
        model: modelByThread.get(row.thread_id) ?? "gemini-4-neon",
        sessionId: row.thread_id,
        uncachedInput,
        cacheRead,
        cacheWrite,
        cacheWrite1h: 0,
        output,
        speed: "standard",
        dedupKey: parsed.id ?? `${row.thread_id}:${timestampMs}`,
      });
    }
    return records;
  } finally {
    db.close();
  }
}

function loadBackfillFiles(dir: string): UsageBackfillFile[] {
  if (!existsSync(dir)) return [];
  const files: UsageBackfillFile[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, name), "utf8")) as UsageBackfillFile;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.buckets)) {
        files.push(parsed);
      }
    } catch {
      // Ignore unreadable backfill files
    }
  }
  return files;
}

async function main() {
  const rates = loadModelRates(userdataDir);
  const scanRecords = readScanCacheRecords(userdataDir);
  const agRecords = readAntigravityRecords(userdataDir);
  const records = [...scanRecords, ...agRecords];
  const backfills = loadBackfillFiles(backfillDir);

  const snapshot = buildUsageSnapshot({
    records,
    backfills,
    rates,
    machineId,
    machineLabel,
    timezone,
  });

  const validated = aiUsageSnapshotSchema.parse(snapshot);
  const w30 = validated.windows["30d"];
  console.log(
    `[usage-sync] ${validated.machineLabel}: 30d=${formatUsd(w30.totalCost)} (${w30.sessionCount} sessions, ${formatTokens(w30.totals.processedTokens)} tokens, cache savings ${formatUsd(w30.totals.cacheSavings)})`
  );
  for (const p of w30.providers) {
    console.log(
      `  - ${p.label}: ${formatUsd(p.cost)} (${p.share.toFixed(1)}%, ${p.sessions} sessions, ${formatTokens(p.tokens)} tokens)`
    );
  }

  if (dryRun) return;

  if (directDb || directProdDb) {
    const databaseUrl = directProdDb
      ? process.env.PROD_DATABASE_URL_UNPOOLED?.trim()
      : process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new Error(
        directProdDb
          ? "PROD_DATABASE_URL_UNPOOLED must be set for --prod-db mode."
          : "DATABASE_URL must be set for --db mode."
      );
    }
    const db = drizzle({ client: neon(databaseUrl), schema });
    const now = new Date();
    await db
      .insert(schema.aiUsageSnapshots)
      .values({
        machineId: validated.machineId,
        machineLabel: validated.machineLabel,
        timezone: validated.timezone,
        snapshot: validated,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.aiUsageSnapshots.machineId,
        set: {
          machineLabel: validated.machineLabel,
          timezone: validated.timezone,
          snapshot: validated,
          updatedAt: now,
        },
      });
    console.log(
      `[usage-sync] upserted directly into ${directProdDb ? "PROD_DATABASE_URL_UNPOOLED" : "DATABASE_URL"} at ${now.toISOString()}`
    );
    return;
  }

  const syncUrl = process.env.USAGE_SYNC_URL?.trim() || "https://www.bnetpineda.dev/api/usage/sync";
  const syncSecret = process.env.USAGE_SYNC_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!syncSecret) {
    throw new Error(
      "Set USAGE_SYNC_SECRET (or CRON_SECRET), or pass --dry-run / --db / --prod-db."
    );
  }

  const res = await fetch(syncUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${syncSecret}`,
    },
    body: JSON.stringify(validated),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sync failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const ack = (await res.json()) as { ok?: boolean; updatedAt?: string };
  console.log(`[usage-sync] pushed to ${syncUrl} -> updatedAt=${ack.updatedAt ?? "ok"}`);
}

main().catch((err) => {
  console.error("[usage-sync] error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
