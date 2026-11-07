"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, Download, House, Landmark, LogOut, MonitorSmartphone, Moon, MoreHorizontal, Repeat, Sun, Upload, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logout } from "../_actions/auth";
import { isNavActive, NAV_DESTINATIONS, PORTFOLIO_SECTIONS } from "./nav";
import { RestoreBackup } from "./restore-backup";
import { SignOutEverywhere } from "./sign-out-everywhere";

const ICONS: Record<(typeof NAV_DESTINATIONS)[number]["href"], LucideIcon> = {
  "/admin": House,
  "/admin/holdings": Wallet,
  "/admin/recurring": Repeat,
  "/admin/connections": Landmark,
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
        <AccountMenu side="right" align="end" tooltip="Backup and sign-in">
          <Button variant="ghost" size="icon" aria-label="Backup and sign-in">
            <CircleUserRound />
          </Button>
        </AccountMenu>
      </div>
    </aside>
  );
}

/**
 * What used to fill a Settings page, none of it needed often: backup, restore, ending every session,
 * and log out. Its dialogs open once the menu has closed, and have no trigger of their own, so
 * closing one hands focus back to the menu's button.
 */
function AccountMenu({ side, align, tooltip, before, children }: {
  side?: "right" | "bottom";
  align?: "start" | "end";
  tooltip?: string;
  /** Items above the account ones (the phone's theme switch). */
  before?: ReactNode;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"restore" | "sign-out" | null>(null);
  const next = useRef<typeof dialog>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocus = (event: Event) => {
    event.preventDefault();
    triggerRef.current?.focus();
  };
  const trigger = (
    <DropdownMenuTrigger asChild ref={triggerRef}>
      {children}
    </DropdownMenuTrigger>
  );
  return (
    <>
      <DropdownMenu>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side={side}>{tooltip}</TooltipContent>
          </Tooltip>
        ) : (
          trigger
        )}
        <DropdownMenuContent
          side={side}
          align={align}
          onCloseAutoFocus={() => {
            if (next.current) setDialog(next.current);
            next.current = null;
          }}
        >
          {before}
          <DropdownMenuItem asChild>
            <a href="/admin/export" download>
              <Download /> Export a backup
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { next.current = "restore"; }}>
            <Upload /> Restore from backup…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { next.current = "sign-out"; }}>
            <MonitorSmartphone /> Sign out everywhere…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => startTransition(async () => { await logout(); })}>
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RestoreBackup open={dialog === "restore"} onOpenChange={(open) => setDialog(open ? "restore" : null)} onCloseAutoFocus={returnFocus} />
      <SignOutEverywhere open={dialog === "sign-out"} onOpenChange={(open) => setDialog(open ? "sign-out" : null)} onCloseAutoFocus={returnFocus} />
    </>
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

/** Theme, backup and sign-in, for screens without the rail. */
export function MoreMenu() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="lg:hidden">
      <AccountMenu
        align="end"
        before={
          <>
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} Use {resolvedTheme === "dark" ? "light" : "dark"} theme
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        }
      >
        <Button variant="ghost" size="icon" aria-label="More options">
          <MoreHorizontal />
        </Button>
      </AccountMenu>
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
