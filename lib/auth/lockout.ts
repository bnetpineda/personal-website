/* Login lockout rules, kept pure for tests (rate-limit.ts does the counting). */

/** Failed attempts per client in 15 minutes. */
export const PER_IP_MAX = 5;
/** Failed attempts from everyone in an hour. */
export const GLOBAL_MAX = 30;

/**
 * Locked when this client failed too often, or when everyone together did. A known device (one that signed
 * in successfully within 30 days) is exempt from the global limit only, so guessing from elsewhere can't
 * lock the owner out, while the per-client limit still holds for it.
 */
export function lockedOut({ perIpFailures, globalFailures, knownDevice }: { perIpFailures: number; globalFailures: number; knownDevice: boolean }): boolean {
  if (perIpFailures >= PER_IP_MAX) return true;
  return !knownDevice && globalFailures >= GLOBAL_MAX;
}
