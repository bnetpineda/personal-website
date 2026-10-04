"use client";

import { useDashboardFilters } from "./dashboard-filters";
import { MonthPicker } from "./ui";

/** The dashboard's month stepper; keeps the type, category and search already in the URL. */
export function MonthNav({ month, current }: { month: string; current: string }) {
  const { hrefWith } = useDashboardFilters();
  return <MonthPicker month={month} current={current} href={(m) => hrefWith({ month: m === current ? null : m })} />;
}
