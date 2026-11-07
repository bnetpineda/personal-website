"use client";

import { useTransition } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signOutEverywhere } from "../_actions/auth";
import { notify } from "./form";

/**
 * Account menu → Sign out everywhere: revoke every session (a lost phone, a shared computer). Ends with
 * this device at the login page. Opened by the menu (no trigger of its own).
 */
export function SignOutEverywhere({ open, onOpenChange, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Without a trigger of its own, the opener says where focus goes back to. */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [pending, startTransition] = useTransition();
  const run = () => startTransition(async () => {
    // Success redirects to the login page.
    try {
      await signOutEverywhere();
    } catch {
      notify({ ok: false, message: "Couldn't sign out everywhere. Try again." });
    }
  });
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out on every device?</AlertDialogTitle>
          <AlertDialogDescription>
            Every phone, computer and installed app signed in to this admin, this one included, will ask for the password again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={run}>
            {pending && <Spinner />} Sign out everywhere
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
