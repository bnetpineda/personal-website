import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Swatch } from "@/components/ui/swatch";
import { addMonths, monthLabel } from "@/lib/finance/dates";
import { formatMoney, formatPct } from "@/lib/finance/format";

/* Admin building blocks composed from components/ui. Server-safe (no hooks). */

/** Money amount; blurs when privacy mode is on (see PrivacyProvider). */
export function Money({
  value,
  currency = "PHP",
  signed = false,
  compact = false,
  tone = false,
}: {
  value: number;
  currency?: string;
  signed?: boolean;
  compact?: boolean;
  /** Green for gains, red for losses. */
  tone?: boolean;
}) {
  return (
    <span
      className={cn(
        "tabular-nums transition group-data-[private=true]/shell:blur-sm",
        tone && value > 0 && "text-success",
        tone && value < 0 && "text-destructive"
      )}
    >
      {formatMoney(value, currency, { signed, compact })}
    </span>
  );
}

export function Pct({ value, tone = false }: { value: number | null; tone?: boolean }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("tabular-nums group-data-[private=true]/shell:blur-sm", tone && value > 0 && "text-success", tone && value < 0 && "text-destructive")}>
      {formatPct(value, { signed: tone })}
    </span>
  );
}

export function MissingFxAlert({ currencies }: { currencies: string[] }) {
  if (currencies.length === 0) return null;
  return (
    <Alert variant="warning" className="mb-6">
      <TriangleAlert />
      <AlertTitle>Missing exchange rates</AlertTitle>
      <AlertDescription>No rate yet for {currencies.join(", ")} — those amounts are left out of the PHP totals.</AlertDescription>
    </Alert>
  );
}

/** Compact quote-asset prices without treating USDT as US dollars. */
export function TokenAmount({ value, currency, signed = false, tone = false }: {
  value: number; currency: string; signed?: boolean; tone?: boolean;
}) {
  return <span className={cn("tabular-nums group-data-[private=true]/shell:blur-sm", tone && value > 0 && "text-success", tone && value < 0 && "text-destructive")}>
    {value.toLocaleString("en-US", { signDisplay: signed ? "exceptZero" : "auto", ...(value !== 0 && Math.abs(value) < 1
      ? { minimumSignificantDigits: 2, maximumSignificantDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })} {currency}
  </span>;
}

/** `back` links pages that aren't tabs (reached from Home or Settings) to where they came from. */
export function PageHeader({
  eyebrow,
  title,
  back,
  children,
}: {
  eyebrow: string;
  title: string;
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col items-start gap-3">
        {back && (
          <Button asChild variant="ghost" size="sm">
            <Link href={back.href}>
              <ChevronLeft /> {back.label}
            </Link>
          </Button>
        )}
        <p className="font-mono text-xs font-bold tracking-widest text-muted-foreground uppercase">{eyebrow}</p>
        <h1 className="-rotate-1 rounded-lg border-2 border-border bg-primary px-4 py-2 font-display text-3xl text-primary-foreground uppercase shadow-md">
          {title}
        </h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export interface Stat {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  primary?: boolean;
}

export function StatCards({ items }: { items: Stat[] }) {
  return (
    <div className={cn("mb-6 grid grid-cols-2 gap-4", items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
      {items.map((item) => (
        <Card key={item.label} variant={item.primary ? "primary" : "default"} className="gap-2 py-4">
          <CardHeader className="gap-2 px-4">
            <CardDescription className="font-mono text-xs tracking-wider uppercase">{item.label}</CardDescription>
            <CardTitle className="text-xl tabular-nums sm:text-2xl">{item.value}</CardTitle>
          </CardHeader>
          {item.hint != null && (
            <CardContent className="px-4">
              <p className="font-mono text-xs">{item.hint}</p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

/** Card with a title row and optional action (link/button) on the right. */
export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {children && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}

/** Month stepper. `href` builds the link for a month (so other filters are kept). */
export function MonthPicker({ month, current, href }: { month: string; current: string; href: (month: string) => string }) {
  return (
    <ButtonGroup aria-label="Month">
      <Button asChild variant="outline" size="icon">
        <Link href={href(addMonths(month, -1))} aria-label="Previous month">
          <ChevronLeft />
        </Link>
      </Button>
      <ButtonGroupText aria-current="date">{monthLabel(month)}</ButtonGroupText>
      <Button asChild variant="outline" size="icon">
        <Link href={href(addMonths(month, 1))} aria-label="Next month">
          <ChevronRight />
        </Link>
      </Button>
      {month !== current && (
        <Button asChild variant="outline">
          <Link href={href(current)}>Today</Link>
        </Button>
      )}
    </ButtonGroup>
  );
}

export interface BreakdownRow {
  key: string | number;
  label: string;
  color: string;
  value: number;
  /** With a budget the bar shows value/budget (amber ≥ 85%, red when over). */
  budget?: number | null;
  /** Drill-down link (e.g. that category's entries). */
  href?: string;
}

/** Budget progress when a budget exists, otherwise share of the largest row. */
export function Breakdown({ rows }: { rows: BreakdownRow[] }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((row) => {
        const budget = row.budget != null && row.budget > 0 ? row.budget : null;
        const ratio = budget ? row.value / budget : max > 0 ? row.value / max : 0;
        const variant = budget ? (ratio > 1 ? "destructive" : ratio >= 0.85 ? "warning" : "default") : "default";
        return (
          <li key={row.key} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Swatch color={row.color} />
                {row.href ? (
                  <Link href={row.href} className="truncate underline-offset-4 hover:underline">
                    {row.label}
                  </Link>
                ) : (
                  <span className="truncate">{row.label}</span>
                )}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                <Money value={row.value} />
                {budget && (
                  <>
                    {" / "}
                    <Money value={budget} />
                  </>
                )}
              </span>
            </div>
            <Progress
              aria-label={row.label}
              value={Math.min(ratio, 1) * 100}
              variant={variant}
              indicatorColor={budget ? undefined : row.color}
            />
          </li>
        );
      })}
    </ul>
  );
}
