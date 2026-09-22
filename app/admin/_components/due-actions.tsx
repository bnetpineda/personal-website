"use client";

import { useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/finance/schemas";
import { FormSheet } from "./form";

/** Post (opens a prefilled entry form, so a bill's real amount can be typed in) or skip a due occurrence. */
export function DueActions({ name, form, onSkip }: { name: string; form: ReactNode; onSkip: () => Promise<FormState> }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await onSkip();
          })
        }
      >
        {pending && <Spinner />}
        Skip
      </Button>
      <FormSheet title={`Post ${name}`} description="Adjust the amount or date if it changed." trigger={<Button size="sm">Post</Button>}>
        {form}
      </FormSheet>
    </div>
  );
}
