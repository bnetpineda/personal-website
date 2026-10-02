"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Swatch } from "@/components/ui/swatch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SyncProvider } from "@/lib/finance/connections/types";
import { addDays, dayLabel } from "@/lib/finance/dates";
import { changeSince } from "@/lib/finance/performance";
import { PortfolioChart, RANGES } from "./charts";
import { EmptyState, Money, Pct } from "./ui";

/** One investment account, already converted to the page currency on the server. */
export interface PortfolioAccount {
  provider: SyncProvider;
  name: string;
  /** What it holds, e.g. "Crypto" or "Stocks & ETFs". */
  kind: string;
  color: string;
  /** "Synced 3 h ago", "Close of Tue, Sep 30", "Sync paused"… */
  status: string;
  attention: boolean;
  inNetWorth: boolean;
  value: number;
  valueUsd: number;
  pnl: number | null;
  pnlPct: number | null;
  /** Saved history ending in the live balances. */
  points: { date: string; value: number; pnl: number | null }[];
  winners: AccountMover[];
  losers: AccountMover[];
  /** What the P/L leaves out, with where to fix it. */
  note: { text: string; href: string; link: string } | null;
}

export interface AccountMover {
  symbol: string;
  pnl: number;
  pnlPct: number | null;
}

type View = "value" | "pnl";

const label = "font-mono text-xs font-bold tracking-wider text-muted-foreground uppercase";

/** Account cards with their charts; one range and one Value / P/L switch drive them all. */
export function PortfolioAccounts({ accounts, currency, today }: { accounts: PortfolioAccount[]; currency: string; today: string }) {
  const [range, setRange] = useState<string>("3M");
  const [view, setView] = useState<View>("value");
  const days = RANGES.find((r) => r.value === range)?.days ?? 0;
  // "All" starts at the first saved day.
  const since = days ? addDays(today, -days) : "";

  return (
    <section aria-label="Performance by account" className="mb-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && setView(v as View)} aria-label="Chart">
          <ToggleGroupItem value="value">Value</ToggleGroupItem>
          <ToggleGroupItem value="pnl">P/L</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(v) => v && setRange(v)} aria-label="Range">
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.value} value={r.value}>
              {r.value}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {accounts.map((account) => (
          <AccountCard key={account.provider} account={account} since={since} view={view} currency={currency} />
        ))}
      </div>
    </section>
  );
}

function AccountCard({ account: a, since, view, currency }: { account: PortfolioAccount; since: string; view: View; currency: string }) {
  const series = a.points.flatMap((p) => {
    const value = view === "value" ? p.value : p.pnl;
    return value == null ? [] : [{ date: p.date, value }];
  });
  const change = changeSince(series, since);
  // The chart starts where the change does, so the line and the number cover the same days.
  const shown = change ? series.filter((p) => p.date >= change.from) : series;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Swatch color={a.color} />
            <CardTitle>{a.name}</CardTitle>
          </div>
          {a.attention && (
            <Link href="/admin/connections">
              <Badge variant="warning">Check sync</Badge>
            </Link>
          )}
        </div>
        <CardDescription>
          {a.kind} · {a.status}
          {!a.inNetWorth && " · not in net worth"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div>
          <p className="font-display text-3xl tabular-nums">
            <Money value={a.value} currency={currency} />
          </p>
          {currency !== "USD" && (
            <p className="font-mono text-xs text-muted-foreground">
              <Money value={a.valueUsd} currency="USD" />
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex flex-col gap-1">
            <dt className={label}>Profit / loss</dt>
            <dd className="flex flex-wrap items-baseline gap-x-2 font-mono">
              {a.pnl == null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <>
                  <Money value={a.pnl} currency={currency} signed tone />
                  <span className="text-xs">
                    <Pct value={a.pnlPct} tone />
                  </span>
                </>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className={label}>{change ? `${view === "pnl" ? "P/L since" : "Since"} ${dayLabel(change.from)}` : "Change"}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-2 font-mono">
              {change ? (
                <>
                  <Money value={change.change} currency={currency} signed tone />
                  {view === "value" && (
                    <span className="text-xs">
                      <Pct value={change.pct} tone />
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </dd>
          </div>
        </dl>

        {shown.length >= 2 ? (
          <PortfolioChart points={shown} label={view === "value" ? "Value" : "P/L"} color={a.color} currency={currency} />
        ) : (
          <EmptyChart account={a} view={view} />
        )}

        {(a.winners.length > 0 || a.losers.length > 0) && (
          <div className="grid grid-cols-2 gap-4">
            <Movers title="Best" movers={a.winners} currency={currency} />
            <Movers title="Worst" movers={a.losers} currency={currency} />
          </div>
        )}

        {a.note && (
          <p className="text-sm text-muted-foreground">
            {a.note.text}{" "}
            <Link href={a.note.href} className="underline underline-offset-4">
              {a.note.link}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ account: a, view }: { account: PortfolioAccount; view: View }) {
  if (view === "pnl" && a.pnl == null) {
    return (
      <EmptyState title="No P/L yet">
        {a.provider === "binance" ? "Import your Spot purchases on History to estimate it." : "The IBKR report has no cost basis for these holdings."}
      </EmptyState>
    );
  }
  return (
    <EmptyState title="Building history">
      {view === "pnl"
        ? "P/L is saved every day; the chart starts with the next one."
        : a.provider === "ibkr"
          ? "A point is saved after every statement. To load earlier days now, add Net Asset Value (NAV) in Base to your IBKR history query."
          : "A point is saved every day; the chart starts with the next one."}
    </EmptyState>
  );
}

function Movers({ title, movers, currency }: { title: string; movers: AccountMover[]; currency: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className={label}>{title}</p>
      {movers.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {movers.map((m) => (
            <li key={m.symbol} className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold">{m.symbol}</span>
              <span className="flex shrink-0 flex-col items-end font-mono text-xs">
                <Money value={m.pnl} currency={currency} signed tone />
                <Pct value={m.pnlPct} tone />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
