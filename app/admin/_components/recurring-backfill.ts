import type { RecurrenceFrequency } from "@/lib/finance/constants";
import { occurrencesBetween } from "@/lib/finance/recurrence";

/**
 * What saving a new recurring item with a past first date does right away, said before it happens:
 * auto-posted items fill in every past entry at once, the others wait in Needs confirming.
 */
export function backfillNote(
  schedule: { frequency: RecurrenceFrequency; startOn: string; endOn?: string | null; secondDay?: number | null },
  today: string,
  autoPost: boolean
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.startOn) || schedule.startOn > today) return null;
  const count = occurrencesBetween(schedule, schedule.startOn, today).length;
  if (count === 0) return null;
  const entries = `${count} ${count === 1 ? "entry" : "entries"}`;
  return autoPost ? `Saving adds ${entries} now, from the first date through today.` : `${entries} from the first date through today will wait for you to confirm.`;
}
