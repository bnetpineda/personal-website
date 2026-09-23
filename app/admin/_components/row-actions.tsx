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
import { CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions } from "@/components/ui/item";
import { Sheet } from "@/components/ui/sheet";
import { TableCell, TableRow } from "@/components/ui/table";
import { Spinner } from "@/components/ui/spinner";
import type { FormState } from "@/lib/finance/schemas";
import { FormSheetContent, notify } from "./form";

type Action = () => Promise<FormState | void>;

/** Extra menu item that opens its own sheet (e.g. "Edit details" next to "Buy / sell"). */
export interface RowSheet {
  label: string;
  icon: ReactNode;
  title: string;
  description?: string;
  content: ReactNode;
}

export interface RowActionsProps<D = unknown> {
  name: string;
  editTitle?: string;
  editDescription?: string;
  /** Menu label for the edit sheet (default "Edit"). */
  editLabel?: string;
  editIcon?: ReactNode;
  editForm?: ReactNode;
  /** Controlled edit sheet — lets EditableRow open it when the row is tapped. */
  editOpen?: boolean;
  onEditOpenChange?: (open: boolean) => void;
  sheets?: RowSheet[];
  /** Extra menu items (e.g. Pause/Resume), shown after the sheets. */
  actions?: { label: string; icon: ReactNode; run: Action }[];
  archived?: boolean;
  onToggleArchive?: Action;
  onDelete?: () => Promise<FormState & { deleted?: D }>;
  /**
   * With a restore action, delete runs straight away and the toast offers "Undo"
   * instead of asking first (cheap, fully reversible deletes like single entries).
   */
  onRestore?: (deleted: D) => Promise<FormState>;
  deleteWarning?: string;
}

/** "…" menu for a row: edit in a sheet, extra sheets/actions, archive/restore, delete. */
export function RowActions<D>({
  name,
  editTitle,
  editDescription,
  editLabel = "Edit",
  editIcon = <Pencil />,
  editForm,
  editOpen,
  onEditOpenChange,
  sheets = [],
  actions,
  archived,
  onToggleArchive,
  onDelete,
  onRestore,
  deleteWarning = "This can't be undone.",
}: RowActionsProps<D>) {
  const [uncontrolledEditing, setUncontrolledEditing] = useState(false);
  const editing = editOpen ?? uncontrolledEditing;
  const setEditing = onEditOpenChange ?? setUncontrolledEditing;
  const [openSheet, setOpenSheet] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const run = (action: Action, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) {
        setError(result.message ?? "Something went wrong.");
        notify({ ok: false, message: result.message ?? "Something went wrong." });
      } else {
        setError(undefined);
        if (result) notify(result);
        after?.();
      }
    });

  const deleteNow = () =>
    startTransition(async () => {
      const result = await onDelete!();
      const { deleted } = result;
      notify(result, result.ok && deleted !== undefined && onRestore ? () => onRestore(deleted) : undefined);
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
              {editIcon} {editLabel}
            </DropdownMenuItem>
          )}
          {sheets.map((s) => (
            <DropdownMenuItem key={s.label} onSelect={() => setOpenSheet(s.label)}>
              {s.icon} {s.label}
            </DropdownMenuItem>
          ))}
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
              <DropdownMenuItem variant="destructive" onSelect={() => (onRestore ? deleteNow() : setConfirming(true))}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editForm && (
        <Sheet open={editing} onOpenChange={setEditing}>
          <FormSheetContent title={editTitle ?? `Edit ${name}`} description={editDescription} onClose={() => setEditing(false)}>
            {editForm}
          </FormSheetContent>
        </Sheet>
      )}

      {sheets.map((s) => (
        <Sheet key={s.label} open={openSheet === s.label} onOpenChange={(open) => setOpenSheet(open ? s.label : null)}>
          <FormSheetContent title={s.title} description={s.description} onClose={() => setOpenSheet(null)}>
            {s.content}
          </FormSheetContent>
        </Sheet>
      ))}

      {onDelete && !onRestore && (
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

/**
 * List row that opens its edit sheet when tapped anywhere. The row's content sits in a real
 * <button> (keyboard + screen readers); its `after:` overlay stretches the hit area over the
 * whole Item, while the "…" menu stays on top.
 */
export function EditableRow<D>({
  media,
  aside,
  children,
  ...actions
}: RowActionsProps<D> & { media?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <Item size="sm" variant="interactive">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
      >
        <span className="sr-only">{actions.editLabel ?? "Edit"}:</span>
        {media}
        {children}
        {aside}
      </button>
      <ItemActions>
        <RowActions {...actions} editOpen={editing} onEditOpenChange={setEditing} />
      </ItemActions>
    </Item>
  );
}

/** Card header whose title opens the edit sheet (debt cards), with the "…" menu on the right. */
export function EditableCardHeader<D>({
  title,
  description,
  ...actions
}: RowActionsProps<D> & { title: ReactNode; description?: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <CardHeader>
      <CardTitle>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-sm text-left uppercase underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="sr-only">{actions.editLabel ?? "Edit"}: </span>
          {title}
        </button>
      </CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
      <CardAction>
        <RowActions {...actions} editOpen={editing} onEditOpenChange={setEditing} />
      </CardAction>
    </CardHeader>
  );
}

/**
 * Table row that opens its edit sheet when tapped anywhere: `lead` (the first cell's content)
 * sits in the <button>, whose overlay covers the row; `children` are the remaining <TableCell>s.
 */
export function EditableTableRow<D>({
  lead,
  children,
  ...actions
}: RowActionsProps<D> & { lead: ReactNode; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <TableRow className="relative">
      <TableCell>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
        >
          <span className="sr-only">{actions.editLabel ?? "Edit"}: </span>
          {lead}
        </button>
      </TableCell>
      {children}
      <TableCell className="text-right">
        <div className="relative z-10">
          <RowActions {...actions} editOpen={editing} onEditOpenChange={setEditing} />
        </div>
      </TableCell>
    </TableRow>
  );
}
