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

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

/**
 * The address the per-client limit counts by. IPv4 is used whole. IPv6 is cut to its /64 network, because one
 * subscriber (or attacker) is routinely handed a whole /64, so a per-address limit would let them rotate through
 * billions of addresses. IPv4-mapped IPv6 (::ffff:1.2.3.4) counts as the IPv4 address. Anything unparseable is
 * returned as given, so it still gets a limit of its own.
 */
export function ipBucket(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/^\[([^\]]*)\](?::\d+)?$/, "$1").split("%")[0];
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  if (ip.startsWith("::ffff:") && IPV4.test(ip.slice(7))) return ip.slice(7);
  const halves = ip.split("::");
  if (halves.length > 2) return ip;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const known = [...left, ...right];
  if (known.some((g) => !HEXTET.test(g))) return ip;
  const groups = halves.length === 2 ? [...left, ...Array<string>(Math.max(0, 8 - known.length)).fill("0"), ...right] : left;
  if (groups.length !== 8) return ip;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
