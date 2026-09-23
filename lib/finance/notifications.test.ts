import { expect, test } from "bun:test";
import type { ConnectionView } from "./connections/types";
import { buildNotifications } from "./notifications";

const now = new Date("2026-09-24T04:00:00Z");
const connection: ConnectionView = { provider: "ibkr", enabled: true, includeInNetWorth: false, snapshot: null,
  lastAttemptAt: now, lastSyncedAt: null, error: "Check token", syncing: false, credentialsExpireOn: "2026-09-30", historySyncedAt: null, historyError: null, historyCoverage: null };
test("notifications use stable episode keys and honor thresholds and due dates", () => {
  const input = { connections: [connection], budgets: [{ id: 1, name: "Food", budget: 100, spent: 85 }, { id: 2, name: "Travel", budget: 100, spent: 84 }],
    bills: [{ id: "rent", description: "Rent", nextOn: "2026-09-27" }, { id: "later", description: "Later", nextOn: "2026-09-28" }],
    debts: [{ id: "card", name: "Card", dueDay: 25, lastPaidOn: "2026-09-20" }] };
  const alerts = buildNotifications(input, now);
  expect(alerts.map((a) => a.key)).toEqual(["sync:ibkr:never", "expiry:ibkr:2026-09-30", "budget:2026-09:1:85", "bill:rent:2026-09-27"]);
  expect(buildNotifications({ ...input, connections: [{ ...connection, lastAttemptAt: new Date() }] }, now)[0].key).toBe(alerts[0].key);
  const exceeded = buildNotifications({ ...input, budgets: [{ id: 1, name: "Food", budget: 100, spent: 100 }] }, now);
  expect(exceeded.some((a) => a.key === "budget:2026-09:1:100")).toBe(true);
});
test("paused connections do not produce sync alerts; expired saved credentials still do", () => {
  const alerts = buildNotifications({ connections: [{ ...connection, enabled: false, credentialsExpireOn: "2026-09-01" }], budgets: [], bills: [], debts: [] }, now);
  expect(alerts).toHaveLength(1);
  expect(alerts[0].severity).toBe("destructive");
});
test("a stalled AI backlog alerts once per episode", () => {
  const base = { connections: [], budgets: [], bills: [], debts: [] };
  expect(buildNotifications({ ...base, aiBacklog: null }, now)).toEqual([]);
  const [alert] = buildNotifications({ ...base, aiBacklog: { waiting: 3, oldest: "2026-09-20" } }, now);
  expect(alert).toMatchObject({ key: "ai:2026-09-20", href: "/admin/inbox", severity: "warning" });
  expect(alert.detail).toStartWith("3 imported entries have");
});
