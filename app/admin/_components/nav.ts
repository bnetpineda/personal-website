import { CreditCard, LayoutDashboard, PiggyBank, Receipt, Settings, Wallet } from "lucide-react";

export const ADMIN_NAV = [
  { href: "/admin", label: "Overview", short: "Home", icon: LayoutDashboard },
  { href: "/admin/holdings", label: "Holdings", short: "Holdings", icon: Wallet },
  { href: "/admin/expenses", label: "Expenses", short: "Spend", icon: Receipt },
  { href: "/admin/income", label: "Income", short: "Income", icon: PiggyBank },
  { href: "/admin/debts", label: "Debts", short: "Debts", icon: CreditCard },
  { href: "/admin/settings", label: "Settings", short: "Settings", icon: Settings },
] as const;

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Cookie holding the privacy-blur preference; read on the server so there's no flash of numbers. */
export const PRIVACY_COOKIE = "adm_private";
