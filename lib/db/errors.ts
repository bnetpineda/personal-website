/** Postgres error code from a (possibly Drizzle-wrapped) driver error. */
export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}
