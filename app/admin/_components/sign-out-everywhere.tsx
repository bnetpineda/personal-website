"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signOutEverywhere } from "../_actions/auth";
import { notify } from "./form";

/** Settings: revoke every session (a lost phone, a shared computer). Ends with this device at the login page. */
export function SignOutEverywhere() {
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
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <LogOut /> Sign out everywhere
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
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
