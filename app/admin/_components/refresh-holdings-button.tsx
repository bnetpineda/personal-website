"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { syncConnections } from "../_actions/connections";
import { continueInvestmentHistory, holdingCostRefreshJobs } from "../_actions/history";
import { refreshPrices } from "../_actions/prices";
import { notify } from "./form";

/** One visible refresh covers balances, prices and configured purchase histories. */
export function RefreshHoldingsButton({ hasConnections }: { hasConnections: boolean }) {
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState("");
  const run = () => startTransition(async () => {
    let attention = false;
    try {
      setStage("Updating balances…");
      if (hasConnections) attention = !(await syncConnections()).ok;
      setStage("Updating prices…");
      attention = (await refreshPrices()).failed.length > 0 || attention;
      const jobs = await holdingCostRefreshJobs();
      for (let i = 0; i < jobs.length; i++) {
        setStage(`Updating purchase history ${i + 1}/${jobs.length}…`);
        const result = await continueInvestmentHistory(jobs[i].id);
        attention = !result.ok || Boolean(result.more) || attention;
        if (result.message?.includes("rate limit")) break;
      }
      notify({ ok: !attention, message: attention ? "Saved updates. Some sources need attention in Connections or Investment history." : "Holdings and P/L updated." });
    } catch { notify({ ok: false, message: "Refresh could not finish. Saved balances and history were kept." }); }
    finally { setStage(""); }
  });
  return <div className="flex flex-col items-end gap-1"><Button variant="outline" disabled={pending} onClick={run}>
    {pending ? <Spinner /> : <RefreshCw />}{pending ? "Refreshing…" : "Refresh"}
  </Button>{stage && <p role="status" className="text-xs text-muted-foreground">{stage}</p>}</div>;
}
