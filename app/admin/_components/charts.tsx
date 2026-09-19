"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addDays } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/format";
import { EmptyState } from "./ui";

const compact = (value: number) => formatMoney(value, "PHP", { compact: true });

function moneyFormatter(value: unknown, name: unknown, item: { color?: string }, _index: number, payload: unknown, config: ChartConfig) {
  const key = String(name);
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
      <span className="font-mono tabular-nums">{formatMoney(Number(value))}</span>
    </div>
  );
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
