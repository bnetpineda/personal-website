import type { ConnectionView } from "./connections/types";
import { isConnectionStale, PROVIDER_META } from "./connections/types";
import { daysBetween, nextDueDate, todayManila } from "./dates";

export interface FinanceNotification { key: string; title: string; detail: string; href: string; severity: "warning" | "destructive" }
export function buildNotifications(input: {
  connections: ConnectionView[];
  budgets: { id: number; name: string; budget: number; spent: number }[];
  bills: { id: string; description: string; nextOn: string | null }[];
  debts: { id: string; name: string; dueDay: number | null; lastPaidOn: string | null }[];
  /** Pending entries AI has not reached after a day, while AI is configured. Background runs fail quietly. */
  aiBacklog?: { waiting: number; oldest: string } | null;
}, now = new Date()): FinanceNotification[] {
  const today = todayManila(now), month = today.slice(0, 7);
  const alerts: FinanceNotification[] = [];
  for (const c of input.connections) {
    const name = PROVIDER_META[c.provider].name;
    const episode = c.lastSyncedAt?.toISOString() ?? "never";
    if (c.enabled && (c.error || isConnectionStale(c, now))) alerts.push({ key: `sync:${c.provider}:${episode}`,
      title: `${name} sync needs attention`, detail: c.error || "Saved balances are older than the expected sync window.", href: "/admin/connections", severity: "warning" });
    if (c.enabled && c.historyError) alerts.push({ key: `history:${c.provider}:${c.historySyncedAt?.toISOString() ?? "never"}`,
      title: `${name} history needs attention`, detail: c.historyError, href: "/admin/connections", severity: "warning" });
    if (c.credentialsExpireOn && daysBetween(today, c.credentialsExpireOn) <= 7) alerts.push({ key: `expiry:${c.provider}:${c.credentialsExpireOn}`,
      title: `${name} credential ${c.credentialsExpireOn < today ? "expired" : "expires soon"}`,
      detail: `Your saved expiry date is ${c.credentialsExpireOn}. Update the credential and its reminder after renewal.`, href: "/admin/connections", severity: c.credentialsExpireOn < today ? "destructive" : "warning" });
  }
  for (const b of input.budgets) if (b.budget > 0 && b.spent >= b.budget * 0.85) {
    const exceeded = b.spent >= b.budget;
    alerts.push({ key: `budget:${month}:${b.id}:${exceeded ? "100" : "85"}`, title: `${b.name} budget ${exceeded ? "reached" : "nearly used"}`,
      detail: `Posted expenses have reached ${exceeded ? "100%" : "85%"} of this month's budget. Pending imports are excluded.`, href: `/admin/transactions?kind=expense&month=${month}&category=${b.id}`, severity: exceeded ? "destructive" : "warning" });
  }
  for (const b of input.bills) if (b.nextOn && daysBetween(today, b.nextOn) <= 3) alerts.push({ key: `bill:${b.id}:${b.nextOn}`,
    title: `${b.description} ${b.nextOn < today ? "is overdue" : "is coming up"}`, detail: `Scheduled for ${b.nextOn}.`, href: "/admin/recurring", severity: "warning" });
  for (const d of input.debts) {
    if (!d.dueDay) continue;
    const due = nextDueDate(d.dueDay, today);
    if (due.inDays <= 3 && (!d.lastPaidOn || d.lastPaidOn.slice(0, 7) !== due.date.slice(0, 7))) alerts.push({ key: `debt:${d.id}:${due.date}`,
      title: `${d.name} payment is coming up`, detail: `The saved due day falls on ${due.date}. Check the lender's statement for the amount due.`, href: "/admin/debts", severity: "warning" });
  }
  if (input.aiBacklog && input.aiBacklog.waiting > 0) alerts.push({ key: `ai:${input.aiBacklog.oldest}`, title: "AI categorization is not keeping up",
    detail: `${input.aiBacklog.waiting} imported ${input.aiBacklog.waiting === 1 ? "entry has" : "entries have"} waited over a day. Check the AI Gateway key and credits, then run Categorize with AI.`,
    href: "/admin/inbox", severity: "warning" });
  return alerts;
}
