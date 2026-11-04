"use client";

import { useDashboardFilters } from "./dashboard-filters";
import { MonthPicker } from "./ui";

/** Choosing a month exits all-time search; the shared type and category filters stay put. */
export function MonthNav({ month, current }: { month: string; current: string }) {
  const { monthHref } = useDashboardFilters();
  return <MonthPicker compact month={month} current={current} href={(m) => monthHref(m, current)} />;
}
