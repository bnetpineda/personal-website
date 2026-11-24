import { describe, expect, test } from "bun:test";
import type { ConnectedPosition } from "./connections/types";
import { amountInUsd, combineReturns, marketReturn, returnBase, unitPricesUsd } from "./returns";

const fx = { USD: 56, EUR: 61 };
const position = (p: Partial<ConnectedPosition>): ConnectedPosition => ({
  id: p.symbol ?? "x", name: p.symbol ?? "x", symbol: "BTC", assetClass: "crypto", currency: "USD", quantity: 1, marketValue: 100, costBasis: null, ...p,
});

describe("market return", () => {
  test("a deposit is not a gain", () => {
    const r = marketReturn({ date: "2026-10-01", value: 1000 }, { date: "2026-10-31", value: 1500 }, [{ date: "2026-10-16", value: 500 }]);
    expect(r.change).toBe(500);
    expect(r.flows).toBe(500);
    expect(r.market).toBe(0);
    expect(r.pct).toBe(0);
  });

  test("a withdrawal is not a loss, and the return is measured on what stayed invested", () => {
    const r = marketReturn({ date: "2026-10-01", value: 1000 }, { date: "2026-10-31", value: 600 }, [{ date: "2026-10-31", value: -500 }]);
    expect(r.market).toBe(100);
    // Taken out on the last day: the whole 1000 was invested for the whole period.
    expect(r.pct).toBeCloseTo(0.1);
  });

  test("a transfer on the starting day is already in the starting balance", () => {
    const r = marketReturn({ date: "2026-10-01", value: 1500 }, { date: "2026-10-31", value: 1650 }, [{ date: "2026-10-01", value: 500 }]);
    expect(r.flows).toBe(0);
    expect(r.market).toBe(150);
  });

  test("combined accounts weigh by their own base", () => {
    const a = { start: { date: "2026-10-01", value: 1000 }, end: { date: "2026-10-31", value: 1100 } };
    const b = { start: { date: "2026-10-01", value: 3000 }, end: { date: "2026-10-31", value: 3000 } };
    const combined = combineReturns([a, b].map((x) => ({ result: marketReturn(x.start, x.end, []), base: returnBase(x.start, x.end, []) })))!;
    expect(combined.market).toBe(100);
    expect(combined.pct).toBeCloseTo(0.025);
  });

  test("nothing invested has no percentage", () => {
    expect(marketReturn({ date: "2026-10-01", value: 0 }, { date: "2026-10-31", value: 0 }, []).pct).toBeNull();
  });
});

describe("valuing transfers and rewards", () => {
  test("coins are priced from the accounts' own balances, the largest holding first", () => {
    const prices = unitPricesUsd([position({ quantity: 2, marketValue: 120000 }), position({ id: "dust", quantity: 0.001, marketValue: 1 })], fx);
    expect(prices.get("BTC")).toBe(60000);
  });

  test("a leveraged perp never sets a coin's price; borrowed and vault rows are ignored too", () => {
    // 0.05 BTC spot worth $3,000 next to a 10x long of 1 BTC carried at $6,200 (margin plus P/L).
    const prices = unitPricesUsd([
      position({ id: "spot:BTC", quantity: 0.05, marketValue: 3000 }),
      position({ id: "perp:BTC", quantity: 1, marketValue: 6200 }),
      position({ id: "borrow:0", quantity: -100, marketValue: -100, symbol: "USDC" }),
      position({ id: "vault:0xabc", quantity: 500, marketValue: 500, symbol: "VAULT", assetClass: "fund" }),
    ], fx);
    expect(prices.get("BTC")).toBe(60000);
    expect(prices.has("USDC")).toBe(false);
    expect(amountInUsd(0.1, "BTC", prices, fx)).toBe(6000);
  });

  test("a perp alone leaves the coin unpriced", () => {
    expect(unitPricesUsd([position({ id: "perp:ETH", symbol: "ETH", quantity: 2, marketValue: 900 })], fx).has("ETH")).toBe(false);
  });

  test("fiat converts through the rate table and stablecoins are a dollar without a holding", () => {
    expect(amountInUsd(61, "EUR", new Map(), fx)).toBeCloseTo(66.0, 0);
    expect(amountInUsd(5, "USDC", new Map(), fx)).toBe(5);
    expect(amountInUsd(1, "DOGE", new Map(), fx)).toBeNull();
  });
});
