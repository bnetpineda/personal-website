import { ArrowLeftRight, Bell, CreditCard, LayoutDashboard, Link2, Repeat, Settings, TrendingUp, Wallet } from "lucide-react";

/** `tab: false` keeps an item out of the phone tab bar (it's reachable from the header instead). */
export const ADMIN_NAV = [
  { href: "/admin", label: "Overview", short: "Home", icon: LayoutDashboard, tab: true },
  { href: "/admin/holdings", label: "Holdings", short: "Holdings", icon: Wallet, tab: true },
  { href: "/admin/transactions", label: "Transactions", short: "Money", icon: ArrowLeftRight, tab: true },
  { href: "/admin/recurring", label: "Recurring", short: "Repeat", icon: Repeat, tab: true },
  { href: "/admin/debts", label: "Debts", short: "Debts", icon: CreditCard, tab: true },
  { href: "/admin/settings", label: "Settings", short: "Settings", icon: Settings, tab: false },
  { href: "/admin/connections", label: "Connections", short: "Connect", icon: Link2, tab: false },
  { href: "/admin/earnings", label: "Investment earnings", short: "Earnings", icon: TrendingUp, tab: false },
  { href: "/admin/history", label: "Investment history", short: "History", icon: ArrowLeftRight, tab: false },
  { href: "/admin/notifications", label: "Notifications", short: "Alerts", icon: Bell, tab: false },
] as const;

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Cookie holding the privacy-blur preference; read on the server so there's no flash of numbers. */
export const PRIVACY_COOKIE = "adm_private";

/** Transactions page URL for a filter (blank values are left out). */
export function transactionsHref(params: { kind?: string | null; month?: string | null; category?: number | string | null; q?: string | null }) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") q.set(key, String(value));
  const s = q.toString();
  return s ? `/admin/transactions?${s}` : "/admin/transactions";
}
