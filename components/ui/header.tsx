"use client";

import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SocialRow } from "@/components/ui/social-row";
import { useActiveSection } from "@/hooks/use-active-section";
import { NAV_LINKS, SOCIAL_LINKS } from "@/lib/constants";

export function Header() {
  const [open, setOpen] = useState(false);
  const active = useActiveSection();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <header className="sticky top-0 z-40 border-b-2 border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <a href="#top" className="font-display text-lg" aria-label="bnetpineda.dev home">
            bnetpineda<span className="rounded-sm bg-primary px-1 text-primary-foreground">.dev</span>
          </a>
          <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((n) => (
              <Button key={n.href} asChild size="sm" variant={active === n.href.slice(1) ? "default" : "ghost"}>
                <a href={n.href} aria-current={active === n.href.slice(1) ? "location" : undefined}>{n.label}</a>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <a href="#contact">Hire me</a>
            </Button>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
          </div>
        </div>
      </header>

      <SheetContent showCloseButton={false} className="w-80 max-w-full">
        <SheetHeader>
          <div className="flex items-center justify-between gap-4">
            <SheetTitle>Menu</SheetTitle>
            <SheetClose asChild>
              <Button variant="outline" size="icon" aria-label="Close menu"><X /></Button>
            </SheetClose>
          </div>
          <SheetDescription>Explore the work, the story, and the tools.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile navigation" className="grid gap-2 px-4">
          {NAV_LINKS.map((n, i) => (
            <Button key={n.href} asChild size="lg" variant={active === n.href.slice(1) ? "default" : "ghost"} className="justify-between">
              <a href={n.href} onClick={() => setOpen(false)}>
                {n.label}<span className="font-mono text-xs">0{i + 1}</span>
              </a>
            </Button>
          ))}
        </nav>
        <SheetFooter>
          <Button asChild size="lg">
            <a href="#contact" onClick={() => setOpen(false)}>Hire me <ArrowRight /></a>
          </Button>
          <SocialRow items={SOCIAL_LINKS.slice(0, 3)} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
