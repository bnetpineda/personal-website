"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Info, RefreshCw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { USAGE_PROVIDER_ICONS } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { SegmentedBar, type SegmentedBarItem } from "@/components/ui/segmented-bar";
import { Separator } from "@/components/ui/separator";
import { Swatch } from "@/components/ui/swatch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  USAGE_PROVIDER_META,
  USAGE_PROVIDER_ORDER,
  formatAxisDay,
  formatLongDay,
  formatRelativeAge,
  formatShare,
  formatTokens,
  formatUsd,
  formatUsdAxis,
  type AiUsagePayload,
  type UsageProviderId,
  type UsageRangeKey,
} from "@/lib/usage/types";

const POLL_INTERVAL_MS = 60_000;
const TICK_INTERVAL_MS = 30_000;

const RANGE_OPTIONS: readonly { key: UsageRangeKey; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "all", label: "All" },
];

const CHART_CONFIG = {
  claude: {
    label: USAGE_PROVIDER_META.claude.label,
    color: USAGE_PROVIDER_META.claude.color,
  },
  codex: {
    label: USAGE_PROVIDER_META.codex.label,
    color: USAGE_PROVIDER_META.codex.color,
  },
  antigravity: {
    label: USAGE_PROVIDER_META.antigravity.label,
    color: USAGE_PROVIDER_META.antigravity.color,
  },
  opencode: {
    label: USAGE_PROVIDER_META.opencode.label,
    color: USAGE_PROVIDER_META.opencode.color,
  },
} satisfies ChartConfig;

const COST_TYPE_COLORS = {
  input: "var(--chart-4)",
  cacheRead: "var(--chart-2)",
  cacheWrite: "var(--chart-5)",
  output: "var(--chart-6)",
} as const;

const COST_SPEED_COLORS = {
  standard: "var(--chart-1)",
  fast: "var(--chart-3)",
} as const;

function ProviderBadgeIcon({ id }: { id: UsageProviderId }) {
  const Icon = USAGE_PROVIDER_ICONS[id];
  return <Icon className="size-4 shrink-0 text-foreground" />;
}

export function AiUsageDashboard({ initial }: { initial: AiUsagePayload | null }) {
  const [payload, setPayload] = useState<AiUsagePayload | null>(initial);
  const [range, setRange] = useState<UsageRangeKey>("30d");
  const [breakdown, setBreakdown] = useState<"model" | "day">("model");
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const gradientPrefix = useId().replace(/:/g, "");

  const fetchLatest = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setRefreshing(true);
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { snapshot?: AiUsagePayload["snapshot"] | null; updatedAt?: string | null };
      if (data.snapshot && data.updatedAt) {
        setPayload({ snapshot: data.snapshot, updatedAt: data.updatedAt });
      }
    } catch {
      // Keep last good snapshot on transient network errors.
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
    const tick = setInterval(() => setNowMs(Date.now()), TICK_INTERVAL_MS);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchLatest(false);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [fetchLatest]);

  const snapshot = payload?.snapshot ?? null;
  const activeWindow = snapshot?.windows[range] ?? null;

  const activeProviders = useMemo(() => {
    if (!activeWindow) return [] as UsageProviderId[];
    return USAGE_PROVIDER_ORDER.filter((id) =>
      activeWindow.providers.some((p) => p.id === id && (p.cost > 0 || p.tokens > 0))
    );
  }, [activeWindow]);

  const chartTicks = useMemo(() => {
    const daily = activeWindow?.daily ?? [];
    if (daily.length <= 3) return daily.map((d) => d.date);
    const mid = daily[Math.floor((daily.length - 1) / 2)]!.date;
    return [daily[0]!.date, mid, daily[daily.length - 1]!.date];
  }, [activeWindow]);

  if (!snapshot || !activeWindow) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-lg">Awaiting live telemetry</CardTitle>
            <Badge variant="outline">Zephyrus-G14</Badge>
          </div>
          <CardDescription>
            No usage snapshot has been synced from Zephyrus-G14 yet. Once the background sync pushes its first summary,
            live token counts, daily spend, and model breakdowns appear here automatically.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const updatedAge = nowMs !== null ? formatRelativeAge(payload?.updatedAt ?? snapshot.generatedAt, nowMs) : "live";

  const typeSegments: SegmentedBarItem[] = [
    { id: "input", label: "Input", value: activeWindow.costByType.input, color: COST_TYPE_COLORS.input },
    { id: "cacheRead", label: "Cache read", value: activeWindow.costByType.cacheRead, color: COST_TYPE_COLORS.cacheRead },
    { id: "cacheWrite", label: "Cache write", value: activeWindow.costByType.cacheWrite, color: COST_TYPE_COLORS.cacheWrite },
    { id: "output", label: "Output", value: activeWindow.costByType.output, color: COST_TYPE_COLORS.output },
  ];

  const speedSegments: SegmentedBarItem[] = [
    { id: "standard", label: "Standard", value: activeWindow.costBySpeed.standard, color: COST_SPEED_COLORS.standard },
    { id: "fast", label: "Fast", value: activeWindow.costBySpeed.fast, color: COST_SPEED_COLORS.fast },
  ];

  const totalsTiles = [
    { label: "Processed tokens", value: formatTokens(activeWindow.totals.processedTokens), accent: false },
    { label: "Cached input", value: formatTokens(activeWindow.totals.cachedInputTokens), accent: false },
    { label: "Uncached input", value: formatTokens(activeWindow.totals.uncachedInputTokens), accent: false },
    { label: "Output", value: formatTokens(activeWindow.totals.outputTokens), accent: false },
    { label: "Cache savings", value: formatUsd(activeWindow.totals.cacheSavings), accent: true },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">
              <span aria-hidden className="size-2 rounded-full bg-primary-foreground" />
              Live · {snapshot.machineLabel}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">
              Updated {updatedAge}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={range}
              onValueChange={(next) => {
                if (next === "7d" || next === "30d" || next === "all") setRange(next);
              }}
              aria-label="Usage time range"
            >
              {RANGE_OPTIONS.map((opt) => (
                <ToggleGroupItem key={opt.key} value={opt.key}>
                  {opt.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => void fetchLatest(true)}
              disabled={refreshing}
              aria-label="Refresh AI usage"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex flex-col gap-8">
        {/* Top section: Headline + Provider list (left) and Daily cost chart (right) */}
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-5">
            <div className="flex flex-col gap-1">
              <div className="font-display text-4xl leading-none tracking-tight text-foreground tabular-nums sm:text-5xl">
                {formatUsd(activeWindow.totalCost)}
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                <span>
                  {activeWindow.sessionCount.toLocaleString("en-US")}{" "}
                  {activeWindow.sessionCount === 1 ? "session" : "sessions"} · API estimate
                </span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="How API estimate is calculated"
                    >
                      <Info className="size-3.5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72">
                    <p className="text-xs leading-relaxed text-popover-foreground">
                      Aggregated locally on {snapshot.machineLabel} from T3 Code session token logs using public API
                      list rates. Only numeric totals are synced — never prompts, code, or file paths.
                    </p>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex flex-col divide-y divide-border/15">
              {activeWindow.providers.map((provider) => {
                const meta = USAGE_PROVIDER_META[provider.id];
                return (
                  <div key={provider.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Swatch color={meta.color} size="sm" />
                        <ProviderBadgeIcon id={provider.id} />
                        <span className="truncate font-sans text-sm font-semibold text-foreground">
                          {provider.label}
                        </span>
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">
                          {provider.sessions} {provider.sessions === 1 ? "session" : "sessions"}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-bold text-foreground tabular-nums">
                        {formatUsd(provider.cost)}
                      </span>
                    </div>
                    <div className="pl-5 font-mono text-xs text-muted-foreground tabular-nums">
                      {formatShare(provider.share)} of cost · {formatTokens(provider.tokens)} tokens
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:col-span-7">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Daily cost
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {snapshot.timezone}
              </span>
            </div>

            <ChartContainer config={CHART_CONFIG} className="aspect-auto h-64 w-full">
              <AreaChart
                aria-label="Daily API-equivalent AI coding cost by provider"
                data={activeWindow.daily}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  {activeProviders.map((id) => (
                    <linearGradient key={id} id={`${gradientPrefix}-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={`var(--color-${id})`} stopOpacity={0.32} />
                      <stop offset="95%" stopColor={`var(--color-${id})`} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  ticks={chartTicks}
                  interval={0}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={formatAxisDay}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickCount={3}
                  tickFormatter={formatUsdAxis}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatLongDay(String(value))}
                      formatter={(value, name) => {
                        const key = String(name) as UsageProviderId;
                        const label = USAGE_PROVIDER_META[key]?.label ?? key;
                        return (
                          <div className="flex w-full items-center justify-between gap-4">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono font-bold text-foreground tabular-nums">
                              {formatUsd(Number(value))}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                {activeProviders.map((id) => (
                  <Area
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={`var(--color-${id})`}
                    fill={`url(#${gradientPrefix}-${id})`}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--border)" }}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          </div>
        </div>

        <Separator />

        {/* Totals strip */}
        <div className="flex flex-col gap-3">
          <h3 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
            Totals
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {totalsTiles.map((tile) => (
              <Card key={tile.label} variant="quiet" size="sm">
                <CardHeader className="gap-1">
                  <CardDescription className="font-mono text-xs tracking-wider uppercase">
                    {tile.label}
                  </CardDescription>
                  <div
                    className={cn(
                      "font-display text-xl leading-tight tabular-nums sm:text-2xl",
                      tile.accent ? "text-success" : "text-foreground"
                    )}
                  >
                    {tile.value}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>

        {/* Cost by type + Cost by speed */}
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h3 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Cost by type
            </h3>
            <SegmentedBar segments={typeSegments} label="Cost breakdown by token type" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              {typeSegments.map((seg) => (
                <div key={seg.id} className="flex items-center gap-1.5">
                  <Swatch color={seg.color} size="sm" />
                  <span className="text-muted-foreground">{seg.label}</span>
                  <span className="font-mono font-bold text-foreground tabular-nums">
                    {formatUsd(seg.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Cost by speed
              </h3>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                Premium{" "}
                <strong className="font-bold text-foreground">
                  {formatUsd(activeWindow.costBySpeed.premium)}
                </strong>
              </span>
            </div>
            <SegmentedBar segments={speedSegments} label="Cost breakdown by inference speed" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              {speedSegments.map((seg) => (
                <div key={seg.id} className="flex items-center gap-1.5">
                  <Swatch color={seg.color} size="sm" />
                  <span className="text-muted-foreground">{seg.label}</span>
                  <span className="font-mono font-bold text-foreground tabular-nums">
                    {formatUsd(seg.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Breakdown table (Model / Day toggle) */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Breakdown
            </h3>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={breakdown}
              onValueChange={(next) => {
                if (next === "model" || next === "day") setBreakdown(next);
              }}
              aria-label="Breakdown grouping"
            >
              <ToggleGroupItem value="model">Model</ToggleGroupItem>
              <ToggleGroupItem value="day">Day</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <Card variant="quiet" className="gap-0 overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>{breakdown === "model" ? "Model" : "Day"}</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdown === "model"
                  ? activeWindow.models.map((row, idx) => {
                      const meta = USAGE_PROVIDER_META[row.provider];
                      return (
                        <TableRow key={`${row.provider}:${row.model}`}>
                          <TableCell className="font-mono text-xs tabular-nums">
                            <span className="text-muted-foreground">{idx + 1}</span>
                          </TableCell>
                          <TableCell className="w-full max-w-xs">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <ProviderBadgeIcon id={row.provider} />
                                <span className="truncate font-mono text-xs font-bold text-foreground sm:text-sm">
                                  {row.model}
                                </span>
                              </div>
                              <Progress
                                value={Math.max(row.share, 1)}
                                thin
                                indicatorColor={meta.color}
                                aria-label={`${row.model} share ${formatShare(row.share)}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold tabular-nums sm:text-sm">
                            {formatUsd(row.cost)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            <span className="text-muted-foreground">{formatShare(row.share)}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            <span className="text-muted-foreground">{formatTokens(row.tokens)}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  : activeWindow.days.map((row, idx) => {
                      const meta = USAGE_PROVIDER_META[row.topProvider];
                      return (
                        <TableRow key={row.date}>
                          <TableCell className="font-mono text-xs tabular-nums">
                            <span className="text-muted-foreground">{idx + 1}</span>
                          </TableCell>
                          <TableCell className="w-full max-w-xs">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex items-center gap-2">
                                <Swatch color={meta.color} size="sm" />
                                <span className="font-mono text-xs font-bold text-foreground sm:text-sm">
                                  {formatLongDay(row.date)}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  · {row.sessions} {row.sessions === 1 ? "session" : "sessions"}
                                </span>
                              </div>
                              <Progress
                                value={Math.max(row.share, 1)}
                                thin
                                indicatorColor={meta.color}
                                aria-label={`${row.date} share ${formatShare(row.share)}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-bold tabular-nums sm:text-sm">
                            {formatUsd(row.cost)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            <span className="text-muted-foreground">{formatShare(row.share)}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            <span className="text-muted-foreground">{formatTokens(row.tokens)}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
