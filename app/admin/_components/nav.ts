import { ArrowLeftRight, House, Settings } from "lucide-react";

/** The three tabs. Everything else (holdings, recurring, connections…) hangs off Home or Settings. */
export const ADMIN_NAV = [
  { href: "/admin", label: "Home", icon: House },
  { href: "/admin/transactions", label: "Activity", icon: ArrowLeftRight },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

/** Pages that aren't tabs light up the tab they're opened from. */
const TAB_CHILDREN: Record<string, string[]> = {
  "/admin": ["/admin/holdings", "/admin/earnings", "/admin/history"],
  "/admin/settings": ["/admin/connections", "/admin/recurring"],
};

export function isActivePath(pathname: string, href: string): boolean {
  const under = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  if (TAB_CHILDREN[href]?.some(under)) return true;
  return href === "/admin" ? pathname === "/admin" : under(href);
}

/** Cookie holding the privacy-blur preference; read on the server so there's no flash of numbers. */
export const PRIVACY_COOKIE = "adm_private";

/** Activity page URL for a filter (blank values are left out). */
export function transactionsHref(params: { kind?: string | null; month?: string | null; category?: number | string | null; q?: string | null }) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") q.set(key, String(value));
  const s = q.toString();
  return s ? `/admin/transactions?${s}` : "/admin/transactions";
}
