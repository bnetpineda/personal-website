import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Info, Link2, OctagonAlert, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ConnectAccountButton, SyncConnectionsButton, SyncNowButton } from "./connection-controls";
import { FormSheet } from "./form";
import { ImportMariBankButton, ImportWiseButton } from "./import-controls";
import { DismissNotificationButton } from "./notification-controls";
import { DueList, PostAllDue } from "./recurring";
import { TeachList } from "./teach-jev";
import { EmptyState, Money, Panel, Pct } from "./ui";

/* Server-safe pieces of the one-screen dashboard (app/admin/(dashboard)/(overview)/page.tsx). */

export interface Kpi {
  label: string;
  shortLabel?: string;
  value: ReactNode;
  hint?: ReactNode;
  compactHint?: ReactNode;
  unknown?: boolean;
  /** Built from incomplete records: a figure, but quieter than one you can rely on. */
  provisional?: boolean;
  /** A mini chart under the numbers (MiniBars). */
  chart?: ReactNode;
  historyLabel?: string;
  detail?: ReactNode;
}

/**
 * The headline numbers. Net worth leads (lime, with its trend line); the month's money in and out
 * follow, each with a mini chart of its months. Phones prioritize actuals in one compact card;
 * the estimate is separate and the decorative mini histories stay on larger screens.
 */
export function KpiStrip({ netWorth, trend, estimate, period, coverage, items }: { netWorth: Kpi; trend?: ReactNode; estimate: Kpi; period: string; coverage?: ReactNode; items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      <div className="col-span-2 md:col-span-4 xl:col-span-2">
        <Card size="sm" variant="primary" className="h-full">
          <CardContent className="flex h-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <KpiText kpi={netWorth} lead />
            {trend && <div className="hidden min-w-0 sm:block sm:w-1/3 sm:shrink-0">{trend}</div>}
          </CardContent>
        </Card>
      </div>
      <div className="col-span-2 sm:hidden">
        <Card size="sm" role="group" aria-label={`Recorded totals for ${period}`}>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-sm">{period} · recorded</CardTitle>{coverage}</CardHeader>
          <CardContent>
            <dl className="flex flex-col divide-y divide-border/25">
              {items.map((kpi) => (
                <div key={kpi.label} className="flex items-center justify-between gap-4 py-2">
                  <div className="min-w-0">
                    <dt className="text-sm font-medium">{kpi.shortLabel ?? kpi.label}</dt>
                  </div>
                  <dd className={cn("shrink-0 font-display text-lg tabular-nums", kpi.provisional && "text-muted-foreground")}>{kpi.value}</dd>
                </div>
              ))}
            </dl>
            {items.some((kpi) => kpi.unknown) && <p className="mt-2 text-xs text-muted-foreground">— means missing records, not zero.</p>}
          </CardContent>
        </Card>
      </div>
      <div className="col-span-2 sm:hidden">
        <Card size="sm">
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">Income estimate</p>
              <p className="shrink-0 font-display text-base tabular-nums">{estimate.value}</p>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">{estimate.compactHint ?? estimate.hint}</div>
              <KpiInfo kpi={estimate} />
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="hidden sm:col-span-1 sm:block">
        <Card size="sm" className="h-full">
          <CardContent className="flex h-full flex-col justify-between gap-2">
            <KpiText kpi={estimate} />
            {estimate.chart && <div className="hidden sm:block" title={estimate.historyLabel}>{estimate.chart}</div>}
          </CardContent>
        </Card>
      </div>
      {items.map((kpi) => (
        <div key={kpi.label} className="hidden sm:block">
          <Card size="sm" className="h-full">
            <CardContent className="flex h-full flex-col justify-between gap-2">
              <KpiText kpi={kpi} />
              {kpi.chart && <div title={kpi.historyLabel}>{kpi.chart}</div>}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

/** `lead`: the net worth figure, a size up from the rest. */
function KpiText({ kpi, lead = false }: { kpi: Kpi; lead?: boolean }) {
  return (
    <div className={cn("relative flex min-w-0 flex-col gap-1", lead && kpi.detail && "pr-12")}>
      <div className="flex items-start justify-between gap-1">
        <p className="font-mono text-xs tracking-wider uppercase opacity-70">{kpi.label}</p>
        {!lead && <KpiInfo kpi={kpi} />}
      </div>
      {lead && <div className="absolute top-0 right-0"><KpiInfo kpi={kpi} /></div>}
      <p className={cn("font-display whitespace-nowrap tabular-nums", lead ? "text-2xl 2xl:text-3xl" : "text-base sm:text-xl 2xl:text-2xl", kpi.provisional && "text-muted-foreground")}>{kpi.value}</p>
      {kpi.hint != null && <div className="flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground group-data-[variant=primary]/card:text-primary-foreground/80">{kpi.hint}</div>}
    </div>
  );
}

function KpiInfo({ kpi }: { kpi: Kpi }) {
  if (!kpi.detail) return null;
  return (
    <Popover>
      <Button asChild variant="ghost" size="icon-xs" touch>
        <PopoverTrigger aria-label={`About ${kpi.label.toLowerCase()}`}><Info /></PopoverTrigger>
      </Button>
      <PopoverContent aria-label={`About ${kpi.label.toLowerCase()}`} align="start" className="w-80">
        <PopoverHeader><PopoverTitle>{kpi.label}</PopoverTitle></PopoverHeader>
        <div className="mt-3 flex flex-col gap-2 text-sm">{kpi.detail}</div>
      </PopoverContent>
    </Popover>
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
 * with their upload buttons. Missing records must not read as a genuine zero month.
 */
export function CoverageBadge({ missing, month, current }: { missing: StatementProvider[]; month: string; current: string }) {
  if (!missing.length) return null;
  const names = missing.map((p) => PROVIDER_META[p].name).join(" and ");
  return (
    <Popover>
      <Badge asChild variant={month > current ? "outline" : "warning"} className="pointer-coarse:min-h-11">
        {/* One name for one condition: Accounts and the account rows say "Statement due" too. */}
        <PopoverTrigger>Statement due</PopoverTrigger>
      </Badge>
      <PopoverContent aria-label={`Statement coverage for ${monthLabel(month)}`} align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{monthLabel(month)} · incomplete records</PopoverTitle>
          <PopoverDescription>
            {names} statements don&apos;t cover this month yet. A dash means no recorded data, not zero. Any amounts shown count only recorded entries; net, savings rate and comparisons wait for enough data.
          </PopoverDescription>
        </PopoverHeader>
        <StatementUploads providers={missing} />
      </PopoverContent>
    </Popover>
  );
}

/** A group's fix, in place: sync a synced account, upload a bank's statements. Otherwise the row opens its page. */
function AlertFix({ group }: { group: AlertGroup }) {
  if (group.key.startsWith("daily-sync:")) return <SyncConnectionsButton />;
  if (group.provider === "binance" || group.provider === "ibkr" || group.provider === "hyperliquid") {
    return (
      <>
        {group.reconnect && <ConnectAccountButton provider={group.provider} connected primary />}
        {!group.reconnect && group.types.includes("sync") && <SyncNowButton provider={group.provider} label />}
      </>
    );
  }
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
          <ItemDescription key={line.key} clamp="none">
            {line.label && <span className="text-foreground">{line.label} · </span>}
            {line.detail}
          </ItemDescription>
        ))}
      </ItemContent>
      {/* On its own line, so the explanation keeps the row's full width and is never cut off. */}
      <ItemActions className="basis-full flex-wrap justify-end">
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
 * alerts (and its fix: Reconnect, Sync now, Import), recurring items to confirm and payees to sort.
 */
export function NeedsYou({ defaultOpen, onClosed, ...props }: InboxProps & { defaultOpen?: boolean; onClosed?: () => void }) {
  const { groups, missingFx, due, teach, today, categories, accounts } = props;
  const count = inboxCount(props);
  const urgent = groups.some((g) => g.severity === "destructive");
  const notices = groups.length + (missingFx.length ? 1 : 0);
  return (
    <FormSheet
      defaultOpen={defaultOpen}
      onClosed={onClosed}
      title={count ? `Needs you · ${count}` : "Needs you"}
      description={count ? "What needs doing, with the fix right here." : "Nothing needs you right now."}
      trigger={
        <Button variant={count ? (urgent ? "destructive" : "outline") : "ghost"} size="sm" className="relative" aria-label={count ? `Needs you: ${count}` : "Needs you: all caught up"}>
          <Bell />
          <span className="hidden sm:inline">Needs you</span>
          {count > 0 && <Badge variant={urgent ? "destructive" : "default"} className="absolute -top-1 -right-1 sm:static">{count}</Badge>}
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
            <InboxSection title={`Sort these · ${teach.length} ${teach.length === 1 ? "payee" : "payees"}`}>
              <p className="text-sm text-muted-foreground">
                AI wasn&apos;t sure about these, so they sit in Other. Pick a category once: past payments move and future ones follow.
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
  /** Inclusion is shown separately from sync status, so it cannot be hidden by truncation. */
  inNetWorth: boolean;
  /** Failing, out of date or an old statement: the row carries a marker. */
  attention?: boolean;
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
      title={<>Accounts {rows.length > 0 && <span className="font-mono text-xs text-muted-foreground">· {rows.length}</span>}</>}
      action={
        rows.length > 0 ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/connections">
              All <ArrowRight />
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
          Connect Binance, IBKR or Hyperliquid once and balances update by themselves every day. Wise and MariBank come in as statements.
        </EmptyState>
      ) : (
        <ItemGroup>
          {rows.map((row) => (
            <Item key={row.key} size="2xs" variant="interactive" className="flex-nowrap">
              <ItemContent className="min-w-0">
                <ItemTitle>
                  <Link href={row.href} className="outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring">
                    {row.name}
                  </Link>
                  {row.attention && <TriangleAlert aria-label="Needs attention" className="size-3 text-warning" />}
                  {!row.inNetWorth && <span className="font-normal text-muted-foreground text-xs" title="Not counted in net worth">Excluded</span>}
                </ItemTitle>
                {/* Two lines, so a statement's date isn't cut off beside a long balance. */}
                <ItemDescription clamp={2} title={row.description}>
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
