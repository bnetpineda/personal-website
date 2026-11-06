"use client";

import { useContext, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ASSET_CLASSES, ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { addDays, dayLabel, dayRangeLabel, shortDayLabel } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/format";
import { changeSince } from "@/lib/finance/performance";
import { Masked, PrivacyHiddenContext, maskDigits } from "./privacy";
import { EmptyState, Money, Panel, Pct } from "./ui";

export interface NetWorthPoint {
  date: string;
  netWorth: number;
  byClass: Partial<Record<AssetClass, number>>;
}

const RANGES = [
  { value: "3M", days: 92 },
  { value: "1Y", days: 366 },
  { value: "All", days: 0 },
] as const;

type View = "total" | "classes";

/**
 * Net worth over months, from the daily snapshot, and what it was made of: each asset class stacked,
 * so allocation drift shows over time and not only as today's donut. Stacked areas start at zero, so
 * their fill is honest; the total is a line.
 */
export function NetWorthHistory({ points, today }: { points: NetWorthPoint[]; today: string }) {
  const [range, setRange] = useState<string>("1Y");
  const [view, setView] = useState<View>("total");
  const hidden = useContext(PrivacyHiddenContext);
  const days = RANGES.find((r) => r.value === range)?.days ?? 0;
  const shown = days ? points.filter((p) => p.date >= addDays(today, -days)) : points;
  const change = changeSince(shown.map((p) => ({ date: p.date, value: p.netWorth })), shown[0]?.date ?? today);
  const classes = ASSET_CLASSES.filter((c) => shown.some((p) => (p.byClass[c] ?? 0) > 0));
  const config = {
    netWorth: { label: "Net worth", color: "var(--chart-1)" },
    ...Object.fromEntries(classes.map((c) => [c, { label: ASSET_CLASS_META[c].plural, color: ASSET_CLASS_META[c].color }])),
  } satisfies ChartConfig;
  // Spaced by date, not by point, so a gap in the history reads as a gap in time.
  const data = shown.map((p) => ({ date: p.date, time: Date.parse(p.date), netWorth: p.netWorth, ...Object.fromEntries(classes.map((c) => [c, p.byClass[c] ?? 0])) }));
  const tick = (v: number) => (hidden ? maskDigits(formatMoney(v, "PHP", { compact: true })) : formatMoney(v, "PHP", { compact: true }));

  return (
    <Panel
      id="net-worth"
      title="Net worth over time"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="Show">
            <ToggleGroupItem value="total">Total</ToggleGroupItem>
            <ToggleGroupItem value="classes">By asset class</ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(v) => v && setRange(v)} aria-label="Range">
            {RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value}>
                {r.value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      }
      toolbar={
        change ? (
          <p className="text-xs text-muted-foreground">
            <Money value={change.change} signed /> (<Pct value={change.pct} />) {dayRangeLabel(change.from, shown.at(-1)!.date)} · everything in and out, deposits and spending included
            {view === "classes" && " · assets only, before debts"}
          </p>
        ) : undefined
      }
    >
      {shown.length < 2 ? (
        <EmptyState size="sm" title="Building history">A point is saved every day; the chart starts after the second.</EmptyState>
      ) : (
        <div className="transition group-data-[private=true]/shell:blur-sm">
          <ChartContainer config={config} className="aspect-auto h-64 w-full">
            <AreaChart aria-label={view === "total" ? "Net worth history" : "Assets by class history"} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={(t: number) => shortDayLabel(new Date(t).toISOString().slice(0, 10))} />
              <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={tick} domain={view === "total" ? ["auto", "auto"] : [0, "auto"]} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) => dayLabel(String(payload?.[0]?.payload?.date ?? ""))}
                    formatter={(value, name) => (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">{config[String(name) as keyof typeof config]?.label ?? String(name)}</span>
                        <span className="font-mono tabular-nums"><Masked text={formatMoney(Number(value))} /></span>
                      </div>
                    )}
                  />
                }
              />
              {view === "total" ? (
                // A line: the axis doesn't start at zero, so a fill would exaggerate the moves.
                <Area dataKey="netWorth" type="monotone" fill="none" stroke="var(--color-netWorth)" strokeWidth={3} isAnimationActive={false} />
              ) : (
                classes.map((c) => <Area key={c} dataKey={c} type="monotone" stackId="classes" fill={`var(--color-${c})`} fillOpacity={0.6} stroke={`var(--color-${c})`} isAnimationActive={false} />)
              )}
              {view === "classes" && <ChartLegend content={<ChartLegendContent />} />}
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </Panel>
  );
}
