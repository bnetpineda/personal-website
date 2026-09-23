"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, EyeOff, LogOut, Minus, Moon, Plus, RefreshCw, Search, Sun } from "lucide-react";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/components/theme-provider";
import { logout } from "../_actions/auth";
import { refreshPrices } from "../_actions/prices";
import { ADMIN_NAV, transactionsHref } from "./nav";
import { useAdminUi, useModKey } from "./shell";

/** ⌘K / Ctrl+K (or "/"): jump to a page, search entries, or run an action. */
export function CommandMenu() {
  const router = useRouter();
  const { commandOpen, setCommandOpen, setAdding, privacy } = useAdminUi();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const mod = useModKey();

  const close = () => {
    setCommandOpen(false);
    setQuery("");
  };
  const go = (href: string) => {
    close();
    router.push(href);
  };
  const run = (fn: () => void) => {
    close();
    fn();
  };

  const refresh = () =>
    startTransition(async () => {
      const id = toast.loading("Refreshing prices…");
      try {
        const s = await refreshPrices();
        const failed = s.failed.length ? ` · ${s.failed.length} failed` : "";
        toast.success(`Updated ${s.updated} ${s.updated === 1 ? "price" : "prices"}${failed}`, { id });
      } catch {
        toast.error("Refresh failed — try again.", { id });
      }
    });

  // A download, not a page: a plain <a download> keeps the router out of it.
  const download = () => {
    const link = document.createElement("a");
    link.href = "/admin/export";
    link.download = "";
    link.click();
  };

  const term = query.trim();

  return (
    <CommandDialog
      open={commandOpen}
      onOpenChange={(open) => (open ? setCommandOpen(true) : close())}
      title="Search and commands"
      description={`Jump to a page, search entries or run an action (${mod}K).`}
    >
      <CommandInput placeholder="Search entries, pages, actions…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {/* forceMount on the group too: cmdk scores the group before the item's new value lands,
            so fast typing could hide it. */}
        {term && (
          <CommandGroup heading="Search" forceMount>
            <CommandItem value={`search ${term}`} forceMount onSelect={() => go(transactionsHref({ q: term }))}>
              <Search /> Search entries for “{term}”
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Add">
          <CommandItem value="add expense spend" onSelect={() => run(() => setAdding("expense"))}>
            <Minus /> Add expense <CommandShortcut>E</CommandShortcut>
          </CommandItem>
          <CommandItem value="add income earn salary" onSelect={() => run(() => setAdding("income"))}>
            <Plus /> Add income <CommandShortcut>I</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Go to">
          {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
            <CommandItem key={href} value={`go ${label}`} onSelect={() => go(href)}>
              <Icon /> {label}
            </CommandItem>
          ))}
          <CommandItem value="go expenses spending" onSelect={() => go(transactionsHref({ kind: "expense" }))}>
            <Minus /> Expenses
          </CommandItem>
          <CommandItem value="go income earnings" onSelect={() => go(transactionsHref({ kind: "income" }))}>
            <Plus /> Income
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="refresh prices quotes fx" onSelect={() => run(refresh)}>
            <RefreshCw /> Refresh prices
          </CommandItem>
          <CommandItem value="privacy hide show amounts blur" onSelect={() => run(privacy.toggle)}>
            {privacy.hidden ? <Eye /> : <EyeOff />} {privacy.hidden ? "Show amounts" : "Hide amounts"}
          </CommandItem>
          <CommandItem value="theme dark light mode" onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <Sun /> : <Moon />} Switch to {resolvedTheme === "dark" ? "light" : "dark"} mode
          </CommandItem>
          <CommandItem value="export backup download json" onSelect={() => run(download)}>
            <Download /> Download backup (JSON)
          </CommandItem>
          <CommandItem value="log out sign out" onSelect={() => run(() => startTransition(() => logout()))}>
            <LogOut /> Log out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
