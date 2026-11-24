import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface FilterLink {
  key: string;
  label: ReactNode;
  href: string;
  active: boolean;
}

/**
 * A row of filter links that need new data from the server (History's account and type, Holdings'
 * asset class, Earnings' range). One look everywhere: the active filter is the lime default button,
 * the rest outline, and the active link says so to screen readers with aria-current.
 */
export function FilterLinks({ label, links, children }: { label: string; links: FilterLink[]; children?: ReactNode }) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      {links.map((link) => (
        <Button key={link.key} asChild size="sm" variant={link.active ? "default" : "outline"}>
          <Link href={link.href} aria-current={link.active ? "true" : undefined}>
            {link.label}
          </Link>
        </Button>
      ))}
      {children}
    </nav>
  );
}
