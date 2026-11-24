/*
 * Date ranges for client components that are also rendered on the server. Intl's formatRange spaces
 * the en dash differently in Node and in browsers ("Nov 2 – 25" vs "Nov 2–25"), which breaks
 * hydration, so these are put together by hand: the same text everywhere.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m: MONTHS[m - 1], d };
}

/** "Nov 25, 2026", "Nov 2 – 25, 2026", "Oct 30 – Nov 25, 2026", "Dec 30, 2025 – Jan 2, 2026". */
export function stableDayRange(from: string, to: string): string {
  const a = parts(from), b = parts(to);
  if (from === to) return `${a.m} ${a.d}, ${a.y}`;
  if (a.y !== b.y) return `${a.m} ${a.d}, ${a.y} – ${b.m} ${b.d}, ${b.y}`;
  if (a.m !== b.m) return `${a.m} ${a.d} – ${b.m} ${b.d}, ${b.y}`;
  return `${a.m} ${a.d} – ${b.d}, ${b.y}`;
}
