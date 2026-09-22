import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import type { RecurringRow } from "@/lib/dal";
import { daysBetween, dayLabel } from "@/lib/finance/dates";
import type { Occurrence } from "@/lib/finance/recurrence";
import { Money } from "./ui";

/* Server-safe pieces for recurring items (lists of scheduled occurrences). */

export function whenLabel(date: string, today: string): string {
  const inDays = daysBetween(today, date);
  if (inDays === 0) return "Today";
  if (inDays === 1) return "Tomorrow";
  if (inDays < 0) return `${dayLabel(date)} · ${-inDays} d ago`;
  return `${dayLabel(date)} · in ${inDays} d`;
}

/** Scheduled occurrences, signed (+ income / − expense) so a mixed list reads as cash flow. */
export function OccurrenceList({ items, today }: { items: Occurrence<RecurringRow>[]; today: string }) {
  return (
    <ItemGroup>
      {items.map(({ item: r, date }) => (
        <Item key={`${r.id}-${date}`} size="sm">
          <ItemMedia>
            <Swatch color={r.categoryColor} />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {r.description}
              {!r.autoPost && <Badge variant="outline">Confirm</Badge>}
            </ItemTitle>
            <ItemDescription>{[whenLabel(date, today), r.categoryName].join(" · ")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <span className="font-mono text-sm">
              <Money value={r.kind === "expense" ? -r.amount : r.amount} currency={r.currency} signed tone />
            </span>
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  );
}
