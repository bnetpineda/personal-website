import { describe, expect, test } from "bun:test";
import { categoryIdMap, keySet, parseBackup, planRestore, withCategoryIds, type Backup } from "./backup";

const ts = "2026-10-01T00:00:00.000Z";
const groceries = { id: 7, kind: "expense", name: "Groceries", color: "#FF4D50", monthlyBudget: 5000, sortOrder: 0, archived: false, createdAt: ts, updatedAt: ts };
const salary = { id: 8, kind: "income", name: "Salary", color: "#8AE500", monthlyBudget: null, sortOrder: 1, archived: false, createdAt: ts, updatedAt: ts };
const flow = (id: string, extra: object = {}) => ({
  id, kind: "expense", occurredOn: "2026-10-02", amount: 120, currency: "PHP", amountPhp: 120, categoryId: 7, description: "Market",
  account: null, notes: null, recurringId: null, recurringOn: null, liabilityId: null, createdAt: ts, updatedAt: ts, ...extra,
});
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function file(extra: object = {}) {
  return JSON.stringify({
    exportedAt: ts,
    categories: [groceries, salary],
    cashFlows: [flow(A), flow(B)],
    categoryBudgets: [{ categoryId: 7, month: "2026-10", amount: 4000, createdAt: ts, updatedAt: ts }],
    fxRates: [{ currency: "USD", rateToPhp: 56.1, asOf: "2026-10-01", updatedAt: ts }],
    connections: [{ provider: "binance", enabled: true }],
    ...extra,
  });
}

function parsed(extra: object = {}): Backup {
  const result = parseBackup(file(extra));
  if (!result.ok) throw new Error(result.message);
  return result.backup;
}

describe("backup parsing", () => {
  test("reads an export, with dates as Dates and missing newer tables as empty", () => {
    const backup = parsed();
    expect(backup.cashFlows).toHaveLength(2);
    expect(backup.cashFlows[0].createdAt).toEqual(new Date(ts));
    expect(backup.goals).toEqual([]);
    expect(backup.holdings).toEqual([]);
    expect("connections" in backup).toBe(false);
  });

  test("an older export without goals or monthly budgets still parses", () => {
    const old = JSON.parse(file());
    delete old.categoryBudgets;
    const result = parseBackup(JSON.stringify(old));
    expect(result.ok && result.backup.categoryBudgets).toEqual([]);
  });

  test("rejects files that aren't backups, edited rows and dangling references", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup(JSON.stringify({ categories: [] })).ok).toBe(false);
    expect(parseBackup(file({ cashFlows: [flow(A, { amount: -5 })] })).ok).toBe(false);
    expect(parseBackup(file({ cashFlows: [flow(A, { categoryId: 99 })] })).ok).toBe(false);
    expect(parseBackup(file({ cashFlows: [flow(A, { recurringId: B, recurringOn: "2026-10-02" })] })).ok).toBe(false);
  });
});

describe("restore plan", () => {
  test("into an empty database, everything is new", () => {
    const plan = planRestore(parsed(), { categories: [], keys: {} });
    expect(plan.counts).toEqual([
      { table: "categories", label: "Categories", fresh: 2, present: 0 },
      { table: "cashFlows", label: "Entries", fresh: 2, present: 0 },
      { table: "categoryBudgets", label: "Monthly budgets", fresh: 1, present: 0 },
      { table: "fxRates", label: "Exchange rates", fresh: 1, present: 0 },
    ]);
  });

  test("existing rows are left alone, matching categories by kind and name", () => {
    const backup = parsed();
    const existing = {
      categories: [{ id: 3, kind: "expense", name: "Groceries" }],
      keys: {
        cashFlows: keySet("cashFlows", [{ id: A, recurringId: null, recurringOn: null }]),
        categoryBudgets: keySet("categoryBudgets", [{ categoryId: 3, month: "2026-10" }]),
        fxRates: keySet("fxRates", [{ currency: "USD" }]),
      },
    };
    const plan = planRestore(backup, existing);
    expect(plan.counts.map(({ table, fresh, present }) => [table, fresh, present])).toEqual([
      ["categories", 1, 1], ["cashFlows", 1, 1], ["categoryBudgets", 0, 1], ["fxRates", 0, 1],
    ]);
    expect(plan.rows.categories.map((c) => c.name)).toEqual(["Salary"]);
    expect(plan.rows.cashFlows.map((f) => f.id)).toEqual([B]);
  });

  test("a recurring occurrence already posted under another id counts as present", () => {
    const R = "33333333-3333-4333-8333-333333333333";
    const recurring = [{ id: R, kind: "expense", amount: 120, currency: "PHP", categoryId: 7, description: "Rent", account: null, notes: null, frequency: "monthly", startOn: "2026-01-02", secondDay: null, endOn: null, nextOn: null, autoPost: true, paused: false }];
    const backup = parsed({ recurring, cashFlows: [flow(A, { recurringId: R, recurringOn: "2026-10-02" })] });
    const plan = planRestore(backup, { categories: [], keys: { cashFlows: keySet("cashFlows", [{ id: B, recurringId: R, recurringOn: "2026-10-02" }]) } });
    expect(plan.rows.cashFlows).toEqual([]);
  });

  test("duplicates inside one file are inserted once", () => {
    const plan = planRestore(parsed({ cashFlows: [flow(A), flow(A)] }), { categories: [], keys: {} });
    expect(plan.rows.cashFlows).toHaveLength(1);
  });

  test("category ids are remapped to the database's", () => {
    const backup = parsed();
    const ids = categoryIdMap(backup, [{ id: 3, kind: "expense", name: "Groceries" }, { id: 40, kind: "income", name: "Salary" }]);
    expect([...ids]).toEqual([[7, 3], [8, 40]]);
    const rows = withCategoryIds(planRestore(backup, { categories: [], keys: {} }).rows, ids);
    expect(rows.cashFlows.map((f) => f.categoryId)).toEqual([3, 3]);
    expect(rows.categoryBudgets[0].categoryId).toBe(3);
    expect(() => withCategoryIds(planRestore(backup, { categories: [], keys: {} }).rows, new Map())).toThrow();
  });
});
