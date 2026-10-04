"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  Eye,
  EyeOff,
  History,
  House,
  Link2,
  Moon,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  Sun,
  Wallet,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { addMonths, currentMonth, isMonth, monthLabel } from "@/lib/finance/dates";
import { syncConnections } from "../_actions/connections";
import { notify } from "./form";
import { dashboardHref } from "./nav";

const PAGES = [
  { href: "/admin", label: "Overview", icon: House },
  { href: "/admin/holdings", label: "Portfolio", icon: Wallet },
  { href: "/admin/earnings", label: "Earnings", icon: Coins },
  { href: "/admin/history", label: "Investment history", icon: History },
  { href: "/admin/recurring", label: "Recurring", icon: Repeat },
  { href: "/admin/connections", label: "Connections", icon: Link2 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

const noSubscribe = () => () => {};

/** The same download as Settings → Backup (a route handler that sends the file). */
function downloadBackup() {
  const link = document.createElement("a");
  link.href = "/admin/export";
  link.download = "";
  link.click();
}
/** ⌘ on Apple keyboards, Ctrl elsewhere (Ctrl until the browser says otherwise, so hydration matches). */
function useModifierLabel() {
  return useSyncExternalStore(noSubscribe, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"), () => "Ctrl");
}

/** Opens the menu from the header. Phones skip it: the Overview's own search and panels cover them. */
export function CommandButton({ onOpen }: { onOpen: () => void }) {
  const modifier = useModifierLabel();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" onClick={onOpen} aria-label="Search and commands" aria-keyshortcuts="Control+K Meta+K" className="hidden sm:inline-flex">
          <Search />
          <span className="hidden 2xl:inline">Search</span>
          <Kbd className="hidden 2xl:inline-flex">{modifier} K</Kbd>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Search entries, jump to a page or run an action</TooltipContent>
    </Tooltip>
  );
}

/**
 * ⌘K / Ctrl+K anywhere in the admin: search entries, jump to a page, add an entry, sync, step the
 * Overview's month, hide amounts or switch theme, without leaving the keyboard.
 */
export function CommandMenu({
  open,
  onOpenChange,
  privacy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  privacy: { hidden: boolean; toggle: () => void };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      onOpenChange(!open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const onOverview = pathname === "/admin";
  const current = currentMonth();
  const month = isMonth(params.get("month")) ? params.get("month")! : current;
  const term = query.trim();

  /** Closes the menu, then does the thing. */
  const run = (action: () => void) => {
    onOpenChange(false);
    setQuery("");
    action();
  };
  /** The Overview with some parameters changed and the rest kept (filters stay put). */
  const overviewWith = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(onOverview ? params : undefined);
    for (const [key, value] of Object.entries(changes)) if (value == null) next.delete(key); else next.set(key, value);
    const s = next.toString();
    return s ? `/admin?${s}` : "/admin";
  };
  const addEntry = (kind: "expense" | "income") => {
    const href = overviewWith({ add: kind });
    // Already on the Overview: the sheet opens without a round trip.
    if (onOverview) window.history.pushState(null, "", href);
    else router.push(href);
  };
  const goToMonth = (m: string) => router.push(overviewWith({ month: m === current ? null : m }));
  const sync = () =>
    startTransition(async () => {
      const id = toast.loading("Syncing accounts…");
      try {
        const result = await syncConnections();
        toast.dismiss(id);
        notify(result);
      } catch {
        toast.dismiss(id);
        notify({ ok: false, message: "Sync could not finish. Try again later." });
      }
    });

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
      title="Search and commands"
      description="Search entries, jump to a page or run an action."
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="Search entries or type a command…" />
      <CommandList>
        <CommandEmpty>Nothing matches. Press Enter on “Search entries” to look through every month.</CommandEmpty>
        {term && (
          <CommandGroup heading="Entries">
            <CommandItem value={`search entries ${term}`} onSelect={() => run(() => router.push(dashboardHref({ q: term })))}>
              <Search />
              Search entries for “{term}”
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Add">
          <CommandItem value="add expense" keywords={["new", "spend", "cash"]} onSelect={() => run(() => addEntry("expense"))}>
            <ArrowUpRight />
            Add expense
          </CommandItem>
          <CommandItem value="add income" keywords={["new", "receive"]} onSelect={() => run(() => addEntry("income"))}>
            <ArrowDownLeft />
            Add income
          </CommandItem>
        </CommandGroup>
        {onOverview && (
          <CommandGroup heading="Month">
            <CommandItem value={`previous month ${monthLabel(addMonths(month, -1))}`} onSelect={() => run(() => goToMonth(addMonths(month, -1)))}>
              <ChevronLeft />
              {monthLabel(addMonths(month, -1))}
            </CommandItem>
            <CommandItem value={`next month ${monthLabel(addMonths(month, 1))}`} onSelect={() => run(() => goToMonth(addMonths(month, 1)))}>
              <ChevronRight />
              {monthLabel(addMonths(month, 1))}
            </CommandItem>
            {month !== current && (
              <CommandItem value="this month today" onSelect={() => run(() => goToMonth(current))}>
                <CalendarDays />
                Back to {monthLabel(current)}
              </CommandItem>
            )}
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {PAGES.filter((p) => p.href !== pathname).map(({ href, label, icon: Icon }) => (
            <CommandItem key={href} value={`go to ${label}`} onSelect={() => run(() => router.push(href))}>
              <Icon />
              {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="sync accounts refresh balances" onSelect={() => run(sync)}>
            <RefreshCw />
            Sync accounts
          </CommandItem>
          <CommandItem value={privacy.hidden ? "show amounts privacy" : "hide amounts privacy"} onSelect={() => run(privacy.toggle)}>
            {privacy.hidden ? <Eye /> : <EyeOff />}
            {privacy.hidden ? "Show amounts" : "Hide amounts"}
          </CommandItem>
          <CommandItem value="switch theme dark light mode" onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
          </CommandItem>
          <CommandItem value="export backup json download" onSelect={() => run(downloadBackup)}>
            <Download />
            Export a JSON backup
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
