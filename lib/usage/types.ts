export type UsageProviderId = "claude" | "codex" | "antigravity" | "opencode";

export type UsageRangeKey = "7d" | "30d" | "all";

export interface UsageProviderSummary {
  id: UsageProviderId;
  label: string;
  sessions: number;
  cost: number;
  share: number;
  tokens: number;
}

export interface UsageDailyPoint {
  date: string; // YYYY-MM-DD in machine timezone
  total: number;
  claude: number;
  codex: number;
  antigravity: number;
  opencode: number;
}

export interface UsageTotals {
  processedTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  cacheSavings: number;
}

export interface UsageCostByType {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

export interface UsageCostBySpeed {
  standard: number;
  fast: number;
  premium: number;
}

export interface UsageModelRow {
  provider: UsageProviderId;
  model: string;
  cost: number;
  share: number;
  tokens: number;
  sessions: number;
}

export interface UsageDayRow {
  date: string;
  cost: number;
  share: number;
  tokens: number;
  sessions: number;
  topProvider: UsageProviderId;
}

export interface UsageWindowSummary {
  totalCost: number;
  sessionCount: number;
  providers: UsageProviderSummary[];
  daily: UsageDailyPoint[];
  totals: UsageTotals;
  costByType: UsageCostByType;
  costBySpeed: UsageCostBySpeed;
  models: UsageModelRow[];
  days: UsageDayRow[];
}

export interface AiUsageSnapshot {
  version: 1;
  machineId: string;
  machineLabel: string;
  timezone: string;
  generatedAt: string; // ISO-8601 UTC timestamp
  windows: Record<UsageRangeKey, UsageWindowSummary>;
}

export interface AiUsagePayload {
  snapshot: AiUsageSnapshot;
  updatedAt: string;
}

export const USAGE_PROVIDER_META: Record<
  UsageProviderId,
  { label: string; shortLabel: string; color: string }
> = {
  claude: { label: "Claude Code", shortLabel: "Claude", color: "var(--chart-6)" },
  codex: { label: "Codex", shortLabel: "Codex", color: "var(--chart-1)" },
  antigravity: { label: "Antigravity", shortLabel: "Antigravity", color: "var(--chart-5)" },
  opencode: { label: "OpenCode", shortLabel: "OpenCode", color: "var(--chart-2)" },
};

export const USAGE_PROVIDER_ORDER: readonly UsageProviderId[] = [
  "claude",
  "codex",
  "antigravity",
  "opencode",
];

const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdAxis = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return "$0.00";
  return usdFull.format(value);
}

export function formatUsdAxis(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  if (value >= 100) return usdAxis.format(value);
  return usdFull.format(value);
}

export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count >= 1e9) return `${(count / 1e9).toFixed(count >= 10e9 ? 1 : 2).replace(/\.0+$/, "")}B`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(count >= 100e6 ? 0 : count >= 10e6 ? 1 : 2).replace(/\.0+$/, "")}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(count >= 100e3 ? 0 : 1).replace(/\.0+$/, "")}K`;
  return Math.round(count).toLocaleString("en-US");
}

export function formatShare(share: number): string {
  if (!Number.isFinite(share) || share <= 0) return "0.0%";
  return `${share.toFixed(1)}%`;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Formats "2026-11-28" as "NOV 28". */
export function formatAxisDay(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (monthIdx < 0 || monthIdx > 11 || !Number.isFinite(day)) return isoDate;
  return `${MONTHS[monthIdx]} ${day}`;
}

/** Formats "2026-11-28" as "Nov 28, 2026". */
export function formatLongDay(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (monthIdx < 0 || monthIdx > 11 || !Number.isFinite(day)) return isoDate;
  const m = MONTHS[monthIdx][0] + MONTHS[monthIdx].slice(1).toLowerCase();
  return `${m} ${day}, ${parts[0]}`;
}

export function formatRelativeAge(isoTimestamp: string, nowMs = Date.now()): string {
  const ts = Date.parse(isoTimestamp);
  if (!Number.isFinite(ts)) return "recently";
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
