"use client";

import { Menu } from "lucide-react";
import { motion, useScroll, useSpring } from "motion/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useActiveSection } from "@/hooks/use-active-section";
import { cn } from "@/lib/utils";
import { NAV_LINKS } from "@/lib/constants";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

export function Header() {
  const activeSection = useActiveSection();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-secondary-background border-b-4 border-border shadow-shadow">
      <motion.div
        className="absolute bottom-0 left-0 right-0 h-1 bg-main origin-left z-50"
        style={{ scaleX }}
      />
      <nav className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between relative z-40">
        <a href="https://github.com/bnetpineda" target="_blank" className="flex items-center gap-2">
          <Avatar className="size-10 border-2 border-border">
            <AvatarImage src="/image.webp" alt="Profile" />
            <AvatarFallback>MP</AvatarFallback>
          </Avatar>
        </a>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "px-4 py-2 font-heading text-sm uppercase tracking-wide transition-all border-2 rounded-base",
                activeSection === link.href.slice(1)
                  ? "bg-main text-main-foreground border-border shadow-shadow translate-x-boxShadowX translate-y-boxShadowY shadow-none"
                  : "bg-transparent border-transparent text-foreground hover:bg-main hover:text-main-foreground hover:border-border hover:shadow-shadow"
              )}
            >
              {link.label}
            </a>
          ))}
          <ThemeToggle />
        </div>

        {/* Mobile Navigation */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="border-2 border-transparent hover:border-border">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-80 border-l-4">
              <SheetHeader className="flex-row items-center gap-3 border-b-4 border-border pb-4">
                <Avatar className="size-10 border-2 border-border">
                  <AvatarImage src="/image.webp" alt="Profile" />
                  <AvatarFallback>MP</AvatarFallback>
                </Avatar>
                <SheetTitle className="text-left text-xl uppercase">Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-2 px-2 mt-4">
                {NAV_LINKS.map((link) => (
                  <SheetClose key={link.href} asChild>
                    <a
                      href={link.href}
                      className={cn(
                        "text-lg font-heading py-4 px-4 transition-all border-2 border-transparent hover:bg-main hover:border-border hover:shadow-shadow rounded-base uppercase",
                        activeSection === link.href.slice(1)
                          ? "bg-main border-border shadow-shadow translate-x-boxShadowX translate-y-boxShadowY shadow-none"
                          : ""
                      )}
                    >
                      {link.label}
                    </a>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <Button size="lg" className="mt-8 w-full border-2" asChild>
                    <a href="#contact">Get in Touch</a>
                  </Button>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
