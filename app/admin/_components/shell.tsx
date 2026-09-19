"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { logout } from "../_actions/auth";
import { ADMIN_NAV, PRIVACY_COOKIE, isActivePath } from "./nav";

const PrivacyContext = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: false, toggle: () => {} });

/** Dashboard frame. `data-private` blurs every <Money> (group-data-[private=true]/shell). */
export function Shell({ initialPrivate, children }: { initialPrivate: boolean; children: ReactNode }) {
  const [hidden, setHidden] = useState(initialPrivate);

  const toggle = () => {
    const next = !hidden;
    document.cookie = `${PRIVACY_COOKIE}=${next ? "1" : "0"}; path=/admin; max-age=31536000; samesite=lax`;
    setHidden(next);
  };

  return (
    <PrivacyContext.Provider value={{ hidden, toggle }}>
      <div data-private={hidden} className="group/shell flex min-h-svh flex-col">
        {children}
      </div>
    </PrivacyContext.Provider>
  );
}

function PrivacyToggle() {
  const { hidden, toggle } = useContext(PrivacyContext);
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

export function AdminHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b-2 border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/admin" className="flex items-baseline gap-2 font-display text-lg">
          <span>
            bnetpineda<span className="rounded-sm bg-primary px-1 text-primary-foreground">.dev</span>
          </span>
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">/ admin</span>
        </Link>
        <nav aria-label="Admin" className="hidden items-center gap-1 lg:flex">
          {ADMIN_NAV.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Button key={href} asChild size="sm" variant={active ? "default" : "ghost"}>
                <Link href={href} aria-current={active ? "page" : undefined}>
                  <Icon />
                  {label}
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="flex items-center gap-1">
          <PrivacyToggle />
          <ThemeToggle />
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

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t-2 border-border bg-background pb-safe lg:hidden">
      {ADMIN_NAV.map(({ href, short, icon: Icon }) => {
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
