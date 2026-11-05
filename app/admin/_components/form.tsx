"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { initialFormState, type FormState } from "@/lib/finance/schemas";

/* Form plumbing shared by every admin form (Server Action + shadcn Field). */

const FormSheetContext = createContext<{ close: () => void; markClean: () => void } | null>(null);

/** Right-side sheet hosting a form. `trigger` is any button element. */
export function FormSheet({
  trigger,
  title,
  description,
  wide,
  defaultOpen = false,
  onClosed,
  children,
}: {
  trigger: ReactElement;
  title: string;
  description?: string;
  /** For a table, which would otherwise scroll sideways. */
  wide?: boolean;
  defaultOpen?: boolean;
  onClosed?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const change = (next: boolean) => {
    setOpen(next);
    if (!next) onClosed?.();
  };
  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <FormSheetContent title={title} description={description} wide={wide} onClose={() => change(false)}>
        {children}
      </FormSheetContent>
    </Sheet>
  );
}

/** Sheet body for controlled sheets (e.g. opened from a row menu). */
export function FormSheetContent({
  title,
  description,
  wide,
  onClose,
  onCloseAutoFocus,
  children,
}: {
  title: string;
  description?: string;
  wide?: boolean;
  onClose: () => void;
  /** Controlled overlays without a SheetTrigger can restore their own invoking control. */
  onCloseAutoFocus?: ComponentProps<typeof SheetContent>["onCloseAutoFocus"];
  children: ReactNode;
}) {
  // Something typed survives a stray click outside; Escape and the close button ask before throwing it away.
  const dirty = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const hasTyped = () =>
    dirty.current ||
    [...(content.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]), textarea') ?? [])].some((field) => field.value !== field.defaultValue);
  return (
    <SheetContent
      ref={content}
      className={wide ? "sm:max-w-2xl" : undefined}
      onInteractOutside={(event) => {
        if (hasTyped()) event.preventDefault();
      }}
      onEscapeKeyDown={(event) => {
        if (!hasTyped()) return;
        event.preventDefault();
        setConfirmingClose(true);
      }}
      onClickCapture={(event) => {
        if (!hasTyped() || !(event.target as Element).closest('[data-slot="sheet-close"]')) return;
        event.preventDefault();
        event.stopPropagation();
        setConfirmingClose(true);
      }}
      onCloseAutoFocus={(event) => {
        dirty.current = false;
        onCloseAutoFocus?.(event);
      }}
    >
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description ?? title}</SheetDescription>
      </SheetHeader>
      {/* The house scrollbar (shows on hover), like the dashboard panels. */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-4 pb-8" onInput={() => { dirty.current = true; }}>
          <FormSheetContext.Provider value={{ close: onClose, markClean: () => { dirty.current = false; } }}>{children}</FormSheetContext.Provider>
        </div>
      </ScrollArea>
      <AlertDialog open={confirmingClose} onOpenChange={setConfirmingClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard what you typed?</AlertDialogTitle>
            <AlertDialogDescription>Nothing has been saved yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                dirty.current = false;
                setConfirmingClose(false);
                // Past the guard: the sheet is closing for good, so nothing here should stop it.
                onClose();
              }}
            >
              Discard
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SheetContent>
  );
}

type Undo = () => Promise<FormState>;

/** Success/error toast; `undo` adds an "Undo" button that runs it and reports the outcome. */
export function notify(state: FormState, undo?: Undo) {
  if (!state.message) return;
  if (!state.ok) {
    toast.error(state.message);
    return;
  }
  toast.success(state.message, {
    action: undo
      ? {
          label: "Undo",
          onClick: async () => {
            try {
              notify(await undo());
            } catch {
              toast.error("Couldn't undo — check your connection.");
            }
          },
        }
      : undefined,
    duration: undo ? 8000 : 4000,
  });
}

/**
 * useActionState + manual dispatch (no React 19 auto-reset, so typed values survive errors).
 * On success: toasts the message (with "Undo" when `undo` returns one), closes the surrounding
 * sheet (unless submitted with a `data-stay` button, for adding several in a row) and bumps `formKey`
 * so the form remounts clean. On a rejected submit, focus moves to the first field that needs fixing.
 */
export function useFormAction<S extends FormState>(
  action: (prev: S, formData: FormData) => Promise<S>,
  { undo }: { undo?: (state: S) => Undo | undefined } = {}
) {
  const sheet = useContext(FormSheetContext);
  const [formKey, setFormKey] = useState(0);
  const form = useRef<HTMLFormElement | null>(null);
  const stay = useRef(false);
  const [state, dispatch, pending] = useActionState<S, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (result.ok) {
      notify(result, undo?.(result));
      sheet?.markClean();
      if (!stay.current) sheet?.close();
      setFormKey((k) => k + 1);
    }
    return result;
  }, initialFormState as Awaited<S>);

  useEffect(() => {
    if (!state.errors || !form.current) return;
    const invalid = form.current.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalid?.matches("input, select, textarea, button") ? invalid : invalid?.querySelector<HTMLElement>("button"))?.focus();
  }, [state]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    form.current = event.currentTarget;
    stay.current = Boolean((event.nativeEvent as SubmitEvent).submitter?.hasAttribute("data-stay"));
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return {
    state,
    pending,
    onSubmit,
    formKey,
    error: (name: string) => state.errors?.[name]?.[0],
  };
}

export function FormField({
  id,
  label,
  error,
  description,
  wide = false,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  description?: ReactNode;
  /** Span both columns of a two-column FieldGroup. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Field data-invalid={error ? true : undefined} className={cn(wide && "sm:col-span-2")}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {error ? <FieldError>{error}</FieldError> : description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

/** Submit row. Success is announced by a toast (the sheet closes), so only errors show here. */
export function FormFooter({ state, pending, children, secondary }: { state: FormState; pending: boolean; children: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
      {state.message && !state.ok && (
        <p role="status" className="mr-auto text-sm text-destructive">
          {state.message}
        </p>
      )}
      {secondary}
      <Button type="submit" disabled={pending}>
        {pending && <Spinner />}
        {children}
      </Button>
    </div>
  );
}
