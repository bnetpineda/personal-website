import { describe, expect, test } from "bun:test";
import { cashFlowSchema, holdingSchema, liabilitySchema } from "./schemas";

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
});
