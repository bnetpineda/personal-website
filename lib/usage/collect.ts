import {
  USAGE_PROVIDER_META,
  USAGE_PROVIDER_ORDER,
  type AiUsageSnapshot,
  type UsageDailyPoint,
  type UsageDayRow,
  type UsageModelRow,
  type UsageProviderId,
  type UsageProviderSummary,
  type UsageRangeKey,
  type UsageWindowSummary,
} from "./types";

export interface RawUsageRecord {
  timestampMs: number;
  provider: UsageProviderId;
  model: string;
  sessionId: string;
  uncachedInput: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  output: number;
  speed: "standard" | "fast";
  dedupKey?: string | null;
}

export interface ModelRateEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;
  cache_creation_input_token_cost?: number;
  cache_creation_input_token_cost_above_1hr?: number;
  input_cost_per_token_priority?: number;
  output_cost_per_token_priority?: number;
  cache_read_input_token_cost_priority?: number;
  cache_creation_input_token_cost_priority?: number;
  input_cost_per_token_above_100k_tokens?: number;
  output_cost_per_token_above_100k_tokens?: number;
  cache_read_input_token_cost_above_100k_tokens?: number;
  cache_creation_input_token_cost_above_100k_tokens?: number;
  cache_creation_input_token_cost_above_1hr_above_100k_tokens?: number;
  input_cost_per_token_above_272k_tokens?: number;
  output_cost_per_token_above_272k_tokens?: number;
  cache_read_input_token_cost_above_272k_tokens?: number;
  cache_creation_input_token_cost_above_272k_tokens?: number;
  input_cost_per_token_above_272k_tokens_priority?: number;
  output_cost_per_token_above_272k_tokens_priority?: number;
  cache_read_input_token_cost_above_272k_tokens_priority?: number;
  cache_creation_input_token_cost_above_272k_tokens_priority?: number;
  provider_specific_entry?: { fast?: number; us?: number };
}

export type ModelRateMap = Record<string, ModelRateEntry>;

export interface PricedRecord extends RawUsageRecord {
  day: string;
  inputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  outputCost: number;
  totalCost: number;
  standardCost: number;
  fastCost: number;
  fastPremium: number;
  cacheSavings: number;
  processedTokens: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function lookupModelRate(rates: ModelRateMap, model: string): ModelRateEntry | null {
  if (!model) return null;
  const candidates = [
    model,
    `anthropic/${model}`,
    `openai/${model}`,
    `gemini/${model}`,
    `google/${model}`,
  ];
  for (const key of candidates) {
    if (rates[key]) return rates[key];
  }
  const suffix = `/${model}`;
  for (const [key, entry] of Object.entries(rates)) {
    if (key.endsWith(suffix)) return entry;
  }
  return null;
}

export function priceRecord(
  record: RawUsageRecord,
  rate: ModelRateEntry | null,
  day: string
): PricedRecord {
  const uncachedInput = Math.max(0, record.uncachedInput);
  const cacheRead = Math.max(0, record.cacheRead);
  const cacheWriteTotal = Math.max(0, record.cacheWrite);
  const cacheWrite1h = Math.min(cacheWriteTotal, Math.max(0, record.cacheWrite1h));
  const cacheWrite5m = Math.max(0, cacheWriteTotal - cacheWrite1h);
  const output = Math.max(0, record.output);
  const processedTokens = uncachedInput + cacheRead + cacheWriteTotal + output;

  if (!rate) {
    return {
      ...record,
      day,
      inputCost: 0,
      cacheReadCost: 0,
      cacheWriteCost: 0,
      outputCost: 0,
      totalCost: 0,
      standardCost: 0,
      fastCost: 0,
      fastPremium: 0,
      cacheSavings: 0,
      processedTokens,
    };
  }

  const totalContextInput = uncachedInput + cacheRead + cacheWriteTotal;
  const above272k = totalContextInput > 272_000 && rate.input_cost_per_token_above_272k_tokens != null;
  const above100k = !above272k && totalContextInput > 100_000 && rate.input_cost_per_token_above_100k_tokens != null;

  const stdInRate = above272k
    ? (rate.input_cost_per_token_above_272k_tokens ?? rate.input_cost_per_token ?? 0)
    : above100k
      ? (rate.input_cost_per_token_above_100k_tokens ?? rate.input_cost_per_token ?? 0)
      : (rate.input_cost_per_token ?? 0);

  const stdOutRate = above272k
    ? (rate.output_cost_per_token_above_272k_tokens ?? rate.output_cost_per_token ?? 0)
    : above100k
      ? (rate.output_cost_per_token_above_100k_tokens ?? rate.output_cost_per_token ?? 0)
      : (rate.output_cost_per_token ?? 0);

  const stdCrRate = above272k
    ? (rate.cache_read_input_token_cost_above_272k_tokens ?? rate.cache_read_input_token_cost ?? stdInRate * 0.1)
    : above100k
      ? (rate.cache_read_input_token_cost_above_100k_tokens ?? rate.cache_read_input_token_cost ?? stdInRate * 0.1)
      : (rate.cache_read_input_token_cost ?? stdInRate * 0.1);

  const stdCw5mRate = above272k
    ? (rate.cache_creation_input_token_cost_above_272k_tokens ?? rate.cache_creation_input_token_cost ?? stdInRate * 1.25)
    : above100k
      ? (rate.cache_creation_input_token_cost_above_100k_tokens ?? rate.cache_creation_input_token_cost ?? stdInRate * 1.25)
      : (rate.cache_creation_input_token_cost ?? stdInRate * 1.25);

  const stdCw1hRate = above100k
    ? (rate.cache_creation_input_token_cost_above_1hr_above_100k_tokens ??
        rate.cache_creation_input_token_cost_above_1hr ??
        stdCw5mRate * 1.6)
    : (rate.cache_creation_input_token_cost_above_1hr ?? stdCw5mRate * 1.6);

  const stdInputCost = uncachedInput * stdInRate;
  const stdCacheReadCost = cacheRead * stdCrRate;
  const stdCacheWriteCost = cacheWrite5m * stdCw5mRate + cacheWrite1h * stdCw1hRate;
  const stdOutputCost = output * stdOutRate;
  const stdTotal = stdInputCost + stdCacheReadCost + stdCacheWriteCost + stdOutputCost;

  if (record.speed !== "fast") {
    const cacheSavings = Math.max(0, cacheRead * (stdInRate - stdCrRate));
    return {
      ...record,
      day,
      inputCost: stdInputCost,
      cacheReadCost: stdCacheReadCost,
      cacheWriteCost: stdCacheWriteCost,
      outputCost: stdOutputCost,
      totalCost: stdTotal,
      standardCost: stdTotal,
      fastCost: 0,
      fastPremium: 0,
      cacheSavings,
      processedTokens,
    };
  }

  const fastMultiplier = rate.provider_specific_entry?.fast ?? 2;
  const fastInRate = above272k
    ? (rate.input_cost_per_token_above_272k_tokens_priority ?? stdInRate * fastMultiplier)
    : (rate.input_cost_per_token_priority ?? stdInRate * fastMultiplier);
  const fastOutRate = above272k
    ? (rate.output_cost_per_token_above_272k_tokens_priority ?? stdOutRate * fastMultiplier)
    : (rate.output_cost_per_token_priority ?? stdOutRate * fastMultiplier);
  const fastCrRate = above272k
    ? (rate.cache_read_input_token_cost_above_272k_tokens_priority ?? stdCrRate * fastMultiplier)
    : (rate.cache_read_input_token_cost_priority ?? stdCrRate * fastMultiplier);
  const fastCw5mRate = above272k
    ? (rate.cache_creation_input_token_cost_above_272k_tokens_priority ?? stdCw5mRate * fastMultiplier)
    : (rate.cache_creation_input_token_cost_priority ?? stdCw5mRate * fastMultiplier);
  const fastCw1hRate = stdCw1hRate * fastMultiplier;

  const inputCost = uncachedInput * fastInRate;
  const cacheReadCost = cacheRead * fastCrRate;
  const cacheWriteCost = cacheWrite5m * fastCw5mRate + cacheWrite1h * fastCw1hRate;
  const outputCost = output * fastOutRate;
  const totalCost = inputCost + cacheReadCost + cacheWriteCost + outputCost;
  const fastPremium = Math.max(0, totalCost - stdTotal);
  const cacheSavings = Math.max(0, cacheRead * (fastInRate - fastCrRate));

  return {
    ...record,
    day,
    inputCost,
    cacheReadCost,
    cacheWriteCost,
    outputCost,
    totalCost,
    standardCost: 0,
    fastCost: totalCost,
    fastPremium,
    cacheSavings,
    processedTokens,
  };
}

function makeDayFormatter(timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (tsMs: number) => fmt.format(new Date(tsMs));
}

function shiftIsoDay(isoDate: string, deltaDays: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function enumerateDays(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let cur = startIso;
  let guard = 0;
  while (cur <= endIso && guard < 400) {
    out.push(cur);
    cur = shiftIsoDay(cur, 1);
    guard += 1;
  }
  return out;
}

function summarizeWindow(
  records: readonly PricedRecord[],
  startDay: string,
  endDay: string
): UsageWindowSummary {
  const filtered = records.filter((r) => r.day >= startDay && r.day <= endDay);

  let totalCost = 0;
  let inputCost = 0;
  let cacheReadCost = 0;
  let cacheWriteCost = 0;
  let outputCost = 0;
  let standardCost = 0;
  let fastCost = 0;
  let fastPremium = 0;

  let processedTokens = 0;
  let cachedInputTokens = 0;
  let uncachedInputTokens = 0;
  let cacheWriteTokens = 0;
  let outputTokens = 0;
  let cacheSavings = 0;

  const allSessions = new Set<string>();
  const providerAgg = new Map<
    UsageProviderId,
    { sessions: Set<string>; cost: number; tokens: number }
  >();
  const modelAgg = new Map<
    string,
    { provider: UsageProviderId; model: string; sessions: Set<string>; cost: number; tokens: number }
  >();
  const dayAgg = new Map<
    string,
    {
      sessions: Set<string>;
      total: number;
      tokens: number;
      byProvider: Record<UsageProviderId, number>;
    }
  >();

  for (const r of filtered) {
    totalCost += r.totalCost;
    inputCost += r.inputCost;
    cacheReadCost += r.cacheReadCost;
    cacheWriteCost += r.cacheWriteCost;
    outputCost += r.outputCost;
    standardCost += r.standardCost;
    fastCost += r.fastCost;
    fastPremium += r.fastPremium;

    processedTokens += r.processedTokens;
    cachedInputTokens += r.cacheRead;
    uncachedInputTokens += r.uncachedInput;
    cacheWriteTokens += r.cacheWrite;
    outputTokens += r.output;
    cacheSavings += r.cacheSavings;

    const sessionKey = `${r.provider}:${r.sessionId}`;
    allSessions.add(sessionKey);

    let pAcc = providerAgg.get(r.provider);
    if (!pAcc) {
      pAcc = { sessions: new Set(), cost: 0, tokens: 0 };
      providerAgg.set(r.provider, pAcc);
    }
    pAcc.sessions.add(sessionKey);
    pAcc.cost += r.totalCost;
    pAcc.tokens += r.processedTokens;

    const modelKey = `${r.provider}:${r.model}`;
    let mAcc = modelAgg.get(modelKey);
    if (!mAcc) {
      mAcc = { provider: r.provider, model: r.model, sessions: new Set(), cost: 0, tokens: 0 };
      modelAgg.set(modelKey, mAcc);
    }
    mAcc.sessions.add(sessionKey);
    mAcc.cost += r.totalCost;
    mAcc.tokens += r.processedTokens;

    let dAcc = dayAgg.get(r.day);
    if (!dAcc) {
      dAcc = {
        sessions: new Set(),
        total: 0,
        tokens: 0,
        byProvider: { claude: 0, codex: 0, antigravity: 0, opencode: 0 },
      };
      dayAgg.set(r.day, dAcc);
    }
    dAcc.sessions.add(sessionKey);
    dAcc.total += r.totalCost;
    dAcc.tokens += r.processedTokens;
    dAcc.byProvider[r.provider] += r.totalCost;
  }

  const pct = (part: number) => (totalCost > 0 ? round2((part / totalCost) * 100) : 0);

  const providers: UsageProviderSummary[] = [...providerAgg.entries()]
    .map(([id, acc]) => ({
      id,
      label: USAGE_PROVIDER_META[id].label,
      sessions: acc.sessions.size,
      cost: round2(acc.cost),
      share: pct(acc.cost),
      tokens: Math.round(acc.tokens),
    }))
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);

  const allDays = enumerateDays(startDay, endDay);
  const daily: UsageDailyPoint[] = allDays.map((date) => {
    const acc = dayAgg.get(date);
    return {
      date,
      total: round4(acc?.total ?? 0),
      claude: round4(acc?.byProvider.claude ?? 0),
      codex: round4(acc?.byProvider.codex ?? 0),
      antigravity: round4(acc?.byProvider.antigravity ?? 0),
      opencode: round4(acc?.byProvider.opencode ?? 0),
    };
  });

  const models: UsageModelRow[] = [...modelAgg.values()]
    .map((m) => ({
      provider: m.provider,
      model: m.model,
      cost: round2(m.cost),
      share: pct(m.cost),
      tokens: Math.round(m.tokens),
      sessions: m.sessions.size,
    }))
    .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens)
    .slice(0, 50);

  const days: UsageDayRow[] = [...dayAgg.entries()]
    .map(([date, acc]) => {
      let topProvider: UsageProviderId = "claude";
      let topVal = -1;
      for (const pid of USAGE_PROVIDER_ORDER) {
        if (acc.byProvider[pid] > topVal) {
          topVal = acc.byProvider[pid];
          topProvider = pid;
        }
      }
      return {
        date,
        cost: round2(acc.total),
        share: pct(acc.total),
        tokens: Math.round(acc.tokens),
        sessions: acc.sessions.size,
        topProvider,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    totalCost: round2(totalCost),
    sessionCount: allSessions.size,
    providers,
    daily,
    totals: {
      processedTokens: Math.round(processedTokens),
      cachedInputTokens: Math.round(cachedInputTokens),
      uncachedInputTokens: Math.round(uncachedInputTokens),
      cacheWriteTokens: Math.round(cacheWriteTokens),
      outputTokens: Math.round(outputTokens),
      cacheSavings: round2(cacheSavings),
    },
    costByType: {
      input: round2(inputCost),
      cacheRead: round2(cacheReadCost),
      cacheWrite: round2(cacheWriteCost),
      output: round2(outputCost),
    },
    costBySpeed: {
      standard: round2(standardCost),
      fast: round2(fastCost),
      premium: round2(fastPremium),
    },
    models,
    days,
  };
}

export function buildUsageSnapshot(options: {
  records: readonly RawUsageRecord[];
  rates: ModelRateMap;
  machineId: string;
  machineLabel: string;
  timezone: string;
  nowMs?: number;
}): AiUsageSnapshot {
  const nowMs = options.nowMs ?? Date.now();
  const toDay = makeDayFormatter(options.timezone);
  const today = toDay(nowMs);

  const seenDedup = new Set<string>();
  const priced: PricedRecord[] = [];
  for (const raw of options.records) {
    if (raw.dedupKey) {
      if (seenDedup.has(raw.dedupKey)) continue;
      seenDedup.add(raw.dedupKey);
    }
    const rate = lookupModelRate(options.rates, raw.model);
    priced.push(priceRecord(raw, rate, toDay(raw.timestampMs)));
  }

  const start7d = shiftIsoDay(today, -6);
  const start30d = shiftIsoDay(today, -29);
  let earliest = start30d;
  for (const r of priced) {
    if (r.day < earliest) earliest = r.day;
  }
  const minAllowed = shiftIsoDay(today, -364);
  const startAll = earliest < minAllowed ? minAllowed : earliest;

  const windows: Record<UsageRangeKey, UsageWindowSummary> = {
    "7d": summarizeWindow(priced, start7d, today),
    "30d": summarizeWindow(priced, start30d, today),
    all: summarizeWindow(priced, startAll, today),
  };

  return {
    version: 1,
    machineId: options.machineId,
    machineLabel: options.machineLabel,
    timezone: options.timezone,
    generatedAt: new Date(nowMs).toISOString(),
    windows,
  };
}
