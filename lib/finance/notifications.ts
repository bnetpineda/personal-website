import type { ConnectionView } from "./connections/types";
import { isConnectionStale, PROVIDER_META } from "./connections/types";
import { addMonths, daysBetween, monthLabel, todayManila } from "./dates";
import type { StatementCoverage } from "./imports/coverage";

export interface FinanceNotification { key: string; title: string; detail: string; href: string; severity: "warning" | "destructive" }
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
  const lastMonth = addMonths(month, -1);
  const banks = Object.entries(input.statements ?? {}) as ["wise" | "maribank", StatementCoverage][];
  const earliest = banks.map(([, c]) => c.from).sort()[0];
  for (const [provider, c] of banks) {
    const name = PROVIDER_META[provider].name, file = provider === "wise" ? "CSVs" : "PDF";
    // A month's statement is ready once the month has closed.
    if (c.to < lastMonth) alerts.push({ key: `statement:${provider}:${lastMonth}`, title: `${name}: ${monthLabel(lastMonth, "long")} statement not uploaded`,
      detail: `Imports run through ${monthLabel(c.to, "long")}. Upload the newer statement ${file} to keep spending and balances current.`, href: "/admin/connections", severity: "warning" });
    if (c.missing.length) alerts.push({ key: `statement-gap:${provider}:${c.missing.join(",")}`, title: `${name}: ${c.missing.length === 1 ? "a month is" : "months are"} missing`,
      detail: `No activity for ${c.missing.map((m) => monthLabel(m, "short")).join(", ")}. Upload ${c.missing.length === 1 ? "that statement" : "those statements"} if you have them.`, href: "/admin/connections", severity: "warning" });
    if (earliest && c.from > earliest) alerts.push({ key: `statement-start:${provider}:${earliest}`, title: `${name}: older statements not uploaded`,
      detail: `${name} starts in ${monthLabel(c.from, "long")}, but your other bank goes back to ${monthLabel(earliest, "long")}. Upload the earlier ${name} statements so income and spending add up.`, href: "/admin/connections", severity: "warning" });
  }
  if (input.aiBacklog && input.aiBacklog.waiting > 0) alerts.push({ key: `ai:${input.aiBacklog.oldest}`, title: "AI categorization is not keeping up",
    detail: `${input.aiBacklog.waiting} imported ${input.aiBacklog.waiting === 1 ? "entry has" : "entries have"} waited over a day. Check the AI Gateway key and credits, then sync again.`,
    href: "/admin/connections", severity: "warning" });
  return alerts;
}
