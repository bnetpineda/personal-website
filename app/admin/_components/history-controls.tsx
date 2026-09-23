"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileUp, History } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FormState } from "@/lib/finance/schemas";
import { configureInvestmentHistory, continueInvestmentHistory, importInvestmentReport, prepareHoldingCosts, previewInvestmentReport, setHistoryEnabled, type HistoryPreview } from "../_actions/history";
import { FormField, FormFooter, FormSheet, notify, useFormAction } from "./form";
import { ImportAction, NativeAmount } from "./import-controls";

export function ConfigureHistoryButton({ yesterday }: { yesterday: string }) {
  return <FormSheet trigger={<Button variant="outline"><History />Binance history</Button>} title="Load Binance history" description="Choose a start date for Earn and crypto transfers, and list every Spot pair you have traded."><ConfigureForm yesterday={yesterday} /></FormSheet>;
}
export function ImportHoldingCostsButton({ disabled }: { disabled: boolean }) {
  const [running, setRunning] = useState(false), [status, setStatus] = useState("");
  const stopped = useRef(false);
  useEffect(() => () => { stopped.current = true; }, []);
  const run = async () => {
    stopped.current = false; setRunning(true); setStatus("Finding USDT Spot pairs for your current coins…");
    try {
      const setup = await prepareHoldingCosts();
      if (!setup.ok || !setup.jobs) { setStatus(setup.message ?? "Could not start the import."); return; }
      let failed = 0;
      for (const job of setup.jobs) {
        let more = true;
        while (more && !stopped.current) {
          setStatus(`Importing ${job.scope.slice(5)} purchase and sale history…`);
          const result = await continueInvestmentHistory(job.id);
          if (!result.ok) {
            if (result.message?.includes("rate limit")) { setStatus(result.message); return; }
            failed++; break;
          }
          more = Boolean(result.more);
        }
        if (stopped.current) break;
      }
      setStatus(stopped.current ? "Stopped. Saved progress is ready to resume in Investment history." :
        `Spot cost import finished.${failed ? ` ${failed} streams need attention in Investment history.` : ""}${setup.skipped?.length ? ` Not imported automatically: ${setup.skipped.join(", ")}. Add their pairs in Investment history.` : ""} Add any other pairs you traded there too.`);
    } catch { setStatus("Import interrupted. Resume in Investment history; saved trades are kept."); }
    finally { setRunning(false); }
  };
  return <div className="flex flex-col gap-2"><div className="flex flex-wrap gap-2">
    <Button variant="outline" disabled={disabled || running} onClick={run}><History />{running ? "Importing Spot costs…" : "Import Spot costs"}</Button>
    {running && <Button variant="outline" onClick={() => { stopped.current = true; setStatus("Stopping after this batch…"); }}>Stop</Button>}
  </div>{status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}</div>;
}
function ConfigureForm({ yesterday }: { yesterday: string }) {
  const { state, pending, onSubmit, formKey } = useFormAction(configureInvestmentHistory);
  return <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-6">
    <FormField id="history-from" label="Earn and transfers: start date" description={`Choose your first investment date, from July 14, 2017 through ${yesterday}.`}><DatePicker id="history-from" name="from" today={yesterday} disabled={pending} /></FormField>
    <FormField id="history-pairs" label="Spot trading pairs" description="Up to 20 pairs, separated by commas. Include pairs you no longer hold. Leave empty to import Earn and transfers only."><Input id="history-pairs" name="pairs" placeholder="BTCUSDT, ETHUSDT, SOLUSDT" maxLength={600} disabled={pending} /></FormField>
    <p className="text-sm text-muted-foreground">Each pair starts at its earliest available trade and keeps syncing new fills. Earn and completed crypto transfers import through {yesterday} (UTC), in 30-day batches. Progress survives closing this page. Provider retention limits, delisted pairs, Convert, fiat/P2P and other products can leave gaps.</p>
    <FormFooter state={state} pending={pending}>Save history streams</FormFooter>
  </form>;
}
export function ContinueHistoryButton({ jobs }: { jobs: { id: string; scope: string; enabled: boolean }[] }) {
  const [running, setRunning] = useState(false), [status, setStatus] = useState("");
  const stopped = useRef(false);
  useEffect(() => () => { stopped.current = true; }, []);
  const run = async () => {
    stopped.current = false; setRunning(true);
    try {
      for (const job of jobs.filter((j) => j.enabled)) {
        let more = true;
        while (more && !stopped.current) {
          setStatus(`Importing ${job.scope.replace("spot:", "")}… You can stop after the current batch.`);
          const result = await continueInvestmentHistory(job.id);
          if (!result.ok) { setStatus(result.message ?? "Import paused. Retry later."); notify(result); return; }
          more = Boolean(result.more);
        }
        if (stopped.current) break;
      }
      setStatus(stopped.current ? "Stopped. Saved progress is ready to resume." : "Configured streams are caught up to the available data.");
    } catch { setStatus("Connection interrupted. Resume to continue from saved progress."); }
    finally { setRunning(false); }
  };
  return <div className="flex flex-col gap-2"><div className="flex gap-2"><Button disabled={running || !jobs.some((j) => j.enabled)} onClick={run}>Continue all / sync new trades</Button>
    {running && <Button variant="outline" onClick={() => { stopped.current = true; setStatus("Stopping after the current batch…"); }}>Stop</Button>}</div>
    {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}</div>;
}
export function HistoryToggle({ id, enabled }: { id: string; enabled: boolean }) {
  return <ImportAction action={() => setHistoryEnabled(id, !enabled)}>{enabled ? "Pause" : "Resume"}</ImportAction>;
}
export function ImportInvestmentButton() {
  return <FormSheet trigger={<Button variant="outline"><FileUp />Import IBKR history</Button>} title="Import historical IBKR report"
    description="Add older Activity Flex XML reports. Repeated reports preserve reviews and skip matching transaction IDs."><ReportForm /></FormSheet>;
}
function ReportForm() {
  const ref = useRef<HTMLFormElement>(null), [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<HistoryPreview | null>(null), [result, setResult] = useState<FormState | null>(null);
  const run = (commit: boolean) => {
    if (!ref.current?.reportValidity()) return;
    const data = new FormData(ref.current);
    startTransition(async () => {
      try {
        if (commit) { const saved = await importInvestmentReport(data); setResult(saved); notify(saved); if (saved.ok) { setPreview(null); ref.current?.reset(); } }
        else { setResult(null); setPreview(await previewInvestmentReport(data)); }
      } catch { setResult({ ok: false, message: "The report could not be imported. Retry safely; matching IDs are skipped." }); }
    });
  };
  return <form ref={ref} onSubmit={(e) => { e.preventDefault(); run(false); }} onChange={() => { setPreview(null); setResult(null); }} className="flex flex-col gap-6">
    <p className="text-sm text-muted-foreground">In IBKR Reports → Flex Queries, run an Activity query for each historical date range. Include Cash Transactions (all fields) and Trades (Executions, all fields), then export XML. Use consistent dates across accounts. Up to 2.5 MB and 25,000 entries per file; no 30-day limit. Current balances are unchanged.</p>
    <FormField id="investment-report" label="Activity Flex XML"><Input id="investment-report" name="file" type="file" accept=".xml,text/xml,application/xml" required disabled={pending} /></FormField>
    {preview?.ok && <>
      <Alert variant={preview.conflicts ? "destructive" : "default"}><AlertTitle>History preview</AlertTitle><AlertDescription>
        {preview.coverage?.from} through {preview.coverage?.to} · {preview.accounts?.length} account(s) · {preview.total} entries · {preview.duplicates} already imported.
        {preview.conflicts ? ` ${preview.conflicts} changed records must be checked before importing.` : " Old and overlapping reports can be imported safely."}
      </AlertDescription></Alert>
      <Table><TableHeader><TableRow><TableHead>Activity</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader><TableBody>
        {preview.entries?.map((e) => <TableRow key={`${e.accountKey}:${e.externalId}`}><TableCell>{e.occurredOn}<br />{e.description}</TableCell><TableCell><NativeAmount value={e.amount} currency={e.currency} /></TableCell></TableRow>)}
      </TableBody></Table><p className="text-xs text-muted-foreground">Preview shows the first 10 entries. Imported report ranges are recorded in Investment history.</p>
      <Button type="button" disabled={pending || Boolean(preview.conflicts)} onClick={() => run(true)}>Import full report</Button>
    </>}
    {(result?.message || preview?.message) && <p role="status" className="text-sm">{result?.message ?? preview?.message}</p>}
    <Button type="submit" variant="outline" disabled={pending}>Preview report</Button>
  </form>;
}
