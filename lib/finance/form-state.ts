/*
 * Server Action form state, shared by actions and client forms. Kept free of zod (schemas.ts) so client
 * components can import it without shipping the validation library.
 */

export type FieldErrors = Partial<Record<string, string[]>>;

export interface FormState {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Submitted values echoed back on errors (React 19 resets forms after an action). */
  values?: Record<string, string>;
  /** Id of the record a successful create made (lets the client offer "Undo"). */
  id?: string;
  /** A statement PDF is locked: the client asks for its password and sends the same files again. */
  needsPassword?: boolean;
}

export const initialFormState: FormState = { ok: false };

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  }
  return values;
}

export function failure(message: string, formData?: FormData, errors?: FieldErrors): FormState {
  return { ok: false, message, errors, values: formData ? formValues(formData) : undefined };
}
