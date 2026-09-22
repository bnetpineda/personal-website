"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/finance/schemas";
import { FormSheetContent } from "./form";

type Action = () => Promise<FormState | void>;

/** "…" menu for a row: edit in a sheet, archive/restore, delete with confirmation. */
export function RowActions({
  name,
  editTitle,
  editForm,
  archived,
  onToggleArchive,
  onDelete,
  deleteWarning = "This can't be undone.",
  actions,
}: {
  name: string;
  editTitle?: string;
  editForm?: ReactNode;
  archived?: boolean;
  onToggleArchive?: Action;
  onDelete?: Action;
  deleteWarning?: string;
  /** Extra menu items (e.g. Pause/Resume), shown after Edit. */
  actions?: { label: string; icon: ReactNode; run: Action }[];
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (action: Action, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) setError(result.message ?? "Something went wrong.");
      else {
        setError(undefined);
        after?.();
      }
    });

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} disabled={pending}>
            {pending ? <Spinner /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {editForm && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil /> Edit
            </DropdownMenuItem>
          )}
          {actions?.map((a) => (
            <DropdownMenuItem key={a.label} onSelect={() => run(a.run)}>
              {a.icon} {a.label}
            </DropdownMenuItem>
          ))}
          {onToggleArchive && (
            <DropdownMenuItem onSelect={() => run(onToggleArchive)}>
              {archived ? <ArchiveRestore /> : <Archive />} {archived ? "Restore" : "Archive"}
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editForm && (
        <Sheet open={editing} onOpenChange={setEditing}>
          <FormSheetContent title={editTitle ?? `Edit ${name}`} onClose={() => setEditing(false)}>
            {editForm}
          </FormSheetContent>
        </Sheet>
      )}

      {onDelete && (
        <AlertDialog
          open={confirming}
          onOpenChange={(open) => {
            setConfirming(open);
            if (!open) setError(undefined);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
              <AlertDialogDescription>{error ?? deleteWarning}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button variant="destructive" disabled={pending} onClick={() => run(onDelete, () => setConfirming(false))}>
                {pending && <Spinner />}
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
