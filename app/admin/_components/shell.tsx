"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, EyeOff, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logout } from "../_actions/auth";
import { CommandButton, CommandMenu } from "./command-menu";
import { PRIVACY_COOKIE } from "./nav";

interface AdminUi {
  privacy: { hidden: boolean; toggle: () => void };
  /** Opens the ⌘K menu. */
  openCommand: () => void;
}

const AdminUiContext = createContext<AdminUi | null>(null);

export function useAdminUi(): AdminUi {
  const ui = useContext(AdminUiContext);
  if (!ui) throw new Error("useAdminUi must be used inside <Shell>");
  return ui;
}

/**
 * Dashboard frame. `data-private` blurs every <Money> (group-data-[private=true]/shell).
 * Pages get the shared header and main; the Overview (/admin) renders its own, because its
 * header carries the month and its actions. On wide screens the Overview fills exactly one viewport
 * and its panels scroll on their own; every other page scrolls normally.
 */
export function Shell({ initialPrivate, children }: { initialPrivate: boolean; children: ReactNode }) {
  const [hidden, setHidden] = useState(initialPrivate);
  const [commandOpen, setCommandOpen] = useState(false);
  const overview = usePathname() === "/admin";

  const toggle = () => {
    const next = !hidden;
    document.cookie = `${PRIVACY_COOKIE}=${next ? "1" : "0"}; path=/admin; max-age=31536000; samesite=lax`;
    setHidden(next);
  };
  const privacy = { hidden, toggle };

  return (
    <AdminUiContext.Provider value={{ privacy, openCommand: () => setCommandOpen(true) }}>
      {/* Shorter than 800px, the Overview scrolls as a page instead of squeezing its panels. */}
      <div data-private={hidden} className={cn("group/shell flex min-h-svh flex-col", overview && "xl:h-svh xl:min-h-200")}>
        {overview ? (
          children
        ) : (
          <>
            <AdminHeader />
            <main id="main-content" className="mx-auto mb-safe w-full max-w-6xl flex-1 px-4 pt-8 pb-8 lg:pb-12">
              {children}
            </main>
          </>
        )}
      </div>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} privacy={privacy} />
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

/**
 * Brand (back to the Overview), ⌘K and the global controls. `children` are the page's own controls:
 * the Overview puts its month and actions here, in the same row on wide screens and on a second row
 * below that (where the header scrolls away instead of sticking).
 */
export function AdminHeader({ wide = false, children }: { wide?: boolean; children?: ReactNode }) {
  const pathname = usePathname();
  const { openCommand } = useAdminUi();
  const inSettings = pathname === "/admin/settings";

  return (
    <header className={cn("top-0 z-40 border-b-2 border-border bg-background pt-safe", children ? "xl:sticky" : "sticky")}>
      <div
        className={cn(
          "mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4",
          wide ? "max-w-screen-2xl" : "max-w-6xl",
          children ? "py-2 xl:h-14 xl:flex-nowrap xl:py-0" : "h-14"
        )}
      >
        <Link href="/admin" aria-current={pathname === "/admin" ? "page" : undefined} className="order-1 flex shrink-0 items-baseline gap-2 font-display text-lg">
          <span>
            bnetpineda<span className="rounded-sm bg-primary px-1 text-primary-foreground">.dev</span>
          </span>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">/ finance</span>
        </Link>
        {children && <div className="order-3 flex w-full flex-wrap items-center gap-2 xl:order-2 xl:w-auto xl:flex-1">{children}</div>}
        <div className="order-2 ml-auto flex items-center gap-1 xl:order-3">
          <CommandButton onOpen={openCommand} />
          <PrivacyToggle />
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant={inSettings ? "default" : "ghost"} size="icon">
                <Link href="/admin/settings" aria-label="Settings" aria-current={inSettings ? "page" : undefined}>
                  <Settings />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <form action={logout}>
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
