"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Landmark, LogOut, Moon, MoreHorizontal, Repeat, Settings, Sun, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logout } from "../_actions/auth";
import { isNavActive, NAV_DESTINATIONS, PORTFOLIO_SECTIONS } from "./nav";

const ICONS: Record<(typeof NAV_DESTINATIONS)[number]["href"], LucideIcon> = {
  "/admin": House,
  "/admin/holdings": Wallet,
  "/admin/recurring": Repeat,
  "/admin/connections": Landmark,
  "/admin/settings": Settings,
};

/** One destination: icon over its name, the same in the side rail and the phone's bottom bar. */
function NavLinks() {
  const pathname = usePathname();
  return NAV_DESTINATIONS.map(({ href, label }) => {
    const Icon = ICONS[href];
    const active = isNavActive(href, pathname);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md border-2 px-0.5 py-1.5 font-mono text-xs font-bold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring lg:flex-none",
          active ? "border-border bg-primary text-primary-foreground" : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Icon aria-hidden className="size-5 shrink-0" />
        {label}
      </Link>
    );
  });
}

/** Wide screens: a rail down the left, so the Overview keeps its full height. */
export function SideNav() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 flex-col gap-2 border-r-2 border-border bg-background px-1.5 pt-safe lg:flex">
      <Link href="/admin" aria-label="bnetpineda.dev finance, home" className="mt-3 mb-2 self-center rounded-sm bg-primary px-1.5 font-display text-lg text-primary-foreground">
        bp
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        <NavLinks />
      </nav>
      <div className="mt-auto mb-3 flex flex-col items-center gap-1">
        <ThemeToggle />
        <form action={logout}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
                <LogOut />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Log out</TooltipContent>
          </Tooltip>
        </form>
      </div>
    </aside>
  );
}

/** Phones and tablets: always on screen, in thumb reach. */
export function BottomNav() {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t-2 border-border bg-background px-1 pt-1 pb-safe lg:hidden">
      <NavLinks />
    </nav>
  );
}

/** Theme and log out, for screens without the rail. */
export function MoreMenu() {
  const { resolvedTheme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  return (
    <div className="lg:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="More options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
            {resolvedTheme === "dark" ? <Sun /> : <Moon />} Use {resolvedTheme === "dark" ? "light" : "dark"} theme
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => startTransition(async () => { await logout(); })}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The three views of Portfolio. */
export function PortfolioSections() {
  const pathname = usePathname();
  return (
    <nav aria-label="Portfolio sections" className="mb-4 flex flex-wrap gap-2">
      {PORTFOLIO_SECTIONS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Button key={href} asChild size="sm" variant={active ? "default" : "outline"}>
            <Link href={href} aria-current={active ? "page" : undefined}>
              {label}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
}
