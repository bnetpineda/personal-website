/** Cookie holding the privacy-blur preference; read on the server so there's no flash of numbers. */
export const PRIVACY_COOKIE = "adm_private";

export type DashboardParams = { kind?: string | null; month?: string | null; category?: number | string | null; q?: string | null };

/** The one-screen dashboard with its Activity filters in the URL (blank values are left out). */
export function dashboardHref(params: DashboardParams) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") q.set(key, String(value));
  const s = q.toString();
  return s ? `/admin?${s}` : "/admin";
}
