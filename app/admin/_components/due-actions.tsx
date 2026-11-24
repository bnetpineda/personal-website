"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CheckCheck, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/finance/form-state";
import { dayLabel } from "@/lib/finance/dates";
import { postRecurring } from "../_actions/recurring";
import { undoRecurring } from "../_actions/recurring-undo";
import { FormSheet, notify } from "./form";

type Occurrence = { id: string; on: string };

function useRun() {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<FormState>, undo?: () => Promise<FormState>) =>
    startTransition(async () => {
      try {
        const result = await action();
        notify(result, result.ok ? undo : undefined);
      } catch {
        notify({ ok: false, message: "Something went wrong — try again." });
      }
    });
  return { pending, run };
}

/**
 * A due occurrence of an item that waits for confirmation: post it as saved (one tap),
 * adjust it first (bills whose amount changes), or skip it. Skip and Post can be undone from the toast.
 */
export function DueActions({
  name,
  occurrence,
  form,
  onSkip,
}: {
  name: string;
  occurrence: Occurrence;
  form: ReactNode;
  onSkip: () => Promise<FormState>;
}) {
  const { pending, run } = useRun();
  const when = dayLabel(occurrence.on);
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" disabled={pending} aria-label={`Skip ${name}, ${when}`} onClick={() => run(onSkip, () => undoRecurring({ undone: [occurrence] }))}>
        Skip
      </Button>
      <FormSheet
        title={`Post ${name}`}
        description="Adjust the amount or date if it changed."
        trigger={
          <Button variant="outline" size="icon-sm" aria-label={`Adjust and post ${name}, ${when}`} disabled={pending}>
            <Pencil />
          </Button>
        }
      >
        {form}
      </FormSheet>
      <Button
        size="sm"
        disabled={pending}
        aria-label={`Post ${name}, ${when}`}
        onClick={() => run(() => postRecurring([occurrence]), () => undoRecurring({ undone: [occurrence], posted: true }))}
      >
        {pending && <Spinner />}
        Post
      </Button>
    </div>
  );
}

/** Posts every due occurrence at its saved amount, after saying how many. */
export function PostAllButton({ occurrences }: { occurrences: Occurrence[] }) {
  const { pending, run } = useRun();
  const [confirming, setConfirming] = useState(false);
  const count = occurrences.length;
  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirming(true)}>
        {pending ? <Spinner /> : <CheckCheck />} Post all {count}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post all {count} at their saved amounts?</AlertDialogTitle>
            <AlertDialogDescription>
              Each becomes an entry on its due date. Bills whose amount changed are better adjusted one at a time. You can undo this from the message that follows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                setConfirming(false);
                run(() => postRecurring(occurrences), () => undoRecurring({ undone: occurrences, posted: true }));
              }}
            >
              Post {count}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
