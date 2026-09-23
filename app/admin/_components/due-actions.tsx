"use client";

import { useTransition, type ReactNode } from "react";
import { CheckCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FormState } from "@/lib/finance/schemas";
import { postRecurring } from "../_actions/recurring";
import { FormSheet, notify } from "./form";

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => {
      try {
        notify(await action());
      } catch {
        notify({ ok: false, message: "Something went wrong — try again." });
      }
    });
  return { pending, run };
}

/**
 * A due occurrence of an item that waits for confirmation: post it as saved (one tap),
 * adjust it first (bills whose amount changes), or skip it.
 */
export function DueActions({
  name,
  occurrence,
  form,
  onSkip,
}: {
  name: string;
  occurrence: { id: string; on: string };
  form: ReactNode;
  onSkip: () => Promise<FormState>;
}) {
  const { pending, run } = useRun();
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(onSkip)}>
        Skip
      </Button>
      <FormSheet
        title={`Post ${name}`}
        description="Adjust the amount or date if it changed."
        trigger={
          <Button variant="outline" size="icon-sm" aria-label={`Adjust and post ${name}`} disabled={pending}>
            <Pencil />
          </Button>
        }
      >
        {form}
      </FormSheet>
      <Button size="sm" disabled={pending} onClick={() => run(() => postRecurring([occurrence]))}>
        {pending && <Spinner />}
        Post
      </Button>
    </div>
  );
}

/** Posts every due occurrence at its saved amount. */
export function PostAllButton({ occurrences }: { occurrences: { id: string; on: string }[] }) {
  const { pending, run } = useRun();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => postRecurring(occurrences))}>
          {pending ? <Spinner /> : <CheckCheck />} Post all
        </Button>
      </TooltipTrigger>
      <TooltipContent>Post all {occurrences.length} at their saved amounts</TooltipContent>
    </Tooltip>
  );
}
