/** A query that hangs would hold the page (or the daily job) until its time limit; give up after this instead. */
export const QUERY_TIMEOUT_MS = 30_000;

/** `fetch` that aborts after `ms`, keeping any signal the caller passed. Neon's HTTP driver sends every query through it. */
export function timedFetch(ms = QUERY_TIMEOUT_MS): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const timeout = AbortSignal.timeout(ms);
    return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  }) as typeof fetch;
}
