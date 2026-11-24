import { expect, test } from "bun:test";
import { categorySpikes, debtReminders, doubleCharges, newPayees, priceRises, sameSubscription, type RecentExpense } from "./anomalies";
import { buildNotifications } from "./notifications";

const today = "2026-11-20";

test("a category well above its usual month alerts once per month; budgeted, small or new categories don't", () => {
  const alerts = categorySpikes([
    { id: 1, name: "Food", spent: 9_000, previous: [5_000, 4_000, 6_000], budgeted: false },
    { id: 2, name: "Coffee", spent: 900, previous: [500, 400, 600], budgeted: false },
    { id: 3, name: "Rent", spent: 30_000, previous: [10_000, 10_000, 10_000], budgeted: true },
    { id: 4, name: "Travel", spent: 20_000, previous: [0, 0, 3_000], budgeted: false },
    { id: 5, name: "Shopping", spent: 7_400, previous: [5_000, 5_000, 5_000], budgeted: false },
  ], "2026-11");
  expect(alerts.map((a) => a.key)).toEqual(["spike:2026-11:1"]);
  expect(alerts[0]).toMatchObject({ type: "spending", title: "Food spending is up", href: "/admin?kind=expense&month=2026-11&category=1" });
  expect(alerts[0].detail).toContain("1.8×");
  expect(alerts[0].detail).not.toMatch(/\d{3,}/);
});

const expense = (over: Partial<RecentExpense>): RecentExpense => ({ id: "x", description: "Card payment: Lazada", amount: 6_000, currency: "PHP", amountPhp: 6_000, occurredOn: "2026-11-18", ...over });
const known = new Set(["shopee"]);

test("a large first payment to a new payee alerts; known, small, old or repeated ones don't", () => {
  const alerts = newPayees([
    expense({ id: "a" }),
    expense({ id: "b", occurredOn: "2026-11-19" }),
    expense({ id: "c", description: "Payment: Shopee" }),
    expense({ id: "d", description: "Sent to Juan Dela Cruz", amountPhp: 900 }),
    expense({ id: "e", description: "Sent to Old Friend", occurredOn: "2026-10-01" }),
  ], known, 100, today);
  expect(alerts.map((a) => a.key)).toEqual(["new-payee:a"]);
  expect(alerts[0].title).toBe("First large payment to Lazada");
  // Too little history: everyone looks new, so it waits.
  expect(newPayees([expense({ id: "a" })], new Set(["shopee"]), 5, today)).toEqual([]);
});

test("the same payee and amount on one day from two banks is a possible double charge", () => {
  const charge = { occurredOn: "2026-11-10", amount: -549, currency: "PHP", description: "Card payment: NETFLIX.COM" };
  const alerts = doubleCharges([
    { id: "g1", provider: "gotyme", ...charge },
    { id: "m1", provider: "maribank", ...charge, description: "NETFLIX.COM" },
    { id: "g2", provider: "gotyme", ...charge, occurredOn: "2026-11-11" },
    { id: "g3", provider: "gotyme", ...charge, description: "Card payment: Spotify" },
    { id: "w3", provider: "wise", ...charge, description: "Card payment: Spotify", amount: 549 },
  ], today);
  expect(alerts.map((a) => a.key)).toEqual(["double:g1:m1"]);
  expect(alerts[0].detail).toContain("GoTyme and MariBank");
  // Two charges in the same bank are two payments, not a double import.
  expect(doubleCharges([{ id: "a", provider: "gotyme", ...charge }, { id: "b", provider: "gotyme", ...charge }], today)).toEqual([]);
});

test("a subscription charged above its recurring amount alerts on the latest such charge", () => {
  expect(sameSubscription("Netflix", "Card payment: NETFLIX.COM (549 PHP)")).toBe(true);
  expect(sameSubscription("Netflix", "Card payment: Netflixable Store")).toBe(false);
  expect(sameSubscription("Spotify", "Sent to Juan")).toBe(false);
  const subs = [{ id: "n", description: "Netflix", amount: 549, currency: "PHP" }, { id: "s", description: "Spotify", amount: 149, currency: "PHP" }];
  const alerts = priceRises(subs, [
    expense({ id: "1", description: "Card payment: NETFLIX.COM", amount: 649, occurredOn: "2026-11-02" }),
    expense({ id: "2", description: "Card payment: NETFLIX.COM", amount: 649, occurredOn: "2026-10-02" }),
    expense({ id: "3", description: "Card payment: Spotify", amount: 149 }),
    expense({ id: "4", description: "Card payment: Spotify", amount: 3, currency: "USD" }),
  ], today);
  expect(alerts.map((a) => a.key)).toEqual(["price-up:n:1"]);
  expect(alerts[0].href).toBe("/admin/recurring");
});

test("debt reminders fire within three days of the due date unless a payment was recorded for it", () => {
  const debts = [
    { id: "card", name: "BPI card", dueDay: 22, lastPaidOn: null },
    { id: "paid", name: "Loan", dueDay: 22, lastPaidOn: "2026-11-15" },
    { id: "late-paid", name: "BNPL", dueDay: 22, lastPaidOn: "2026-10-25" },
    { id: "far", name: "Far", dueDay: 28, lastPaidOn: null },
    { id: "none", name: "None", dueDay: null, lastPaidOn: null },
  ];
  expect(debtReminders(debts, today).map((a) => a.key)).toEqual(["debt:card:2026-11-22", "debt:late-paid:2026-11-22"]);
  expect(debtReminders([{ id: "t", name: "Card", dueDay: 20, lastPaidOn: null }], today)[0].title).toBe("Card payment is due today");
});

test("buildNotifications includes debt and spending alerts when given them", () => {
  const alerts = buildNotifications({ connections: [], budgets: [], bills: [],
    debts: [{ id: "card", name: "BPI card", dueDay: 22, lastPaidOn: null }],
    spending: { categories: [{ id: 1, name: "Food", spent: 9_000, previous: [5_000, 4_000, 6_000], budgeted: false }], expenses: [], knownPayees: new Set(), olderExpenses: 0, bankCharges: [], subscriptions: [] },
  }, new Date("2026-11-20T04:00:00Z"));
  expect(alerts.map((a) => a.type)).toEqual(["debt", "spending"]);
});
