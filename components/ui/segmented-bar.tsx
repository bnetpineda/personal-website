"use client";

import * as React from "react";
import { cn } from "cn";

export interface SegmentedBarItem {
  id: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Proportional horizontal breakdown bar styled to match the house `Progress` primitive.
 * Lives in `components/ui` so app code never writes inline width/color styles.
 */
function SegmentedBar({
  segments,
  label,
  className,
}: {
  segments: readonly SegmentedBarItem[];
  label: string;
  className?: string;
}) {
  const positive = segments.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = positive.reduce((sum, s) => sum + s.value, 0);

  return (
    <div
      data-slot="segmented-bar"
      role="img"
      aria-label={label}
      className={cn(
        "flex h-3.5 w-full overflow-hidden rounded-full border-2 border-border bg-muted max-lg:h-3 max-lg:border",
        className
      )}
    >
      {total > 0 &&
        positive.map((seg) => {
          const pct = (seg.value / total) * 100;
          return (
            <div
              key={seg.id}
              data-slot="segmented-bar-segment"
              title={`${seg.label}: ${pct.toFixed(1)}%`}
              className="h-full border-r-2 border-border transition-all last:border-r-0 max-lg:border-r"
              style={{
                width: `${pct}%`,
                backgroundColor: seg.color,
                minWidth: pct > 0 ? "4px" : undefined,
              }}
            />
          );
        })}
    </div>
  );
}

export { SegmentedBar };
