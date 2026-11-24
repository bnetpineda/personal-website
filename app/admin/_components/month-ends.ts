/** One point per month (its last day in the list), newest first: a chart's figures as table rows. */
export function monthEnds<T extends { date: string }>(points: readonly T[]): T[] {
  const byMonth = new Map<string, T>();
  for (const point of points) {
    const month = point.date.slice(0, 7);
    const kept = byMonth.get(month);
    if (!kept || point.date >= kept.date) byMonth.set(month, point);
  }
  return [...byMonth.values()].sort((a, b) => b.date.localeCompare(a.date));
}
