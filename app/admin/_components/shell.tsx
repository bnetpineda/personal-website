"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Eye, EyeOff, LogOut, Plus, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CashFlowKind } from "@/lib/finance/constants";
import { logout } from "../_actions/auth";
import { ADMIN_NAV, PRIVACY_COOKIE, isActivePath } from "./nav";

interface AdminUi {
  privacy: { hidden: boolean; toggle: () => void };
  /** Kind shown in the quick-add sheet, or null when it's closed. */
  adding: CashFlowKind | null;
  setAdding: (kind: CashFlowKind | null) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

const AdminUiContext = createContext<AdminUi | null>(null);

export function useAdminUi(): AdminUi {
  const ui = useContext(AdminUiContext);
  if (!ui) throw new Error("useAdminUi must be used inside <Shell>");
  return ui;
}

const noop = () => () => {};

/** "⌘" on Apple devices, "Ctrl" elsewhere (and during SSR). */
export function useModKey() {
  return useSyncExternalStore(
    noop,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl "),
    () => "Ctrl "
  );
}

/** Typing in a field, or a dialog/sheet/menu is open: single-key shortcuts stay out of the way. */
function shortcutsBlocked(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [contenteditable=true]")) return true;
  return Boolean(document.querySelector("[role=dialog], [role=alertdialog], [role=menu]"));
}

/**
 * Keyboard shortcuts: ⌘K / Ctrl+K or "/" opens the command menu, "e" / "i" open quick add.
 * The handler lives in a ref so the listener is registered once.
 */
function useShortcuts(ui: Pick<AdminUi, "setAdding" | "setCommandOpen" | "commandOpen">) {
  const latest = useRef(ui);
  useEffect(() => {
    latest.current = ui;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { setAdding, setCommandOpen, commandOpen } = latest.current;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(!commandOpen);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented || shortcutsBlocked(event)) return;
      const key = event.key.toLowerCase();
      if (key === "/") setCommandOpen(true);
      else if (key === "e") setAdding("expense");
      else if (key === "i") setAdding("income");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Dashboard frame. `data-private` blurs every <Money> (group-data-[private=true]/shell). */
export function Shell({ initialPrivate, children }: { initialPrivate: boolean; children: ReactNode }) {
  const [hidden, setHidden] = useState(initialPrivate);
  const [adding, setAdding] = useState<CashFlowKind | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);

  const toggle = () => {
    const next = !hidden;
    document.cookie = `${PRIVACY_COOKIE}=${next ? "1" : "0"}; path=/admin; max-age=31536000; samesite=lax`;
    setHidden(next);
  };

  useShortcuts({ setAdding, setCommandOpen, commandOpen });

  return (
    <AdminUiContext.Provider value={{ privacy: { hidden, toggle }, adding, setAdding, commandOpen, setCommandOpen }}>
      <div data-private={hidden} className="group/shell flex min-h-svh flex-col">
        {children}
      </div>
      <Toaster />
    </AdminUiContext.Provider>
  );
}

function PrivacyToggle() {
  const { hidden, toggle } = useAdminUi().privacy;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle pressed={hidden} onPressedChange={toggle} aria-label={hidden ? "Show amounts" : "Hide amounts"}>
          {hidden ? <EyeOff /> : <Eye />}
        </Toggle>
      </TooltipTrigger>
      <TooltipContent>{hidden ? "Show amounts" : "Hide amounts"}</TooltipContent>
    </Tooltip>
  );
}

export function AdminHeader({ notifications = 0 }: { notifications?: number }) {
  const pathname = usePathname();
  const { setAdding, setCommandOpen } = useAdminUi();
  const mod = useModKey();

  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-background pt-safe">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/admin" className="flex items-baseline gap-2 font-display text-lg">
          <span>
            bnetpineda<span className="rounded-sm bg-primary px-1 text-primary-foreground">.dev</span>
          </span>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">/ admin</span>
        </Link>
        <nav aria-label="Admin" className="hidden items-center gap-1 lg:flex">
          {ADMIN_NAV.filter((item) => item.tab).map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Button key={href} asChild size="sm" variant={active ? "default" : "ghost"}>
                <Link href={href} aria-current={active ? "page" : undefined} aria-label={label}>
                  <Icon />
                  {/* Labels don't fit next to search and Add between lg and xl. */}
                  <span className="sr-only">{label}</span>
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="hidden lg:inline-flex" onClick={() => setCommandOpen(true)}>
            <Search /> Search <Kbd>{mod}K</Kbd>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Search and commands" onClick={() => setCommandOpen(true)}>
                <Search />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search and commands</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" className="hidden lg:inline-flex" onClick={() => setAdding("expense")}>
                <Plus /> Add
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Expense <Kbd>E</Kbd> · Income <Kbd>I</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant={isActivePath(pathname, "/admin/settings") ? "default" : "ghost"} size="icon">
                <Link href="/admin/settings" aria-label="Settings">
                  <Settings />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <PrivacyToggle />
          <Tooltip><TooltipTrigger asChild><Button asChild variant={isActivePath(pathname, "/admin/notifications") ? "default" : "ghost"} size="icon">
            <Link href="/admin/notifications" aria-label={`Notifications${notifications ? `, ${notifications} active` : ""}`}>
              <Bell />{notifications > 0 && <span className="sr-only">{notifications} active</span>}
              {notifications > 0 && <span aria-hidden="true" className="text-xs font-bold">{notifications}</span>}
            </Link></Button></TooltipTrigger><TooltipContent>Notifications{notifications ? ` (${notifications})` : ""}</TooltipContent></Tooltip>
          {/* On phones these two live in the command menu to keep the header on one line. */}
          <ThemeToggle className="hidden sm:inline-flex" />
          <form action={logout} className="hidden sm:block">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
                  <LogOut />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Log out</TooltipContent>
            </Tooltip>
          </form>
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const tabs = ADMIN_NAV.filter((item) => item.tab);

  return (
    <nav aria-label="Admin sections" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t-2 border-border bg-background pb-safe lg:hidden">
      {tabs.map(({ href, short, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-col items-center gap-1 py-2 font-mono text-xs",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-5" />
            {short}
          </Link>
        );
      })}
    </nav>
  );
}
