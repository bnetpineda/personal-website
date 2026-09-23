import { describe, expect, test } from "bun:test";
import { cashFlowSchema, holdingSchema, liabilitySchema, paymentSchema, recurringSchema, restoreCashFlowSchema } from "./schemas";

describe("holdingSchema", () => {
  test("normalizes cash to face value and ignores price fields", () => {
    const r = holdingSchema.parse({
      assetClass: "cash",
      name: "BPI Savings",
      currency: "PHP",
      priceSource: "coingecko",
      quantity: "120,000.50",
      avgCost: "",
      lastPrice: "5",
    });
    expect(r).toMatchObject({ quantity: 120000.5, avgCost: 1, lastPrice: null, priceSource: "manual", priceRef: null });
  });

  test("prefills CoinGecko ids from common symbols", () => {
    const r = holdingSchema.parse({
      assetClass: "crypto",
      name: "Bitcoin",
      symbol: "btc",
      currency: "PHP",
      priceSource: "coingecko",
      quantity: "0.05",
      avgCost: "3000000",
    });
    expect(r).toMatchObject({ symbol: "BTC", priceRef: "bitcoin", lastPrice: null });
  });

  test("Finnhub holdings must be USD and fall back to the symbol as ticker", () => {
    const bad = holdingSchema.safeParse({
      assetClass: "etf",
      name: "Vanguard S&P 500",
      symbol: "voo",
      currency: "PHP",
      priceSource: "finnhub",
      quantity: "3",
      avgCost: "450",
    });
    expect(bad.success).toBe(false);

    const ok = holdingSchema.parse({
      assetClass: "etf",
      name: "Vanguard S&P 500",
      symbol: "voo",
      currency: "USD",
      priceSource: "finnhub",
      quantity: "3",
      avgCost: "450",
    });
    expect(ok.priceRef).toBe("VOO");
  });

  test("blank numbers are errors, not zeros", () => {
    const r = holdingSchema.safeParse({
      assetClass: "stock",
      name: "Jollibee",
      currency: "PHP",
      priceSource: "manual",
      quantity: "",
      avgCost: "",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("quantity");
    }
  });
});

describe("liabilitySchema", () => {
  test("out-of-range due day explains the range", () => {
    const r = liabilitySchema.safeParse({ kind: "loan", name: "Car", balance: "1", currency: "PHP", dueDay: "40" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Use a day from 1 to 31");
  });
});

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

describe("paymentSchema", () => {
  const base = { amount: "5,000", occurredOn: "2026-09-23" };

  test("paying without logging an expense needs no category", () => {
    const r = paymentSchema.parse({ ...base, logExpense: "" });
    expect(r).toMatchObject({ amount: 5000, logExpense: false });
    expect(r.categoryId).toBeUndefined();
  });

  test("logging it as an expense requires a category", () => {
    const missing = paymentSchema.safeParse({ ...base, logExpense: "on", categoryId: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues.map((i) => i.path.join("."))).toEqual(["categoryId"]);
    expect(paymentSchema.parse({ ...base, logExpense: "on", categoryId: "7" })).toMatchObject({ logExpense: true, categoryId: 7 });
  });

  test("rejects a zero payment", () => {
    expect(paymentSchema.safeParse({ ...base, amount: "0", logExpense: "" }).success).toBe(false);
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
