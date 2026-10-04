"use client";

import { useSearchParams } from "next/navigation";
import type { CashFlowKind } from "@/lib/finance/constants";
import { dashboardHref, type DashboardParams } from "./nav";

/**
 * The dashboard's Activity filters, kept in the URL. Type and category switch on the client (the
 * month's entries are already on the page, so the feed and the category list update instantly);
 * month and search are links, because they need new data from the server.
 */
export function useDashboardFilters() {
  const params = useSearchParams();
  const kindParam = params.get("kind");
  const kind: CashFlowKind | null = kindParam === "expense" || kindParam === "income" ? kindParam : null;
  const category = Number(params.get("category")) || null;
  const current: DashboardParams = { kind, category, month: params.get("month"), q: params.get("q") };

  /** Dashboard URL with some filters changed and the rest kept. */
  const hrefWith = (next: Partial<DashboardParams>) => dashboardHref({ ...current, ...next });
  /** Changes type/category in place: a history entry (Back undoes it) without a server request. */
  const set = (next: Partial<Pick<DashboardParams, "kind" | "category">>) => window.history.pushState(null, "", hrefWith(next));

  return { kind, category, q: current.q, month: current.month, hrefWith, set };
}
