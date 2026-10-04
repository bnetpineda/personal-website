"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { dismissNotifications } from "../_actions/notifications";
import { notify } from "./form";

/** Hides an alert (or an account's alerts) until the situation changes; the toast can bring them back. */
export function DismissNotificationButton({ keys, title }: { keys: string[]; title: string }) {
  const [pending, startTransition] = useTransition();
  const dismiss = () =>
    startTransition(async () => {
      try {
        const result = await dismissNotifications(keys, true);
        notify(result, result.ok ? () => dismissNotifications(keys, false) : undefined);
      } catch {
        notify({ ok: false, message: "Couldn't save that change. Try again." });
      }
    });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Dismiss: ${title}`} disabled={pending} onClick={dismiss}>
          {pending ? <Spinner /> : <X />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Dismiss</TooltipContent>
    </Tooltip>
  );
}
