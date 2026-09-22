import { CreditCard, LayoutDashboard, PiggyBank, Receipt, Repeat, Settings, Wallet } from "lucide-react";

/** `tab: false` keeps an item out of the phone tab bar (it's reachable from the header instead). */
export const ADMIN_NAV = [
  { href: "/admin", label: "Overview", short: "Home", icon: LayoutDashboard, tab: true },
  { href: "/admin/holdings", label: "Holdings", short: "Holdings", icon: Wallet, tab: true },
  { href: "/admin/expenses", label: "Expenses", short: "Spend", icon: Receipt, tab: true },
  { href: "/admin/income", label: "Income", short: "Income", icon: PiggyBank, tab: true },
  { href: "/admin/recurring", label: "Recurring", short: "Repeat", icon: Repeat, tab: true },
  { href: "/admin/debts", label: "Debts", short: "Debts", icon: CreditCard, tab: true },
  { href: "/admin/settings", label: "Settings", short: "Settings", icon: Settings, tab: false },
] as const;

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Cookie holding the privacy-blur preference; read on the server so there's no flash of numbers. */
export const PRIVACY_COOKIE = "adm_private";
