"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
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
import { Spinner } from "@/components/ui/spinner";
import { initialFormState, type FormState } from "@/lib/finance/schemas";

/* Form plumbing shared by every admin form (Server Action + shadcn Field). */

const FormSheetContext = createContext<{ close: () => void } | null>(null);

/** Right-side sheet hosting a form. `trigger` is any button element. */
export function FormSheet({
  trigger,
  title,
  description,
  children,
}: {
  trigger: ReactElement;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <FormSheetContent title={title} description={description} onClose={() => setOpen(false)}>
        {children}
      </FormSheetContent>
    </Sheet>
  );
}

/** Sheet body for controlled sheets (e.g. opened from a row menu). */
export function FormSheetContent({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <SheetContent>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description ?? title}</SheetDescription>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <FormSheetContext.Provider value={{ close: onClose }}>{children}</FormSheetContext.Provider>
      </div>
    </SheetContent>
  );
}

/**
 * useActionState + manual dispatch (no React 19 auto-reset, so typed values survive errors).
 * On success: closes the surrounding sheet and bumps `formKey` so the form remounts clean.
 */
export function useFormAction(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const sheet = useContext(FormSheetContext);
  const [formKey, setFormKey] = useState(0);
  const [state, dispatch, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) {
      sheet?.close();
      setFormKey((k) => k + 1);
    }
    return result;
  }, initialFormState);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

export function FormFooter({ state, pending, children }: { state: FormState; pending: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
      {state.message && (
        <p role="status" className={cn("mr-auto text-sm", state.ok ? "text-success" : "text-destructive")}>
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending && <Spinner />}
        {children}
      </Button>
    </div>
  );
}
