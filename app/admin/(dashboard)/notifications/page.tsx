import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getNotifications } from "@/lib/finance/notifications-dal";
import { FinanceLinks } from "../../_components/finance-links";
import { DismissNotificationButton } from "../../_components/notification-controls";
import { EmptyState, PageHeader } from "../../_components/ui";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const params = await searchParams, alerts = await getNotifications();
  const dismissed = params.show === "dismissed", visible = alerts.filter((a) => a.dismissed === dismissed);
  return <>
    <PageHeader eyebrow="Private finance · reminders" title="Notifications" />
    <FinanceLinks current="notifications" />
    <p className="mb-6 text-sm text-muted-foreground">Alerts appear here and on the dashboard bell: failed or stale syncs, saved credential expiry dates within 7 days, bills within 3 days, and budgets at 85% or 100%. They refresh when you open the dashboard; provider data also refreshes with scheduled syncs.</p>
    <div className="mb-6 flex gap-2"><Button asChild variant={dismissed ? "outline" : "default"}><Link href="/admin/notifications">Active ({alerts.filter((a) => !a.dismissed).length})</Link></Button><Button asChild variant={dismissed ? "default" : "outline"}><Link href="/admin/notifications?show=dismissed">Dismissed</Link></Button></div>
    {!visible.length ? <EmptyState title={dismissed ? "No dismissed alerts" : "All caught up"}>Resolved conditions disappear automatically. New billing periods and renewed sync failures can generate new reminders.</EmptyState> : <div className="flex flex-col gap-4">{visible.map((a) => <Alert key={a.key} variant={a.severity}>
      <AlertTitle>{a.title}</AlertTitle><AlertDescription>{a.detail}<div className="mt-3 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={a.href}>Review</Link></Button><DismissNotificationButton alertKey={a.key} dismissed={a.dismissed} /></div></AlertDescription>
    </Alert>)}</div>}
  </>;
}
