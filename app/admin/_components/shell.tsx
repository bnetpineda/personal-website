"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AddEntryAnywhere } from "./add-entry";
import { BottomNav, MoreMenu, SideNav } from "./admin-nav";
import { CommandButton, CommandMenu } from "./command-menu";
import { NeedsYouAnywhere } from "./needs-you-anywhere";
import { PRIVACY_COOKIE } from "./nav";

interface AdminUi {
  privacy: { hidden: boolean; toggle: () => void };
  /** How many alerts are waiting in Needs you. */
  alerts: number;
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
 * Dashboard frame: the main navigation (a rail on wide screens, a bottom bar below that), then the
 * page. `data-private` blurs every <Money> (group-data-[private=true]/shell). Pages get the shared
 * header and main; the Overview (/admin) renders its own, because its header carries the month and
 * its actions. On wide screens the Overview fills exactly one viewport and its panels scroll on their
 * own; every other page scrolls normally.
 */
export function Shell({ initialPrivate, alerts, children }: { initialPrivate: boolean; alerts: number; children: ReactNode }) {
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
    <AdminUiContext.Provider value={{ privacy, alerts, openCommand: () => setCommandOpen(true) }}>
      <a href="#main-content" className="sr-only rounded-md border-2 border-border bg-background px-4 py-2 text-foreground focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50">Skip to content</a>
      <SideNav />
      {/* Shorter than 800px, the Overview scrolls as a page instead of squeezing its panels. */}
      <div data-private={hidden} className={cn("group/shell flex min-h-svh flex-col pb-20 lg:pb-0 lg:pl-20", overview && "xl:h-svh xl:min-h-200")}>
        {overview ? (
          children
        ) : (
          <>
            <AdminHeader />
            <main id="main-content" tabIndex={-1} className="mx-auto mb-safe w-full max-w-6xl flex-1 px-4 pt-6 pb-8 lg:pb-12">
              {children}
            </main>
          </>
        )}
      </div>
      <BottomNav />
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} privacy={privacy} />
      <Toaster />
    </AdminUiContext.Provider>
  );
}

/** Portals don't inherit the shell's privacy state, so read-only amounts in a sheet sit inside one of these. */
export function PrivateRegion({ children }: { children: ReactNode }) {
  const { hidden } = useAdminUi().privacy;
  return <div data-private={hidden} className="group/shell">{children}</div>;
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
 * The brand (until the rail takes over), search and the global controls. `children` are the page's
 * own controls: the Overview puts its month and actions here, in the same row on wide screens and on
 * a second row below that (where the header scrolls away instead of sticking). Other pages get the
 * same Add sheet, opening in place.
 */
export function AdminHeader({ wide = false, children }: { wide?: boolean; children?: ReactNode }) {
  const { openCommand, alerts } = useAdminUi();

  return (
    <header className={cn("top-0 z-40 border-b-2 border-border bg-background pt-safe", children ? "xl:sticky" : "sticky")}>
      <div
        className={cn(
          "mx-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4",
          wide ? "max-w-screen-2xl" : "max-w-6xl",
          children ? "py-2 xl:min-h-14 xl:flex-nowrap xl:py-1" : "min-h-14 py-2"
        )}
      >
        <Link href="/admin" className={cn("order-1 flex shrink-0 items-baseline gap-2 font-display text-lg", children ? "xl:hidden" : "lg:hidden")}>
          <span>
            bnetpineda<span className="rounded-sm bg-primary px-1 text-primary-foreground">.dev</span>
          </span>
        </Link>
        <div className="order-2 ml-auto flex items-center gap-1 xl:order-3">
          {!children && alerts > 0 && <NeedsYouAnywhere alerts={alerts} />}
          {!children && <AddEntryAnywhere />}
          <CommandButton onOpen={openCommand} />
          <PrivacyToggle />
          <MoreMenu />
        </div>
        {children && <div className="order-3 flex w-full flex-wrap items-center gap-2 xl:order-2 xl:w-auto xl:flex-1">{children}</div>}
      </div>
    </header>
  );
}
