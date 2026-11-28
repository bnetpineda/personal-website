import { z } from "zod";
import type { AiUsageSnapshot } from "./types";

const nonNeg = z.number().finite().min(0);
const nonNegInt = z.number().int().min(0);
const providerId = z.enum(["claude", "codex", "antigravity", "opencode"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const providerSummarySchema = z.object({
  id: providerId,
  label: z.string().min(1).max(40),
  sessions: nonNegInt,
  cost: nonNeg,
  share: z.number().finite().min(0).max(100),
  tokens: nonNeg,
});

const dailyPointSchema = z.object({
  date: isoDate,
  total: nonNeg,
  claude: nonNeg,
  codex: nonNeg,
  antigravity: nonNeg,
  opencode: nonNeg,
});

const totalsSchema = z.object({
  processedTokens: nonNeg,
  cachedInputTokens: nonNeg,
  uncachedInputTokens: nonNeg,
  cacheWriteTokens: nonNeg,
  outputTokens: nonNeg,
  cacheSavings: nonNeg,
});

const costByTypeSchema = z.object({
  input: nonNeg,
  cacheRead: nonNeg,
  cacheWrite: nonNeg,
  output: nonNeg,
});

const costBySpeedSchema = z.object({
  standard: nonNeg,
  fast: nonNeg,
  premium: nonNeg,
});

const modelRowSchema = z.object({
  provider: providerId,
  model: z.string().min(1).max(120),
  cost: nonNeg,
  share: z.number().finite().min(0).max(100),
  tokens: nonNeg,
  sessions: nonNegInt,
});

const dayRowSchema = z.object({
  date: isoDate,
  cost: nonNeg,
  share: z.number().finite().min(0).max(100),
  tokens: nonNeg,
  sessions: nonNegInt,
  topProvider: providerId,
});

const windowSummarySchema = z.object({
  totalCost: nonNeg,
  sessionCount: nonNegInt,
  providers: z.array(providerSummarySchema).max(10),
  daily: z.array(dailyPointSchema).max(400),
  totals: totalsSchema,
  costByType: costByTypeSchema,
  costBySpeed: costBySpeedSchema,
  models: z.array(modelRowSchema).max(100),
  days: z.array(dayRowSchema).max(400),
});

export const aiUsageSnapshotSchema: z.ZodType<AiUsageSnapshot> = z.object({
  version: z.literal(1),
  machineId: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  machineLabel: z.string().min(1).max(64),
  timezone: z.string().min(1).max(64),
  generatedAt: z.string().datetime(),
  windows: z.object({
    "7d": windowSummarySchema,
    "30d": windowSummarySchema,
    all: windowSummarySchema,
  }),
});
