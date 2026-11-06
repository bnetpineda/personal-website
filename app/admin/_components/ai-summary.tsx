"use client";

import { useTransition } from "react";
import { ArrowRight, CircleCheck, Info, OctagonAlert, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import type { FinanceSummary } from "@/lib/finance/ai-summary";
import { refreshAiSummary } from "../_actions/ai-summary";
import { notify } from "./form";
import { Masked } from "./privacy";
import { EmptyState, Panel } from "./ui";

const TONE = {
  good: { icon: CircleCheck, className: "text-success", label: "Going well" },
  watch: { icon: TriangleAlert, className: "text-warning", label: "Worth watching" },
  act: { icon: OctagonAlert, className: "text-destructive", label: "Needs action" },
} as const;

/** AI text quotes amounts, so all of it follows Hide amounts: blurred, with its digits dotted out. */
function Private({ text }: { text: string }) {
  return <span className="transition group-data-[private=true]/shell:blur-sm"><Masked text={text} /></span>;
}

function RefreshButton({ label }: { label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={label}
      onClick={() => startTransition(async () => {
        try {
          notify(await refreshAiSummary());
        } catch {
          notify({ ok: false, message: "Couldn't refresh the feedback. Try again." });
        }
      })}
    >
      {pending ? <Spinner /> : <RefreshCw />}
      {pending ? "Thinking…" : label === "Get feedback" ? label : "Refresh"}
    </Button>
  );
}

/**
 * Under the cash-flow chart: what an AI coach makes of the numbers, written from totals only (no payees or
 * notes). It refreshes on demand and with the daily sync when the numbers changed; the time says how old it is.
 */
export function AiSummaryPanel({ summary, updated, model, configured, className }: {
  summary: FinanceSummary | null;
  /** "Updated 3 h ago", made on the server so it can't differ after hydration. */
  updated: string | null;
  model: string | null;
  configured: boolean;
  className?: string;
}) {
  // An icon in the header, not a line in the body: the panel fits without scrolling.
  const about = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" touch aria-label="About AI feedback">
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>How this feedback is made</PopoverTitle>
        </PopoverHeader>
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <p>An AI model{model ? ` (${model})` : ""} reads your totals through the Vercel AI Gateway: net worth, debts, monthly income and spending, category totals, budgets and goals. Payee names, descriptions and notes are never sent.</p>
          <p>It updates with the daily sync when your numbers change, or when you press Refresh. It can be wrong, and it isn&apos;t professional financial advice.</p>
        </div>
      </PopoverContent>
    </Popover>
  );
  return (
    // Quiet like the other dashboard panels, but sized to its content: it is short by design and never scrolls.
    <Panel
      fill
      scroll={false}
      id="ai-feedback"
      title={<span className="flex items-center gap-2"><Sparkles aria-hidden className="size-4" /> AI feedback</span>}
      action={<>{about}{configured && <RefreshButton label={summary ? "Refresh AI feedback" : "Get feedback"} />}</>}
      className={className}
    >
      {!configured ? (
        <EmptyState size="sm" title="AI feedback is off">Add AI_GATEWAY_API_KEY in the hosting environment to get feedback on your numbers.</EmptyState>
      ) : !summary ? (
        <EmptyState size="sm" title="No feedback yet">Press Get feedback for a read on your cash, debts, spending and goals.</EmptyState>
      ) : (
        // A glance that fits its panel: the headline, a line per point, a line per step, then how old it is.
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold" role="status">
            <Private text={summary.headline} />
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {summary.points.map((point) => {
              const tone = TONE[point.tone];
              return (
                <li key={point.text} className="flex items-start gap-2">
                  <tone.icon aria-label={tone.label} className={cn("mt-0.5 size-4 shrink-0", tone.className)} />
                  <Private text={point.text} />
                </li>
              );
            })}
          </ul>
          {summary.actions.length > 0 && (
            <section aria-label="Do next" className="flex flex-col gap-1">
              <h3 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">Do next</h3>
              <ul className="flex flex-col gap-1 text-sm font-medium">
                {summary.actions.map((action) => (
                  <li key={action} className="flex items-start gap-2">
                    <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <Private text={action} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-xs text-muted-foreground">
            {updated ?? "Updated"} · totals only
            {summary.caveat && <> · <Private text={summary.caveat} /></>}
          </p>
        </div>
      )}
    </Panel>
  );
}
