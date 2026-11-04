/** Cookie holding the privacy-blur preference; read on the server so there's no flash of numbers. */
export const PRIVACY_COOKIE = "adm_private";

export type DashboardParams = { kind?: string | null; month?: string | null; category?: number | string | null; q?: string | null };

/** Choosing a month leaves all-time search, but keeps the selected type and category. */
export function dashboardMonthHref(params: DashboardParams, month: string, current: string) {
  return dashboardHref({ ...params, month: month === current ? null : month, q: null });
}

/** A category always keeps its type, including when it is selected again to clear it. */
export function dashboardCategoryFilter(current: number | null, category: { id: number; kind: "income" | "expense" }) {
  return { kind: category.kind, category: current === category.id ? null : category.id };
}

/** The one-screen dashboard with its Activity filters in the URL (blank values are left out). */
export function dashboardHref(params: DashboardParams) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") q.set(key, String(value));
  const s = q.toString();
  return s ? `/admin?${s}` : "/admin";
}
