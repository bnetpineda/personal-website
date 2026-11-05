"use server";

import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { notificationDismissals } from "@/lib/db/schema";
import { getAccounts, getCategories, getConnections, getFx, getImportedIncome, getRecurring, getStatementBalances, getTeachGroups } from "@/lib/dal";
import { computeNetWorth } from "@/lib/finance/calc";
import { includedPositions } from "@/lib/finance/connections/types";
import type { CashFlowKind } from "@/lib/finance/constants";
import { todayManila } from "@/lib/finance/dates";
import { groupAlerts } from "@/lib/finance/notifications";
import { getNotifications } from "@/lib/finance/notifications-dal";
import { dueOccurrences } from "@/lib/finance/recurrence";
import { importedIncomeSince, repeatPayers, typicalIncome } from "@/lib/finance/repeat-income";
import type { FormState } from "@/lib/finance/schemas";
import { statementPositions } from "@/lib/finance/statement-balances";
import type { InboxProps } from "../_components/dashboard";

/** Needs you for pages other than the Overview, fetched when it opens. */
export async function getInboxData(): Promise<InboxProps> {
  await requireAdmin();
  const today = todayManila();
  const [notifications, connections, fx, balances, recurring, received, teach, categories, accounts] = await Promise.all([
    getNotifications(), getConnections(), getFx(), getStatementBalances(), getRecurring(), getImportedIncome(importedIncomeSince(today)), getTeachGroups(), getCategories(), getAccounts(),
  ]);
  const netWorth = computeNetWorth([], [], fx, [...includedPositions(connections), ...statementPositions(balances)]);
  const income = typicalIncome(fx, recurring, repeatPayers(received));
  const form = (kind: CashFlowKind) => categories.filter((c) => c.kind === kind).map(({ id, name, color, archived }) => ({ id, name, color, archived }));
  return {
    groups: groupAlerts(notifications.filter((alert) => !alert.dismissed)),
    missingFx: [...new Set([...netWorth.missingFx, ...income.missing])],
    due: dueOccurrences(recurring, today),
    teach,
    today,
    categories: { expense: form("expense"), income: form("income") },
    accounts,
  };
}

const keysSchema = z.array(z.string().min(1).max(200)).min(1).max(20);

/** Dismisses (or restores) alerts together, e.g. all of one account's alerts on the dashboard. */
export async function dismissNotifications(keys: string[], dismissed: boolean): Promise<FormState> {
  await requireAdmin();
  const parsed = keysSchema.safeParse(keys);
  if (!parsed.success || typeof dismissed !== "boolean") return { ok: false, message: "Invalid notification." };
  if (dismissed) await getDb().insert(notificationDismissals).values(parsed.data.map((key) => ({ key }))).onConflictDoNothing();
  else await getDb().delete(notificationDismissals).where(inArray(notificationDismissals.key, parsed.data));
  revalidatePath("/admin", "layout");
  const one = parsed.data.length === 1;
  return { ok: true, message: dismissed ? (one ? "Alert dismissed." : `${parsed.data.length} alerts dismissed.`) : one ? "Alert restored." : "Alerts restored." };
}
