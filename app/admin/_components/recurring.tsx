import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import type { RecurringRow } from "@/lib/dal";
import type { CashFlowKind } from "@/lib/finance/constants";
import { daysBetween, dayLabel } from "@/lib/finance/dates";
import type { Occurrence } from "@/lib/finance/recurrence";
import { skipRecurring } from "../_actions/recurring";
import { CashFlowForm, type FormCategory } from "./cash-flow-form";
import { DueActions, PostAllButton } from "./due-actions";
import { Money, Panel } from "./ui";

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

/**
 * "Needs confirming": due occurrences of items that wait for confirmation, each with
 * Post / adjust / Skip, plus "Post all" when there's more than one.
 */
export function DuePanel({
  due,
  today,
  categories,
  accounts,
}: {
  due: Occurrence<RecurringRow>[];
  today: string;
  categories: Record<CashFlowKind, FormCategory[]>;
  accounts: string[];
}) {
  if (due.length === 0) return null;
  return (
    <Panel
      title={`Needs confirming · ${due.length}`}
      action={due.length > 1 ? <PostAllButton occurrences={due.map(({ item, date }) => ({ id: item.id, on: date }))} /> : undefined}
    >
      <ItemGroup>
        {due.map(({ item: r, date }) => (
          <Item key={`${r.id}-${date}`} size="sm">
            <ItemMedia>
              <Swatch color={r.categoryColor} />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{r.description}</ItemTitle>
              <ItemDescription>
                {whenLabel(date, today)} · <Money value={r.kind === "expense" ? -r.amount : r.amount} currency={r.currency} signed tone />
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <DueActions
                name={r.description}
                occurrence={{ id: r.id, on: date }}
                onSkip={skipRecurring.bind(null, r.id, date)}
                form={
                  <CashFlowForm
                    kind={r.kind}
                    categories={categories[r.kind]}
                    accounts={accounts}
                    recurring={{ id: r.id, on: date }}
                    defaults={{
                      occurredOn: date,
                      amount: r.amount,
                      currency: r.currency,
                      categoryId: r.categoryId,
                      description: r.description,
                      account: r.account,
                      notes: r.notes,
                    }}
                  />
                }
              />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </Panel>
  );
}
