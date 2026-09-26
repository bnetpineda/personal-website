import { expect, test } from "bun:test";
import type { ConnectionView } from "./connections/types";
import { buildNotifications } from "./notifications";

const now = new Date("2026-09-24T04:00:00Z");
const connection: ConnectionView = { provider: "ibkr", enabled: true, includeInNetWorth: false, snapshot: null,
  lastAttemptAt: now, lastSyncedAt: null, error: "Check token", syncing: false, credentialsExpireOn: "2026-09-30", historySyncedAt: null, historyError: null, historyCoverage: null };
test("notifications use stable episode keys and honor thresholds and due dates", () => {
  const input = { connections: [connection], budgets: [{ id: 1, name: "Food", budget: 100, spent: 85 }, { id: 2, name: "Travel", budget: 100, spent: 84 }],
    bills: [{ id: "rent", description: "Rent", nextOn: "2026-09-27" }, { id: "later", description: "Later", nextOn: "2026-09-28" }] };
  const alerts = buildNotifications(input, now);
  expect(alerts.map((a) => a.key)).toEqual(["sync:ibkr:never", "expiry:ibkr:2026-09-30", "budget:2026-09:1:85", "bill:rent:2026-09-27"]);
  const restarted = { ...connection, lastAttemptAt: new Date() };
  expect(buildNotifications({ ...input, connections: [restarted] }, now)[0].key).toBe(alerts[0].key);
  const exceeded = buildNotifications({ ...input, budgets: [{ id: 1, name: "Food", budget: 100, spent: 100 }] }, now);
  expect(exceeded.some((a) => a.key === "budget:2026-09:1:100")).toBe(true);
});
test("paused connections do not produce sync alerts; expired saved credentials still do", () => {
  const alerts = buildNotifications({ connections: [{ ...connection, enabled: false, credentialsExpireOn: "2026-09-01" }], budgets: [], bills: [] }, now);
  expect(alerts).toHaveLength(1);
  expect(alerts[0].severity).toBe("destructive");
});
test("a stalled AI backlog alerts once per episode", () => {
  const base = { connections: [], budgets: [], bills: [] };
  expect(buildNotifications({ ...base, aiBacklog: null }, now)).toEqual([]);
  const [alert] = buildNotifications({ ...base, aiBacklog: { waiting: 3, oldest: "2026-09-20" } }, now);
  expect(alert).toMatchObject({ key: "ai:2026-09-20", href: "/admin/connections", severity: "warning" });
  expect(alert.detail).toStartWith("3 imported entries have");
});

test("statement banks remind about a closed month, gaps, and a later start than the other bank", () => {
  const now = new Date("2026-10-03T04:00:00Z");
  const at = new Date("2026-09-27T00:00:00Z");
  const alerts = buildNotifications({ connections: [], budgets: [], bills: [], statements: {
    maribank: { from: "2026-02", to: "2026-08", entries: 260, importedAt: at, missing: [] },
    wise: { from: "2026-06", to: "2026-09", entries: 45, importedAt: at, missing: ["2026-07"] },
  } }, now);
  expect(alerts.map((a) => a.key)).toEqual(["statement:maribank:2026-09", "statement-gap:wise:2026-07", "statement-start:wise:2026-02"]);
  expect(alerts[0].title).toBe("MariBank: September 2026 statement not uploaded");
  // Up to date and complete: nothing to say.
  expect(buildNotifications({ connections: [], budgets: [], bills: [], statements: {
    wise: { from: "2026-06", to: "2026-09", entries: 45, importedAt: at, missing: [] } } }, now)).toEqual([]);
});
