/*
 * Whether a sheet's forms changed since it opened. Compares every submitted value, hidden inputs
 * included, so Radix Selects, toggle groups, date pickers, swatches and checkboxes count, not only
 * typing into text fields.
 */

type Entries = Iterable<[string, FormDataEntryValue]>;
export type FormView = { form: object; entries: () => Entries };

/** A stable string for a form's values: file inputs by name and size, the order of fields kept. */
export function formSignature(entries: Entries): string {
  const parts: string[] = [];
  for (const [name, value] of entries) {
    parts.push(`${name}=${typeof value === "string" ? value : `file:${value.name}:${value.size}`}`);
  }
  return JSON.stringify(parts);
}

/** Snapshots per form, taken before the first interaction; a form seen for the first time is clean. */
export class FormSnapshots {
  private snapshots = new WeakMap<object, string>();

  /** Records forms not seen yet (call on the first pointer or key event, before it changes anything). */
  remember(forms: Iterable<FormView>) {
    for (const { form, entries } of forms) {
      if (!this.snapshots.has(form)) this.snapshots.set(form, formSignature(entries()));
    }
  }

  /** Takes the current values as the clean state (after a save). */
  reset(forms: Iterable<FormView>) {
    for (const { form, entries } of forms) this.snapshots.set(form, formSignature(entries()));
  }

  changed(forms: Iterable<FormView>): boolean {
    for (const { form, entries } of forms) {
      const before = this.snapshots.get(form);
      if (before !== undefined && before !== formSignature(entries())) return true;
    }
    return false;
  }
}
