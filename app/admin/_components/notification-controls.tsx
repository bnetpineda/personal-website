"use client";
import { dismissNotification } from "../_actions/notifications";
import { ImportAction } from "./import-controls";

export function DismissNotificationButton({ alertKey, dismissed }: { alertKey: string; dismissed: boolean }) {
  return <ImportAction action={() => dismissNotification(alertKey, !dismissed)}>{dismissed ? "Restore" : "Dismiss"}</ImportAction>;
}
