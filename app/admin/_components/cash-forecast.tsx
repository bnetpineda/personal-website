"use client";

import { useContext } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { dayLabel, shortDayLabel } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/format";
import type { ForecastPoint } from "@/lib/finance/forecast";
import { Masked, PrivacyHiddenContext, maskDigits } from "./privacy";

const config = {
  expected: { label: "Expected", color: "var(--chart-2)" },
  band: { label: "Low to high", color: "var(--chart-2)" },
} satisfies ChartConfig;

/**
 * Projected cash, day by day: the expected line inside the band between your lowest- and
 * highest-paid months, with the emergency-fund level drawn across when a goal sets one.
 */
export function CashForecastChart({ points, floor }: { points: ForecastPoint[]; floor: number | null }) {
  const hidden = useContext(PrivacyHiddenContext);
  const data = points.map((p) => ({ date: p.date, time: Date.parse(p.date), expected: p.expected, band: [p.low, p.high] as [number, number], low: p.low, high: p.high }));
  const tick = (v: number) => (hidden ? maskDigits(formatMoney(v, "PHP", { compact: true })) : formatMoney(v, "PHP", { compact: true }));
  const label = `Projected cash, ${dayLabel(points[0].date)} to ${dayLabel(points.at(-1)!.date)}`;

  return (
    <div className="transition group-data-[private=true]/shell:blur-sm">
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <ComposedChart accessibilityLayer={false} aria-label={label} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={(t: number) => shortDayLabel(new Date(t).toISOString().slice(0, 10))} />
          <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={tick} domain={["auto", "auto"]} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_label, payload) => dayLabel(String(payload?.[0]?.payload?.date ?? ""))}
                formatter={(_value, name, item) => {
                  const row = item.payload as (typeof data)[number];
                  if (name === "band") {
                    return (
                      <div className="flex w-full items-center justify-between gap-4">
                        <span className="text-muted-foreground">Low · high</span>
                        <span className="font-mono tabular-nums"><Masked text={`${formatMoney(row.low, "PHP", { compact: true })} · ${formatMoney(row.high, "PHP", { compact: true })}`} /></span>
                      </div>
                    );
                  }
                  return (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">Expected</span>
                      <span className="font-mono tabular-nums"><Masked text={formatMoney(row.expected)} /></span>
                    </div>
                  );
                }}
              />
            }
          />
          <Area dataKey="band" type="monotone" fill="var(--color-band)" fillOpacity={0.2} stroke="none" isAnimationActive={false} />
          <Line dataKey="expected" type="monotone" dot={false} stroke="var(--color-expected)" strokeWidth={3} isAnimationActive={false} />
          {floor != null && floor > 0 && (
            <ReferenceLine y={floor} stroke="var(--destructive)" strokeDasharray="6 4" strokeWidth={2} ifOverflow="extendDomain" label={{ value: "Emergency fund", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }} />
          )}
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
