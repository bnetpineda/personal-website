/*
 * Income that keeps arriving through imports (a client or employer paying into Wise every month)
 * counts towards Recurring's monthly totals without a schedule. A schedule would post a second
 * entry next to the imported one, so this reads what was actually received instead.
 */

export interface ReceivedIncome {
  description: string;
  occurredOn: string;
  amount: number;
  currency: string;
  categoryName: string;
  categoryColor: string;
}

export interface RepeatPayer {
  key: string;
  name: string;
  currency: string;
  /** Average received per month, from the first to the last month it paid. */
  monthly: number;
  payments: number;
  lastOn: string;
  categoryName: string;
  categoryColor: string;
}

/** "Received money from Centauri Media Ltd with reference INV-12" → "Centauri Media Ltd". */
export function payerName(description: string): string {
  const wise = /^received money from (.+?)(?: with reference\b.*)?$/i.exec(description.trim());
  return (wise?.[1] ?? description).replace(/\s+/g, " ").trim();
}

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7));

/** Payers seen in at least two different months, largest first. */
export function repeatPayers(entries: ReceivedIncome[]): RepeatPayer[] {
  const groups = new Map<string, ReceivedIncome[]>();
  for (const entry of entries) {
    // Digits change every month (invoice numbers, dates); the payer does not.
    const key = `${payerName(entry.description).toLowerCase().replace(/[\d\W_]+/g, " ").trim()}|${entry.currency}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const payers: RepeatPayer[] = [];
  for (const [key, group] of groups) {
    const months = group.map((e) => monthIndex(e.occurredOn));
    const span = Math.max(...months) - Math.min(...months) + 1;
    if (new Set(months).size < 2) continue;
    const latest = group.reduce((a, b) => (b.occurredOn > a.occurredOn ? b : a));
    payers.push({
      key,
      name: payerName(latest.description),
      currency: latest.currency,
      monthly: group.reduce((sum, e) => sum + e.amount, 0) / span,
      payments: group.length,
      lastOn: latest.occurredOn,
      categoryName: latest.categoryName,
      categoryColor: latest.categoryColor,
    });
  }
  return payers.sort((a, b) => b.monthly - a.monthly || a.name.localeCompare(b.name));
}
