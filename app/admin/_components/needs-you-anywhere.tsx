"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getInboxData } from "../_actions/notifications";
import { NeedsYou, type InboxProps } from "./dashboard";
import { notify } from "./form";

/**
 * Needs you in place on pages other than the Overview: its data loads when opened, so those pages
 * don't pay for it, and reloads while open when an alert is fixed or dismissed.
 */
export function NeedsYouAnywhere({ alerts }: { alerts: number }) {
  const [inbox, setInbox] = useState<InboxProps | null>(null);
  const [pending, startTransition] = useTransition();
  const open = inbox != null;
  const seen = useRef(alerts);

  useEffect(() => {
    if (seen.current === alerts) return;
    seen.current = alerts;
    if (open) getInboxData().then(setInbox).catch(() => {});
  }, [alerts, open]);

  if (inbox) return <NeedsYou {...inbox} defaultOpen onClosed={() => setInbox(null)} />;
  return (
    <Button
      variant="outline"
      size="sm"
      className="relative"
      disabled={pending}
      aria-label={`Needs you: ${alerts}`}
      onClick={() => startTransition(async () => {
        try {
          setInbox(await getInboxData());
        } catch {
          notify({ ok: false, message: "Couldn't open Needs you. Try again." });
        }
      })}
    >
      {pending ? <Spinner /> : <Bell />}
      <span className="hidden sm:inline">Needs you</span>
      <Badge className="absolute -top-1 -right-1 sm:static">{alerts}</Badge>
    </Button>
  );
}
