/*
 * The importer files entries with a note of its own: the AI's reason (lib/finance/imports/ai-service.ts),
 * a taught payee (app/admin/_actions/imports.ts teachPayee) or a plain "imported" line
 * (lib/finance/imports/service.ts). Lists show those as an icon instead of text, and keep notes the
 * person typed as they are.
 */

export interface FilingNote {
  /** "ai": the model chose the category; "taught": a payee taught once in Teach Jev; "import": filed by a rule or by hand from imports. */
  by: "ai" | "taught" | "import";
  /** The note without its prefix (the AI's reason, "Opencode is Subscriptions."). */
  reason: string;
}

const AI = "Categorized by AI: ";
const TAUGHT = "Taught once: ";
/** SQL LIKE patterns for the notes the importer writes, so manual entries can be told from filed ones. */
export const IMPORTER_NOTE_PATTERNS = [`${AI}%`, `${TAUGHT}%`, "Imported transaction; PHP conversion uses %", "Automatically imported; PHP conversion uses %"];
const IMPORTED = /^(Imported transaction|Automatically imported); PHP conversion uses /;

/** How an entry got its category, when the note is one the app wrote; null for the person's own note (or none). */
export function filingNote(notes: string | null | undefined): FilingNote | null {
  if (!notes) return null;
  if (notes.startsWith(AI)) return { by: "ai", reason: notes.slice(AI.length) };
  if (notes.startsWith(TAUGHT)) return { by: "taught", reason: notes.slice(TAUGHT.length) };
  if (IMPORTED.test(notes)) return { by: "import", reason: notes };
  return null;
}
