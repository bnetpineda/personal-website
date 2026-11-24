import { describe, expect, test } from "bun:test";
import { changedPortfolioRows } from "./portfolio";

const row = { provider: "binance" as const, snapshotDate: "2026-09-24", valueUsd: 100, costUsd: 80, pnlUsd: 20, source: "balances" as const };

describe("portfolio rows a Holdings view writes", () => {
  test("nothing when today's saved point already has the same numbers", () => {
    expect(changedPortfolioRows([row], [row])).toEqual([]);
    expect(changedPortfolioRows([{ ...row, costUsd: null, pnlUsd: null }], [{ ...row, costUsd: null, pnlUsd: null }])).toEqual([]);
  });

  test("a new day, new numbers or a NAV fill the balances replace", () => {
    expect(changedPortfolioRows([row], [])).toEqual([row]);
    expect(changedPortfolioRows([row], [{ ...row, snapshotDate: "2026-09-23" }])).toEqual([row]);
    expect(changedPortfolioRows([row], [{ ...row, valueUsd: 99.99 }])).toEqual([row]);
    expect(changedPortfolioRows([row], [{ ...row, pnlUsd: null }])).toEqual([row]);
    expect(changedPortfolioRows([row], [{ ...row, source: "nav" }])).toEqual([row]);
    expect(changedPortfolioRows([row], [{ ...row, provider: "ibkr" }])).toEqual([row]);
  });
});
