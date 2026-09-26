import { describe, expect, test } from "bun:test";
import { cashFlowSchema, recurringSchema, restoreCashFlowSchema } from "./schemas";

describe("cashFlowSchema", () => {
  test("parses a typical expense", () => {
    const r = cashFlowSchema.parse({
      kind: "expense",
      occurredOn: "2026-09-19",
      amount: "1,250.75",
      currency: "PHP",
      categoryId: "3",
      description: " Groceries at SM ",
      account: "",
    });
    expect(r).toMatchObject({ amount: 1250.75, categoryId: 3, description: "Groceries at SM", account: undefined });
  });

  test("rejects zero amounts, missing categories and impossible dates", () => {
    const r = cashFlowSchema.safeParse({
      kind: "expense",
      occurredOn: "2026-02-30",
      amount: "0",
      currency: "PHP",
      categoryId: "",
      description: "x",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = new Set(r.error.issues.map((i) => i.path.join(".")));
      expect([...paths].sort()).toEqual(["amount", "categoryId", "occurredOn"]);
    }
  });

  test("description is optional (the action falls back to the category name)", () => {
    const r = cashFlowSchema.parse({ kind: "expense", occurredOn: "2026-09-19", amount: "85", currency: "PHP", categoryId: "3", description: "  " });
    expect(r.description).toBeUndefined();
  });
});

describe("restoreCashFlowSchema", () => {
  const row = {
    id: "0b6f3c4e-8d2a-4f7e-9c1b-2a3d4e5f6a7b",
    kind: "expense",
    occurredOn: "2026-09-19",
    amount: 250,
    currency: "PHP",
    amountPhp: 250,
    categoryId: 3,
    description: "Lunch",
    account: null,
    notes: null,
    recurringId: null,
    recurringOn: null,
    liabilityId: null,
  };

  test("accepts a deleted row as returned by deleteCashFlow", () => {
    expect(restoreCashFlowSchema.parse(row)).toEqual(row as never);
  });

  test("rejects tampered values", () => {
    expect(restoreCashFlowSchema.safeParse({ ...row, amount: -1 }).success).toBe(false);
    expect(restoreCashFlowSchema.safeParse({ ...row, id: "nope" }).success).toBe(false);
    expect(restoreCashFlowSchema.safeParse({ ...row, currency: "php" }).success).toBe(false);
  });
});

describe("recurringSchema", () => {
  const base = { kind: "expense", amount: "549", currency: "PHP", categoryId: "3", description: "Netflix", frequency: "monthly", startOn: "2026-09-15" };

  test("defaults to auto-posting with no end and no second day", () => {
    const r = recurringSchema.parse(base);
    expect(r).toMatchObject({ amount: 549, autoPost: true, endOn: null, secondDay: null });
  });

  test("twice a month fills in the second day 15 days apart", () => {
    expect(recurringSchema.parse({ ...base, frequency: "semimonthly", secondDay: "auto" }).secondDay).toBe(30);
    expect(recurringSchema.parse({ ...base, frequency: "semimonthly", secondDay: "31" }).secondDay).toBe(31);
    expect(recurringSchema.safeParse({ ...base, frequency: "semimonthly", secondDay: "15" }).success).toBe(false);
  });

  test("confirm mode, and an end date before the start is rejected", () => {
    expect(recurringSchema.parse({ ...base, posting: "confirm" }).autoPost).toBe(false);
    expect(recurringSchema.safeParse({ ...base, endOn: "2026-09-01" }).success).toBe(false);
    expect(recurringSchema.parse({ ...base, endOn: "" }).endOn).toBeNull();
  });
});
