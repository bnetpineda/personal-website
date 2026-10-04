import type { ConnectionView, Provider } from "./connections/types";
import { isConnectionStale, PROVIDER_META } from "./connections/types";
import { addMonths, daysBetween, monthLabel, todayManila } from "./dates";
import type { StatementCoverage } from "./imports/coverage";

export type NotificationType = "sync" | "history" | "expiry" | "budget" | "bill" | "statement" | "ai";

export interface FinanceNotification {
  key: string;
  title: string;
  detail: string;
  href: string;
  severity: "warning" | "destructive";
  type: NotificationType;
  /** The account it is about, so the dashboard can gather an account's alerts and offer its fix in place. */
  provider?: Provider;
  /** The title without the account's name, for a line inside that account's group. */
  label: string;
}

export function buildNotifications(input: {
  connections: { provider: ConnectionView["provider"]; enabled: boolean; error: string | null; lastSyncedAt: Date | null; historyError: string | null; historySyncedAt: Date | null; credentialsExpireOn: string | null; snapshot: { asOf: string } | null }[];
  budgets: { id: number; name: string; budget: number; spent: number }[];
  bills: { id: string; description: string; nextOn: string | null }[];
  /** Imported entries still uncategorized after a day, while AI is configured. Background runs fail quietly. */
  aiBacklog?: { waiting: number; oldest: string } | null;
  /** What each statement-only bank (Wise, MariBank) has imported: they update only when the person uploads. */
  statements?: Partial<Record<"wise" | "maribank", StatementCoverage>>;
}, now = new Date()): FinanceNotification[] {
  const today = todayManila(now), month = today.slice(0, 7);
  const alerts: FinanceNotification[] = [];
  for (const c of input.connections) {
    const name = PROVIDER_META[c.provider].name;
    const episode = c.lastSyncedAt?.toISOString() ?? "never";
    if (c.enabled && (c.error || isConnectionStale(c, now))) alerts.push({ key: `sync:${c.provider}:${episode}`, type: "sync", provider: c.provider,
      title: `${name} sync needs attention`, label: "Sync needs attention", detail: c.error || "Saved balances are older than the expected sync window.", href: "/admin/connections", severity: "warning" });
    if (c.enabled && c.historyError) alerts.push({ key: `history:${c.provider}:${c.historySyncedAt?.toISOString() ?? "never"}`, type: "history", provider: c.provider,
      title: `${name} history needs attention`, label: "History needs attention", detail: c.historyError, href: "/admin/connections", severity: "warning" });
    if (c.credentialsExpireOn && daysBetween(today, c.credentialsExpireOn) <= 7) {
      const expired = c.credentialsExpireOn < today;
      alerts.push({ key: `expiry:${c.provider}:${c.credentialsExpireOn}`, type: "expiry", provider: c.provider,
        title: `${name} credential ${expired ? "expired" : "expires soon"}`, label: `Credential ${expired ? "expired" : "expires soon"}`,
        detail: `Your saved expiry date is ${c.credentialsExpireOn}. Update the credential and its reminder after renewal.`, href: "/admin/connections", severity: expired ? "destructive" : "warning" });
    }
  }
  for (const b of input.budgets) if (b.budget > 0 && b.spent >= b.budget * 0.85) {
    const exceeded = b.spent >= b.budget;
    const title = `${b.name} budget ${exceeded ? "reached" : "nearly used"}`;
    alerts.push({ key: `budget:${month}:${b.id}:${exceeded ? "100" : "85"}`, type: "budget", title, label: title,
      detail: `Posted expenses have reached ${exceeded ? "100%" : "85%"} of this month's budget. Pending imports are excluded.`, href: `/admin?kind=expense&month=${month}&category=${b.id}`, severity: exceeded ? "destructive" : "warning" });
  }
  for (const b of input.bills) if (b.nextOn && daysBetween(today, b.nextOn) <= 3) {
    const title = `${b.description} ${b.nextOn < today ? "is overdue" : "is coming up"}`;
    alerts.push({ key: `bill:${b.id}:${b.nextOn}`, type: "bill", title, label: title, detail: `Scheduled for ${b.nextOn}.`, href: "/admin/recurring", severity: "warning" });
  }
  const lastMonth = addMonths(month, -1);
  const banks = Object.entries(input.statements ?? {}) as ["wise" | "maribank", StatementCoverage][];
  const earliest = banks.map(([, c]) => c.from).sort()[0];
  for (const [provider, c] of banks) {
    const name = PROVIDER_META[provider].name, file = provider === "wise" ? "CSVs" : "PDF";
    // A month's statement is ready once the month has closed.
    if (c.to < lastMonth) alerts.push({ key: `statement:${provider}:${lastMonth}`, type: "statement", provider,
      title: `${name}: ${monthLabel(lastMonth, "long")} statement not uploaded`, label: `${monthLabel(lastMonth, "long")} statement not uploaded`,
      detail: `Imports run through ${monthLabel(c.to, "long")}. Upload the newer statement ${file} to keep spending and balances current.`, href: "/admin/connections", severity: "warning" });
    if (c.missing.length) alerts.push({ key: `statement-gap:${provider}:${c.missing.join(",")}`, type: "statement", provider,
      title: `${name}: ${c.missing.length === 1 ? "a month is" : "months are"} missing`, label: `${c.missing.length === 1 ? "A month is" : "Months are"} missing`,
      detail: `No activity for ${c.missing.map((m) => monthLabel(m, "short")).join(", ")}. Upload ${c.missing.length === 1 ? "that statement" : "those statements"} if you have them.`, href: "/admin/connections", severity: "warning" });
    if (earliest && c.from > earliest) alerts.push({ key: `statement-start:${provider}:${earliest}`, type: "statement", provider,
      title: `${name}: older statements not uploaded`, label: "Older statements not uploaded",
      detail: `${name} starts in ${monthLabel(c.from, "long")}, but your other bank goes back to ${monthLabel(earliest, "long")}. Upload the earlier ${name} statements so income and spending add up.`, href: "/admin/connections", severity: "warning" });
  }
  if (input.aiBacklog && input.aiBacklog.waiting > 0) {
    const title = "AI categorization is not keeping up";
    alerts.push({ key: `ai:${input.aiBacklog.oldest}`, type: "ai", title, label: title,
      detail: `${input.aiBacklog.waiting} imported ${input.aiBacklog.waiting === 1 ? "entry has" : "entries have"} waited over a day. Check the AI Gateway key and credits, then sync again.`,
      href: "/admin/connections", severity: "warning" });
  }
  return alerts;
}

/** Alerts as the dashboard shows them: one group per account, or a single alert on its own. */
export interface AlertGroup {
  key: string;
  /** Set when the group gathers one account's alerts. */
  provider: Provider | null;
  title: string;
  severity: "warning" | "destructive";
  /** One per alert. `label` is null for a single alert, whose title is the group's. */
  lines: { key: string; label: string | null; detail: string }[];
  /** Notification keys that dismiss together. */
  keys: string[];
  href: string;
  types: NotificationType[];
}

/**
 * An account's alerts become one group (IBKR: a stale sync and missing history), so the same account
 * isn't flagged twice; everything else stays a single alert. Groups keep the order of their first alert.
 */
export function groupAlerts(alerts: FinanceNotification[]): AlertGroup[] {
  const groups: AlertGroup[] = [];
  const byProvider = new Map<Provider, AlertGroup>();
  for (const a of alerts) {
    const grouped = a.provider ? byProvider.get(a.provider) : undefined;
    if (grouped) {
      grouped.lines.push({ key: a.key, label: a.label, detail: a.detail });
      grouped.keys.push(a.key);
      if (!grouped.types.includes(a.type)) grouped.types.push(a.type);
      if (a.severity === "destructive") grouped.severity = "destructive";
      continue;
    }
    const group: AlertGroup = a.provider
      ? { key: `provider:${a.provider}`, provider: a.provider, title: PROVIDER_META[a.provider].name, severity: a.severity,
          lines: [{ key: a.key, label: a.label, detail: a.detail }], keys: [a.key], href: `/admin/connections#${a.provider}`, types: [a.type] }
      : { key: a.key, provider: null, title: a.title, severity: a.severity, lines: [{ key: a.key, label: null, detail: a.detail }], keys: [a.key], href: a.href, types: [a.type] };
    if (a.provider) byProvider.set(a.provider, group);
    groups.push(group);
  }
  return groups;
}
