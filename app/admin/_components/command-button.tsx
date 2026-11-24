"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const noSubscribe = () => () => {};

/** ⌘ on Apple keyboards, Ctrl elsewhere (Ctrl until the browser says otherwise, so hydration matches). */
function useModifierLabel() {
  return useSyncExternalStore(noSubscribe, () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"), () => "Ctrl");
}

/** Starts loading the menu's code, e.g. when the pointer reaches the button, so opening it doesn't wait. */
export const preloadCommandMenu = () => void import("./command-menu");

/** Search and commands, the fast way to everything; the visible navigation sits beside it. */
export function CommandButton({ onOpen }: { onOpen: () => void }) {
  const modifier = useModifierLabel();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" data-command-trigger onClick={onOpen} onPointerEnter={preloadCommandMenu} onFocus={preloadCommandMenu} aria-label="Search and commands" aria-keyshortcuts="Control+K Meta+K">
          <Search />
          <span className="hidden 2xl:inline">Search</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Search entries, jump anywhere or run an action <Kbd>{modifier} K</Kbd></TooltipContent>
    </Tooltip>
  );
}

/** ⌘K / Ctrl+K toggles the menu from anywhere in the admin, before its code has loaded. */
export function useCommandShortcut(toggle: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}
