/*
 * Time budgets for long server work. A Server Action gets the maxDuration of the page it is called from,
 * so every admin page exports the same limit (app/admin/max-duration.test.ts checks it) and actions plan
 * against it. Work that can wait (AI categorization) only starts when enough time is left to finish.
 */

/** Every dashboard page's `export const maxDuration`. Segment config must be a literal, so pages repeat the number. */
export const ADMIN_MAX_DURATION_SECONDS = 120;
/** Left for saving results and answering after the last step. */
const MARGIN_MS = 10_000;

/** When work started now must be done by, for a function limited to `seconds`. */
export function deadlineFor(seconds: number, start = Date.now()): number {
  return start + seconds * 1000 - MARGIN_MS;
}

/** A Server Action's deadline, taken when the action starts. */
export const actionDeadline = (start = Date.now()) => deadlineFor(ADMIN_MAX_DURATION_SECONDS, start);

export const timeLeft = (deadline: number, now = Date.now()) => Math.max(0, deadline - now);
