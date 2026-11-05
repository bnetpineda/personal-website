"use client";

import { useDashboardFilters } from "./dashboard-filters";
import { MonthPicker } from "./ui";

/** Choosing a month exits all-time search; the shared type and category filters stay put. */
export function MonthNav({ month, current, recorded }: { month: string; current: string; recorded: string[] }) {
  const { monthHref } = useDashboardFilters();
  return <MonthPicker compact month={month} current={current} recorded={recorded} href={monthHref} />;
}
