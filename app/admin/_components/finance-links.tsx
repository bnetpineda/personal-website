import Link from "next/link";
import { Button } from "@/components/ui/button";

export function FinanceLinks({ current }: { current: string }) {
  return <nav aria-label="Account automation" className="mb-6 flex flex-wrap gap-2">
    {[["connections", "Connections"], ["inbox", "Import inbox"], ["history", "Investment history"], ["earnings", "Earnings"], ["notifications", "Notifications"]].map(([path, label]) =>
      <Button key={path} asChild variant={current === path ? "default" : "outline"} size="sm"><Link href={`/admin/${path}`} aria-current={current === path ? "page" : undefined}>{label}</Link></Button>)}
  </nav>;
}
