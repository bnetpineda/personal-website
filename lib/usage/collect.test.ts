import { describe, expect, test } from "bun:test";
import { buildUsageSnapshot, lookupModelRate, type ModelRateMap, type RawUsageRecord } from "./collect";
import { aiUsageSnapshotSchema } from "./schema";

const SAMPLE_RATES: ModelRateMap = {
  "claude-opus-5-5": {
    input_cost_per_token: 4e-6,
    output_cost_per_token: 2e-5,
    cache_read_input_token_cost: 2e-7,
    cache_creation_input_token_cost: 5e-6,
    cache_creation_input_token_cost_above_1hr: 8e-6,
    provider_specific_entry: { fast: 2 },
  },
  "gpt-6.2-sol": {
    input_cost_per_token: 2e-6,
    output_cost_per_token: 1e-5,
    cache_read_input_token_cost: 1e-7,
    cache_creation_input_token_cost: 2.5e-6,
    input_cost_per_token_priority: 4e-6,
    output_cost_per_token_priority: 2e-5,
    cache_read_input_token_cost_priority: 2e-7,
  },
  "gemini/gemini-4-neon": {
    input_cost_per_token: 3e-6,
    output_cost_per_token: 1.5e-5,
    cache_read_input_token_cost: 1.5e-7,
  },
};

describe("usage snapshot aggregation", () => {
  test("resolves exact and provider-prefixed model rates", () => {
    expect(lookupModelRate(SAMPLE_RATES, "claude-opus-5-5")?.input_cost_per_token).toBe(4e-6);
    expect(lookupModelRate(SAMPLE_RATES, "gemini-4-neon")?.input_cost_per_token).toBe(3e-6);
  });

  test("deduplicates records, computes fast premiums and cache savings, and passes schema validation", () => {
    const nowMs = Date.parse("2026-11-28T12:00:00.000Z");
    const records: RawUsageRecord[] = [
      {
        timestampMs: Date.parse("2026-11-28T08:00:00.000Z"),
        provider: "claude",
        model: "claude-opus-5-5",
        sessionId: "s1",
        uncachedInput: 100_000,
        cacheRead: 1_000_000,
        cacheWrite: 100_000,
        cacheWrite1h: 50_000,
        output: 50_000,
        speed: "standard",
        dedupKey: "dup-1",
      },
      // Duplicate record should be ignored
      {
        timestampMs: Date.parse("2026-11-28T08:00:00.000Z"),
        provider: "claude",
        model: "claude-opus-5-5",
        sessionId: "s1",
        uncachedInput: 100_000,
        cacheRead: 1_000_000,
        cacheWrite: 100_000,
        cacheWrite1h: 50_000,
        output: 50_000,
        speed: "standard",
        dedupKey: "dup-1",
      },
      {
        timestampMs: Date.parse("2026-11-27T08:00:00.000Z"),
        provider: "codex",
        model: "gpt-6.2-sol",
        sessionId: "s2",
        uncachedInput: 100_000,
        cacheRead: 1_000_000,
        cacheWrite: 0,
        cacheWrite1h: 0,
        output: 50_000,
        speed: "fast",
        dedupKey: "codex-1",
      },
      {
        timestampMs: Date.parse("2026-11-28T09:00:00.000Z"),
        provider: "antigravity",
        model: "gemini-4-neon",
        sessionId: "s3",
        uncachedInput: 200_000,
        cacheRead: 1_000_000,
        cacheWrite: 0,
        cacheWrite1h: 0,
        output: 40_000,
        speed: "standard",
        dedupKey: "ag-1",
      },
    ];

    const snapshot = buildUsageSnapshot({
      records,
      rates: SAMPLE_RATES,
      machineId: "zephyrus-g14",
      machineLabel: "Zephyrus-G14",
      timezone: "Asia/Manila",
      nowMs,
    });

    expect(aiUsageSnapshotSchema.safeParse(snapshot).success).toBe(true);
    const w30 = snapshot.windows["30d"];
    expect(w30.sessionCount).toBe(3);
    expect(w30.daily).toHaveLength(30);
    expect(snapshot.windows["7d"].daily).toHaveLength(7);

    // Claude: in 0.40 + cr 0.20 + cw5m 0.25 + cw1h 0.40 + out 1.00 = 2.25
    // Codex (fast 2x priority): std = 0.20 + 0.10 + 0.50 = 0.80 -> fast = 1.60, premium = 0.80
    // Antigravity: in 0.60 + cr 0.15 + out 0.60 = 1.35
    expect(w30.totalCost).toBe(5.2);
    expect(w30.costBySpeed.standard).toBe(3.6);
    expect(w30.costBySpeed.fast).toBe(1.6);
    expect(w30.costBySpeed.premium).toBe(0.8);
    expect(w30.totals.cacheSavings).toBe(10.45);
    expect(w30.providers.map((p) => p.id)).toEqual(["claude", "codex", "antigravity"]);
  });

  test("merges historical backfill buckets cleanly across sliding windows without session collisions", () => {
    const nowMs = Date.parse("2026-11-29T00:00:00.000Z");
    const snapshot = buildUsageSnapshot({
      records: [
        {
          timestampMs: Date.parse("2026-11-28T08:00:00.000Z"),
          provider: "claude",
          model: "claude-opus-5-5",
          sessionId: "0",
          uncachedInput: 100_000,
          cacheRead: 0,
          cacheWrite: 0,
          cacheWrite1h: 0,
          output: 0,
          speed: "standard",
          dedupKey: "z-1",
        },
      ],
      backfills: [
        {
          version: 1,
          machineId: "desktop-4a7jm3l",
          timezone: "Asia/Manila",
          generatedAt: "2026-11-28T16:00:00.000Z",
          buckets: [
            // Inside 30d but outside 7d
            ["2026-11-10", "claude", "claude-opus-5-5", "standard", [0, 1], 1000, 2000, 0, 0, 500, 10, 2, 0, 8, 20, 0, 0, 15],
            // Inside 7d with same session index 0 (should NOT collide with Zephyrus sessionId "0")
            ["2026-11-25", "opencode", "gpt-6.2-sol", "fast", [0], 500, 0, 0, 0, 200, 2, 0, 0, 3, 0, 5, 2.5, 0],
          ],
        },
      ],
      rates: SAMPLE_RATES,
      machineId: "zephyrus-g14",
      machineLabel: "Zephyrus-G14",
      timezone: "Asia/Manila",
      nowMs,
    });

    expect(aiUsageSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(snapshot.windows["7d"].totalCost).toBe(5.4);
    expect(snapshot.windows["7d"].sessionCount).toBe(2);
    expect(snapshot.windows["30d"].totalCost).toBe(25.4);
    expect(snapshot.windows["30d"].sessionCount).toBe(4);
  });
});
