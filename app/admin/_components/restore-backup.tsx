"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { MAX_UPLOAD_BYTES } from "@/lib/finance/backup-limits";
import { previewRestore, restoreFromBackup, type RestorePreview } from "../_actions/backup";
import { FormField, FormSheetContent, notify } from "./form";

/** Gzips the backup in the browser when it can, so a large one still fits a Server Action upload. */
async function backupFormData(file: File): Promise<FormData> {
  const formData = new FormData();
  if (typeof CompressionStream === "undefined") {
    formData.set("backup", file);
    return formData;
  }
  const zipped = await new Response(file.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  formData.set("backup", new File([zipped], `${file.name}.gz`, { type: "application/gzip" }));
  return formData;
}

/**
 * Account menu → Restore from backup: check a backup file, then add what's missing after a confirm.
 * Never overwrites or deletes. Opened by the menu (no trigger of its own).
 */
export function RestoreBackup({ open, onOpenChange, onCloseAutoFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Without a trigger of its own, the opener says where focus goes back to. */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [upload, setUpload] = useState<FormData | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setUpload(null);
    setPreview(null);
    setError(undefined);
    setConfirming(false);
  };
  const change = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const check = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("backup");
    setPreview(null);
    if (!(file instanceof File) || file.size === 0) return setError("Choose a backup file.");
    startTransition(async () => {
      try {
        const formData = await backupFormData(file);
        if ((formData.get("backup") as File).size > MAX_UPLOAD_BYTES) return setError("That file is too large to upload.");
        const result = await previewRestore(formData);
        setError(result.ok ? undefined : result.message);
        setPreview(result.ok ? result : null);
        setUpload(result.ok ? formData : null);
      } catch {
        setError("The backup couldn't be checked. Try again.");
      }
    });
  };

  const restore = () => startTransition(async () => {
    if (!upload) return;
    try {
      const result = await restoreFromBackup(upload);
      notify(result);
      if (result.ok) change(false);
      else setConfirming(false);
    } catch {
      notify({ ok: false, message: "The restore didn't finish. Try again." });
      setConfirming(false);
    }
  });

  const fresh = preview?.fresh ?? 0;
  return (
    <Sheet open={open} onOpenChange={change}>
      <FormSheetContent
        title="Restore from backup"
        description="Adds what's missing from an exported JSON file. Nothing already here is changed or deleted, and account credentials are never part of a backup."
        onClose={() => change(false)}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <form onSubmit={check} className="flex flex-col gap-6">
          <FormField id="restore-backup" label="Backup file" error={error} description="A finance-export JSON from Export a backup.">
            <Input id="restore-backup" name="backup" type="file" accept=".json,application/json" required disabled={pending}
              aria-invalid={Boolean(error)} onChange={() => { setPreview(null); setUpload(null); setError(undefined); }} />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" variant={preview ? "outline" : "default"} disabled={pending}>
              {pending && !confirming && <Spinner />} Check backup
            </Button>
          </div>
        </form>

        {preview?.counts && (
          <div className="mt-6 flex flex-col gap-4">
            <p role="status" className="text-sm">
              {fresh ? `${fresh} new ${fresh === 1 ? "entry" : "entries"} to add.` : "Everything in this backup is already here."}
            </p>
            <ItemGroup>
              {preview.counts.map((c) => (
                <Item key={c.label} size="xs">
                  <ItemContent>
                    <ItemTitle>{c.label}</ItemTitle>
                    <ItemDescription>{c.fresh} new, {c.present} already present</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
            <div className="flex justify-end">
              <Button disabled={pending || !fresh} onClick={() => setConfirming(true)}>Restore</Button>
            </div>
          </div>
        )}

        <AlertDialog open={confirming} onOpenChange={(next) => { if (!pending) setConfirming(next); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Add {fresh} {fresh === 1 ? "entry" : "entries"} from this backup?</AlertDialogTitle>
              <AlertDialogDescription>
                Only records that aren&apos;t here yet are added. Existing records stay exactly as they are; to undo, you&apos;d delete the added ones by hand.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button disabled={pending} onClick={restore}>
                {pending && <Spinner />} Restore
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </FormSheetContent>
    </Sheet>
  );
}
