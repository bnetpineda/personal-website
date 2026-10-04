"use client";

import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Swatch } from "@/components/ui/swatch";
import { ASSET_CLASSES, ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { dayLabel } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/format";
import { EmptyState } from "./ui";

const compact = (value: number) => formatMoney(value, "PHP", { compact: true });

function TooltipRow({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function moneyFormatter(value: unknown, name: unknown, item: { color?: string }, _index: number, payload: unknown, config: ChartConfig) {
  const key = String(name);
  return <TooltipRow label={config[key]?.label ?? key} value={formatMoney(Number(value))} />;
}

export const RANGES = [
  { value: "1M", days: 31 },
  { value: "3M", days: 92 },
  { value: "1Y", days: 366 },
  { value: "All", days: 0 },
] as const;

/** One account's value (or P/L) over time. The caller picks the range and says what is charted. */
export function PortfolioChart({ points, label, color, currency }: { points: { date: string; value: number }[]; label: string; color: string; currency: string }) {
  const config = { value: { label, color } } satisfies ChartConfig;
  return (
    <div className="transition group-data-[private=true]/shell:blur-sm">
      <ChartContainer config={config} className="aspect-auto h-48 w-full">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={(d: string) => d.slice(5)} />
          <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })} domain={["auto", "auto"]} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(day) => dayLabel(String(day))}
                formatter={(value) => <TooltipRow label={label} value={formatMoney(Number(value), currency)} />}
              />
            }
          />
          <Area dataKey="value" type="monotone" fill="var(--color-value)" fillOpacity={0.35} stroke="var(--color-value)" strokeWidth={3} isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

const cashFlowConfig = {
  income: { label: "Income", color: "var(--chart-1)" },
  expense: { label: "Expenses", color: "var(--chart-3)" },
} satisfies ChartConfig;

/** The cash-flow colors as a compact key, for a panel header when the chart leaves out its own legend (`fill`). */
export function CashFlowLegend() {
  return (
    <span className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
      {(["income", "expense"] as const).map((key) => (
        <span key={key} className="flex items-center gap-1.5">
          <Swatch color={cashFlowConfig[key].color} size="sm" />
          {cashFlowConfig[key].label}
        </span>
      ))}
    </span>
  );
}

/** Monthly income vs. expenses. `fill`: takes the height of its panel on wide screens (the dashboard). */
export function CashFlowChart({ points, fill = false }: { points: { label: string; income: number; expense: number }[]; fill?: boolean }) {
  if (points.every((p) => p.income === 0 && p.expense === 0)) {
    return <EmptyState title="No entries yet">Monthly income vs. expenses shows up here once you log some.</EmptyState>;
  }
  return (
    <div className={cn("transition group-data-[private=true]/shell:blur-sm", fill && "xl:h-full")}>
      <ChartContainer config={cashFlowConfig} className={cn("aspect-auto w-full", fill ? "h-56 xl:h-full" : "h-64")}>
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={compact} />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(value, name, item, index, payload) => moneyFormatter(value, name, item, index, payload, cashFlowConfig)} />}
          />
          {!fill && <ChartLegend content={<ChartLegendContent />} />}
          <Bar dataKey="income" fill="var(--color-income)" radius={4} isAnimationActive={false} />
          <Bar dataKey="expense" fill="var(--color-expense)" radius={4} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

const allocationConfig = Object.fromEntries(
  ASSET_CLASSES.map((c) => [c, { label: ASSET_CLASS_META[c].plural, color: ASSET_CLASS_META[c].color }])
) satisfies ChartConfig;

/** Donut of holdings by asset class, total in the middle. Pair it with a value/% list. */
export function AllocationChart({ slices }: { slices: { assetClass: AssetClass; value: number }[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const data = slices.map((s) => ({ ...s, fill: `var(--color-${s.assetClass})` }));
  return (
    <div className="transition group-data-[private=true]/shell:blur-sm">
      <ChartContainer config={allocationConfig} className="mx-auto aspect-square h-56">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(value, name, item, index, payload) => moneyFormatter(value, name, item, index, payload, allocationConfig)}
              />
            }
          />
          <Pie data={data} dataKey="value" nameKey="assetClass" innerRadius={60} stroke="var(--border)" strokeWidth={2} isAnimationActive={false}>
            <Label
              content={({ viewBox }) =>
                viewBox && "cx" in viewBox ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy - 6} className="fill-foreground font-display text-xl">
                      {compact(total)}
                    </tspan>
                    <tspan x={viewBox.cx} y={viewBox.cy + 16} className="fill-muted-foreground font-mono text-xs uppercase">
                      Assets
                    </tspan>
                  </text>
                ) : null
              }
            />
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  );
}

/**
 * A tiny trend line (no axes) for a stat tile, e.g. net worth over the last 90 days. Draws in the
 * tile's text color, so it reads on the lime highlight card too; hover shows the day's value.
 */
export function Sparkline({ points, label }: { points: { date: string; value: number }[]; label: string }) {
  const config = { value: { label, color: "currentColor" } } satisfies ChartConfig;
  return (
    <div className="transition group-data-[private=true]/shell:blur-sm">
      <ChartContainer config={config} className="aspect-auto h-10 w-full">
        <AreaChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_label, payload) => dayLabel(String(payload?.[0]?.payload?.date ?? ""))}
                formatter={(value) => <TooltipRow label={label} value={formatMoney(Number(value))} />}
              />
            }
          />
          <Area dataKey="value" type="monotone" fill="var(--color-value)" fillOpacity={0.15} stroke="var(--color-value)" strokeWidth={2} isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export interface MiniBar {
  /** Unique key, e.g. the month (YYYY-MM). */
  key: string;
  /** What the tooltip calls it ("Sep 2026"). */
  label: string;
  value: number;
}

/**
 * A tile-sized bar chart (no axes) for a stat card: one bar per month, the month on show at full
 * strength and the rest dimmed. `tone` colors each bar by sign (net: green up, red down);
 * `reference` draws a dashed line, e.g. the typical month. Hover shows the month and amount.
 */
export function MiniBars({
  points,
  label,
  color = "var(--chart-1)",
  tone = false,
  highlight,
  reference,
}: {
  points: MiniBar[];
  label: string;
  color?: string;
  tone?: boolean;
  highlight?: string;
  reference?: number;
}) {
  const config = { value: { label, color } } satisfies ChartConfig;
  return (
    <div className="transition group-data-[private=true]/shell:blur-sm">
      <ChartContainer config={config} className="aspect-auto h-10 w-full">
        <BarChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          {/* Zero stays on the scale, so a negative month hangs below it. */}
          <YAxis hide domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_label, payload) => String(payload?.[0]?.payload?.label ?? "")}
                formatter={(value) => <TooltipRow label={label} value={formatMoney(Number(value), "PHP", { signed: tone })} />}
              />
            }
          />
          {reference != null && <ReferenceLine y={reference} stroke="currentColor" strokeOpacity={0.6} strokeDasharray="3 3" />}
          <Bar dataKey="value" radius={2} isAnimationActive={false}>
            {points.map((p) => (
              <Cell
                key={p.key}
                fill={tone ? (p.value < 0 ? "var(--destructive)" : "var(--success)") : "var(--color-value)"}
                fillOpacity={highlight == null || p.key === highlight ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
