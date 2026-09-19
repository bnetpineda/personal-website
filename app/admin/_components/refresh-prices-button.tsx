"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { RefreshSummary } from "@/lib/finance/service";
import { refreshPrices } from "../_actions/prices";

export function RefreshPricesButton() {
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<RefreshSummary | null>(null);
  const [failed, setFailed] = useState(false);

  const run = () =>
    startTransition(async () => {
      try {
        setSummary(await refreshPrices());
        setFailed(false);
      } catch {
        setFailed(true);
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={run} disabled={pending}>
        {pending ? <Spinner /> : <RefreshCw />}
        {pending ? "Refreshing…" : "Refresh prices"}
      </Button>
      <p role="status" aria-live="polite" className="font-mono text-xs text-muted-foreground">
        {failed
          ? "Refresh failed — try again."
          : summary &&
            `Updated ${summary.updated}${summary.fxUpdated ? ` · FX ${summary.fxUpdated}` : ""}${
              summary.failed.length ? ` · ${summary.failed.length} failed` : ""
            }`}
      </p>
      {summary && summary.failed.length > 0 && (
        <ul className="max-w-xs text-right font-mono text-xs text-destructive">
          {summary.failed.slice(0, 4).map((f) => (
            <li key={`${f.name}-${f.reason}`}>
              {f.name}: {f.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
