"use client";

import { useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, LabelList, Pie, PieChart, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { budgetSegments } from "@/lib/finance/calc";
import { ASSET_CLASSES, ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { addDays } from "@/lib/finance/dates";
import { formatMoney, formatPct } from "@/lib/finance/format";
import { EmptyState, type BreakdownRow } from "./ui";

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

const netWorthConfig = {
  netWorth: { label: "Net worth", color: "var(--chart-1)" },
} satisfies ChartConfig;

const RANGES = [
  { value: "1M", days: 31 },
  { value: "3M", days: 92 },
  { value: "1Y", days: 366 },
  { value: "All", days: 0 },
] as const;

export function NetWorthChart({ points, today }: { points: { date: string; netWorth: number }[]; today: string }) {
  const [range, setRange] = useState<string>("3M");
  const days = RANGES.find((r) => r.value === range)?.days ?? 0;
  const data = days ? points.filter((p) => p.date >= addDays(today, -days)) : points;

  if (points.length < 2) {
    return <EmptyState title="Building history">A net-worth point is saved every day — the trend appears from the second day on.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(v) => v && setRange(v)} aria-label="Range">
        {RANGES.map((r) => (
          <ToggleGroupItem key={r.value} value={r.value}>
            {r.value}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="transition group-data-[private=true]/shell:blur-sm">
        <ChartContainer config={netWorthConfig} className="aspect-auto h-64 w-full">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={compact} domain={["auto", "auto"]} />
            <ChartTooltip
              content={<ChartTooltipContent formatter={(value, name, item, index, payload) => moneyFormatter(value, name, item, index, payload, netWorthConfig)} />}
            />
            <Area
              dataKey="netWorth"
              type="monotone"
              fill="var(--color-netWorth)"
              fillOpacity={0.35}
              stroke="var(--color-netWorth)"
              strokeWidth={3}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}

const cashFlowConfig = {
  income: { label: "Income", color: "var(--chart-1)" },
  expense: { label: "Expenses", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function CashFlowChart({ points }: { points: { label: string; income: number; expense: number }[] }) {
  if (points.every((p) => p.income === 0 && p.expense === 0)) {
    return <EmptyState title="No entries yet">Monthly income vs. expenses shows up here once you log some.</EmptyState>;
  }
  return (
    <div className="transition group-data-[private=true]/shell:blur-sm">
      <ChartContainer config={cashFlowConfig} className="aspect-auto h-64 w-full">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={compact} />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(value, name, item, index, payload) => moneyFormatter(value, name, item, index, payload, cashFlowConfig)} />}
          />
          <ChartLegend content={<ChartLegendContent />} />
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

const breakdownConfig = {
  left: { label: "Budget left", color: "var(--muted)" },
  over: { label: "Over budget", color: "var(--destructive)" },
} satisfies ChartConfig;

const truncate = (text: string, max = 14) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Horizontal bars per category on one ₱ scale. With a budget, the bar continues as a
 * muted "budget left" track, and spending past the budget shows in red.
 */
export function BreakdownChart({ rows, valueLabel }: { rows: BreakdownRow[]; valueLabel: string }) {
  const data = rows.map((row) => ({ ...row, key: String(row.key), ...budgetSegments(row.value, row.budget) }));
  const budgeted = rows.some((row) => (row.budget ?? 0) > 0);
  const n = rows.length;

  return (
    <div className="transition group-data-[private=true]/shell:blur-sm">
      <ChartContainer
        config={breakdownConfig}
        className={cn("aspect-auto w-full", n <= 3 && "h-32", n > 3 && n <= 6 && "h-56", n > 6 && n <= 10 && "h-80", n > 10 && "h-96")}
      >
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={104} tickFormatter={(label: string) => truncate(label)} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(_value, _name, item) => {
                  const row = item.payload as BreakdownRow;
                  return (
                    <div className="flex w-full flex-col gap-1.5">
                      <TooltipRow label={valueLabel} value={formatMoney(row.value)} />
                      {row.budget != null && row.budget > 0 && (
                        <TooltipRow label="Budget" value={`${formatMoney(row.budget)} · ${formatPct(row.value / row.budget)}`} />
                      )}
                    </div>
                  );
                }}
              />
            }
          />
          {budgeted && <ChartLegend content={<ChartLegendContent />} />}
          <Bar dataKey="within" stackId="a" legendType="none" stroke="var(--border)" strokeWidth={2} maxBarSize={24} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Bar>
          <Bar
            dataKey="left"
            stackId="a"
            fill="var(--color-left)"
            tooltipType="none"
            stroke="var(--border)"
            strokeWidth={2}
            maxBarSize={24}
            isAnimationActive={false}
          />
          <Bar
            dataKey="over"
            stackId="a"
            fill="var(--color-over)"
            tooltipType="none"
            stroke="var(--border)"
            strokeWidth={2}
            maxBarSize={24}
            isAnimationActive={false}
          >
            <LabelList dataKey="value" position="right" offset={8} className="fill-foreground font-mono" fontSize={12} formatter={(v) => compact(Number(v))} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
