/*
 * Error logging that never writes financial data to the platform logs.
 *
 * Raw error objects are unsafe to log here: a Drizzle query error embeds every bound parameter in its message
 * ("Failed query: … params: …"), and an AI SDK API error carries the whole request body, which is the prompt with
 * transaction descriptions, amounts and goals. So only the error's kind survives: its name, a short code, a
 * constraint or HTTP status, and the first line of its message with quoted values and long numbers removed.
 */

export interface LoggedError {
  name: string;
  message: string;
  code?: string;
  status?: number;
  constraint?: string;
}

const MAX_MESSAGE = 120;
const SHORT_TOKEN = /^[\w.-]{1,40}$/;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function shortToken(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return typeof value === "string" && SHORT_TOKEN.test(value) ? value : undefined;
}

/** First line only, with anything that could be a value (quoted text, amounts, ids) masked. */
export function redactMessage(message: string): string {
  // Drizzle: "Failed query: insert into … params: 500,Lunch" keeps only the kind.
  if (message.startsWith("Failed query")) return "Failed query";
  const firstLine = message.split(/\r?\n/, 1)[0] ?? "";
  const masked = firstLine
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "…")
    .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "(…)=(…)")
    .replace(/\d[\d,.]{2,}/g, "#")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "…");
  return masked.length > MAX_MESSAGE ? `${masked.slice(0, MAX_MESSAGE)}…` : masked;
}

/** The safe summary of an error; see the file comment for what is dropped. */
export function describeError(error: unknown): LoggedError {
  const err = record(error);
  if (!err) return { name: typeof error, message: typeof error === "string" ? redactMessage(error) : "" };
  // The database driver's error is usually the cause of Drizzle's wrapper; its code is what tells failures apart.
  const cause = record(err.cause);
  const name = shortToken(err.name) ?? "Error";
  const out: LoggedError = { name, message: typeof err.message === "string" ? redactMessage(err.message) : "" };
  const code = shortToken(err.code) ?? shortToken(cause?.code);
  if (code) out.code = code;
  const status = err.statusCode ?? err.status ?? cause?.statusCode;
  if (typeof status === "number" && Number.isInteger(status)) out.status = status;
  const constraint = shortToken(err.constraint) ?? shortToken(cause?.constraint);
  if (constraint) out.constraint = constraint;
  if (out.message === "Failed query" && typeof cause?.message === "string") out.message = `Failed query: ${redactMessage(cause.message)}`;
  return out;
}

/** console.error with a scope label and only the safe summary of the error. */
export function logError(scope: string, error?: unknown): void {
  if (error === undefined) console.error(`[admin] ${scope}`);
  else console.error(`[admin] ${scope}`, describeError(error));
}

/** console.warn for counts and ids that are safe to keep; never pass rows or amounts. */
export function logWarning(scope: string, detail?: string | number): void {
  if (detail === undefined) console.warn(`[admin] ${scope}`);
  else console.warn(`[admin] ${scope}`, detail);
}
