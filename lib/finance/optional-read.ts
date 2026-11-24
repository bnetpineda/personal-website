/**
 * A page panel's own data may fail without taking the page down: the panel shows `fallback` (empty)
 * instead. Only the error's class name is logged, since database errors carry query values.
 */
export function optionalRead<T, F>(label: string, read: Promise<T>, fallback: F): Promise<T | F> {
  return read.catch((error: unknown) => {
    console.error(`[admin] ${label} failed: ${error instanceof Error ? error.name : "UnknownError"}`);
    return fallback;
  });
}
