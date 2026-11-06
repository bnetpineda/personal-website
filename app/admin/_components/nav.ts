/** Cookie holding the privacy-blur preference; read on the server so there's no flash of numbers. */
export const PRIVACY_COOKIE = "adm_private";

/** The admin's main destinations, always visible (side rail on wide screens, bottom bar below that). */
export const NAV_DESTINATIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/holdings", label: "Portfolio" },
  { href: "/admin/recurring", label: "Recurring" },
  { href: "/admin/connections", label: "Accounts" },
  { href: "/admin/settings", label: "Settings" },
] as const;

export const PORTFOLIO_SECTIONS = [
  { href: "/admin/holdings", label: "Holdings" },
  { href: "/admin/earnings", label: "Earnings" },
  { href: "/admin/history", label: "History" },
  { href: "/admin/goals", label: "Goals" },
] as const;

/** Earnings, History and Goals are part of Portfolio; only the Overview needs an exact match. */
export function isNavActive(href: (typeof NAV_DESTINATIONS)[number]["href"], pathname: string) {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/holdings") return PORTFOLIO_SECTIONS.some((section) => section.href === pathname);
  return pathname === href;
}

export type DashboardParams = { kind?: string | null; month?: string | null; category?: number | string | null; q?: string | null; add?: string | null };

/**
 * Choosing a month leaves all-time search, but keeps the selected type and category. The month stays
 * in the URL even for this month: a bare /admin opens on the latest month with records.
 */
export function dashboardMonthHref(params: DashboardParams, month: string) {
  return dashboardHref({ ...params, month, q: null });
}

/** Selecting a category leaves the type filter alone (a category implies its type), so clearing it restores what was on before. */
export function dashboardCategoryFilter(current: number | null, category: { id: number }) {
  return { category: current === category.id ? null : category.id };
}

/** The one-screen dashboard with its Activity filters in the URL (blank values are left out). */
export function dashboardHref(params: DashboardParams) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") q.set(key, String(value));
  const s = q.toString();
  return s ? `/admin?${s}` : "/admin";
}

/**
 * Where a bare /admin should open: the latest month with both income and spending, or failing that
 * any records. Statements arrive after a month closes, so this month usually holds only a few synced
 * fees, and a screen of dashes answers nothing. Returns null to stay on this month.
 */
export function openingMonth(recorded: { month: string; kind: "income" | "expense" }[], current: string) {
  const months = recorded.filter((r) => r.month <= current);
  const kinds = (month: string) => new Set(months.filter((r) => r.month === month).map((r) => r.kind)).size;
  const sorted = [...new Set(months.map((r) => r.month))].sort().reverse();
  const opening = sorted.find((month) => kinds(month) === 2) ?? sorted[0];
  return opening && opening !== current ? opening : null;
}
