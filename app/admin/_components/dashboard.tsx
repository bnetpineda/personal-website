import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Link2, OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import type { RecurringRow } from "@/lib/dal";
import type { CashFlowKind } from "@/lib/finance/constants";
import { PROVIDER_META, type SyncProvider } from "@/lib/finance/connections/types";
import { monthLabel } from "@/lib/finance/dates";
import type { StatementProvider } from "@/lib/finance/imports/coverage";
import type { TeachGroup } from "@/lib/finance/imports/teach";
import type { AlertGroup } from "@/lib/finance/notifications";
import type { Occurrence } from "@/lib/finance/recurrence";
import type { FormCategory } from "./cash-flow-form";
import { SyncNowButton } from "./connection-controls";
import { FormSheet } from "./form";
import { ImportMariBankButton, ImportWiseButton } from "./import-controls";
import { DismissNotificationButton } from "./notification-controls";
import { DueList, PostAllDue } from "./recurring";
import { TeachList } from "./teach-jev";
import { EmptyState, Money, Panel, Pct } from "./ui";

/* Server-safe pieces of the one-screen dashboard (app/admin/(dashboard)/(overview)/page.tsx). */

export interface Kpi {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** A mini chart under the numbers (MiniBars). */
  chart?: ReactNode;
}

/**
 * The headline numbers. Net worth leads (lime, with its trend line); the month's money in and out
 * follow, each with a mini chart of its months. Phones: net worth across, then two by two.
 */
export function KpiStrip({ netWorth, trend, items }: { netWorth: Kpi; trend?: ReactNode; items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <div className="col-span-2 md:col-span-4 xl:col-span-2">
        <Card size="sm" variant="primary" className="h-full">
          <CardContent className="flex h-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <KpiText kpi={netWorth} lead />
            {trend && <div className="min-w-0 sm:w-2/5 sm:shrink-0">{trend}</div>}
          </CardContent>
        </Card>
      </div>
      {items.map((kpi) => (
        <Card key={kpi.label} size="sm" className="h-full">
          <CardContent className="flex h-full flex-col justify-between gap-2">
            <KpiText kpi={kpi} />
            {kpi.chart}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** `lead`: the net worth figure, a size up from the rest. */
function KpiText({ kpi, lead = false }: { kpi: Kpi; lead?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-mono text-xs tracking-wider uppercase opacity-70">{kpi.label}</p>
      <p className={cn("font-display whitespace-nowrap tabular-nums", lead ? "text-2xl 2xl:text-3xl" : "text-base sm:text-xl 2xl:text-2xl")}>{kpi.value}</p>
      {kpi.hint != null && <div className="flex min-w-0 flex-col font-mono text-xs">{kpi.hint}</div>}
    </div>
  );
}

function StatementUploads({ providers }: { providers: StatementProvider[] }) {
  return (
    <div className="flex flex-col gap-2">
      {providers.map((provider) => (
        <div key={provider} className="flex items-center justify-between gap-3 text-sm">
          {PROVIDER_META[provider].name}
          {provider === "wise" ? <ImportWiseButton size="xs" /> : <ImportMariBankButton size="xs" />}
        </div>
      ))}
    </div>
  );
}

/**
 * The month's one coverage marker, next to the month: which banks' statements don't reach it yet,
 * with their upload buttons. A closed month is "Provisional"; the running month is just in progress.
 */
export function CoverageBadge({ missing, month, current }: { missing: StatementProvider[]; month: string; current: string }) {
  if (!missing.length) return null;
  const names = missing.map((p) => PROVIDER_META[p].name).join(" and ");
  const running = month >= current;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge asChild variant={running ? "outline" : "warning"}>
          <button type="button">{running ? "In progress" : "Provisional"}</button>
        </Badge>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{running ? `${monthLabel(month)} so far` : `${monthLabel(month)} is provisional`}</PopoverTitle>
          <PopoverDescription>
            {running
              ? `${names} statements fill in this month as you upload them. Until then the totals count what's recorded, and savings rate and comparisons wait.`
              : `${names} statements don't cover this month yet, so its totals count only what's recorded, and savings rate and comparisons wait.`}
          </PopoverDescription>
        </PopoverHeader>
        <StatementUploads providers={missing} />
      </PopoverContent>
    </Popover>
  );
}

/** A group's fix, in place: sync a synced account, upload a bank's statements. Otherwise the row opens its page. */
function AlertFix({ group }: { group: AlertGroup }) {
  if (group.provider === "binance" || group.provider === "ibkr") return group.types.includes("sync") ? <SyncNowButton provider={group.provider} label /> : null;
  if (!group.types.includes("statement")) return null;
  if (group.provider === "wise") return <ImportWiseButton size="xs" />;
  if (group.provider === "maribank") return <ImportMariBankButton size="xs" />;
  return null;
}

function AlertRow({ group: g }: { group: AlertGroup }) {
  const urgent = g.severity === "destructive";
  const Icon = urgent ? OctagonAlert : TriangleAlert;
  return (
    <Item size="xs" variant="interactive">
      <ItemMedia>
        <Icon aria-hidden className={cn("size-4", urgent ? "text-destructive" : "text-warning")} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <Link href={g.href} className="outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring">
            {g.title}
          </Link>
          {urgent && <Badge variant="destructive">Urgent</Badge>}
        </ItemTitle>
        {g.lines.map((line) => (
          <ItemDescription key={line.key} title={line.detail}>
            {line.label && <span className="text-foreground">{line.label} · </span>}
            {line.detail}
          </ItemDescription>
        ))}
      </ItemContent>
      <ItemActions>
        <AlertFix group={g} />
        <DismissNotificationButton keys={g.keys} title={g.title} />
      </ItemActions>
    </Item>
  );
}

function InboxSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h3 className="font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface InboxProps {
  /** Alerts, one group per account (see groupAlerts). */
  groups: AlertGroup[];
  missingFx: string[];
  due: Occurrence<RecurringRow>[];
  teach: TeachGroup[];
  today: string;
  categories: Record<CashFlowKind, FormCategory[]>;
  accounts: string[];
}

export function inboxCount({ groups, missingFx, due, teach }: Pick<InboxProps, "groups" | "missingFx" | "due" | "teach">) {
  return groups.length + (missingFx.length ? 1 : 0) + due.length + teach.length;
}

/**
 * "Needs you" on demand: a bell in the header with the count, opening a sheet with each account's
 * alerts (and its fix: Sync now, Import), recurring items to confirm and payees to teach Jev.
 */
export function NeedsYou(props: InboxProps) {
  const { groups, missingFx, due, teach, today, categories, accounts } = props;
  const count = inboxCount(props);
  const urgent = groups.some((g) => g.severity === "destructive");
  const notices = groups.length + (missingFx.length ? 1 : 0);
  return (
    <FormSheet
      title={count ? `Needs you · ${count}` : "Needs you"}
      description={count ? "Alerts with their fixes, recurring items to confirm and payees to teach Jev." : "Nothing needs you right now."}
      trigger={
        <Button variant={count ? (urgent ? "destructive" : "outline") : "ghost"} size="sm" aria-label={count ? `Needs you: ${count}` : "Needs you: all caught up"}>
          <Bell />
          {count > 0 && count}
        </Button>
      }
    >
      {count === 0 ? (
        <EmptyState size="sm" title="All caught up">
          Syncs, statements and recurring items are up to date.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {notices > 0 && (
            <InboxSection title={`Alerts · ${notices}`}>
              <ItemGroup>
                {missingFx.length > 0 && (
                  <Item size="xs">
                    <ItemMedia>
                      <TriangleAlert aria-hidden className="size-4 text-warning" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Missing exchange rates</ItemTitle>
                      <ItemDescription>No rate yet for {missingFx.join(", ")}: those amounts are left out of the PHP totals.</ItemDescription>
                    </ItemContent>
                  </Item>
                )}
                {groups.map((g) => (
                  <AlertRow key={g.key} group={g} />
                ))}
              </ItemGroup>
            </InboxSection>
          )}
          {due.length > 0 && (
            <InboxSection title={`To confirm · ${due.length}`} action={due.length > 1 ? <PostAllDue due={due} /> : undefined}>
              <DueList due={due} today={today} categories={categories} accounts={accounts} size="xs" />
            </InboxSection>
          )}
          {teach.length > 0 && (
            <InboxSection title={`Teach Jev · ${teach.length} ${teach.length === 1 ? "payee" : "payees"}`}>
              <p className="text-sm text-muted-foreground">
                Jev wasn&apos;t sure about these, so they sit in Other. Pick a category once: past payments move and future ones follow.
              </p>
              <TeachList groups={teach} categories={categories} />
            </InboxSection>
          )}
        </div>
      )}
    </FormSheet>
  );
}

/** One account on the dashboard: a synced connection or a bank's latest statement balance. */
export interface AccountRow {
  key: string;
  name: string;
  href: string;
  description: string;
  /** PHP; null when it isn't known yet. */
  value: number | null;
  /** Investment accounts: profit/loss on known cost. */
  pnlPct: number | null;
  /** Synced accounts get a sync button on their row. */
  sync?: { provider: SyncProvider; disabled: boolean };
}

export function AccountsPanel({ rows, className }: { rows: AccountRow[]; className?: string }) {
  const syncable = rows.some((row) => row.sync);
  return (
    <Panel
      fill
      className={className}
      title="Accounts"
      action={
        rows.length > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/holdings">
              Portfolio <ArrowRight />
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/connections">
              <Link2 /> Connect
            </Link>
          </Button>
        )
      }
    >
      {rows.length === 0 ? (
        <EmptyState size="sm" title="No accounts connected">
          Connect Binance or IBKR once and balances update by themselves every day. Wise and MariBank come in as statements.
        </EmptyState>
      ) : (
        <ItemGroup>
          {rows.map((row) => (
            <Item key={row.key} size="xs" variant="interactive" className="flex-nowrap">
              <ItemContent className="min-w-0">
                <ItemTitle>
                  <Link href={row.href} className="outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring">
                    {row.name}
                  </Link>
                </ItemTitle>
                <ItemDescription clamp={1} title={row.description}>
                  {row.description}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {/* Clicks on the amount fall through to the row's link. */}
                <span className="pointer-events-none flex flex-col items-end font-mono text-sm">
                  {row.value == null ? <span className="text-muted-foreground">Unknown</span> : <Money value={row.value} />}
                  {row.pnlPct != null && (
                    <span className="text-xs">
                      <Pct value={row.pnlPct} tone /> P/L
                    </span>
                  )}
                </span>
                {row.sync ? <SyncNowButton provider={row.sync.provider} disabled={row.sync.disabled} /> : syncable && <span aria-hidden className="size-8" />}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </Panel>
  );
}
