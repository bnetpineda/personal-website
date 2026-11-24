import { describe, expect, test } from "bun:test";
import { compareOptions, countsAsReceipts, eightPercentTax, graduatedTax, projectedYear, quarterlyReceipts, taxDeadlines } from "./tax";

describe("graduated rates (2023 onwards)", () => {
  test("matches the table at each bracket edge", () => {
    expect(graduatedTax(0)).toBe(0);
    expect(graduatedTax(250_000)).toBe(0);
    expect(graduatedTax(400_000)).toBe(22_500);
    expect(graduatedTax(800_000)).toBe(102_500);
    expect(graduatedTax(2_000_000)).toBe(402_500);
    expect(graduatedTax(8_000_000)).toBe(2_202_500);
    expect(graduatedTax(10_000_000)).toBe(2_202_500 + 700_000);
  });

  test("taxes the excess inside a bracket", () => {
    expect(graduatedTax(300_000)).toBe(7_500);
    expect(graduatedTax(-5)).toBe(0);
  });
});

describe("the 8% option", () => {
  test("taxes gross receipts above ₱250,000", () => {
    expect(eightPercentTax(200_000)).toBe(0);
    expect(eightPercentTax(1_000_000)).toBe(60_000);
  });

  test("is compared with graduated rates on 60% of gross plus 3% percentage tax", () => {
    const o = compareOptions(1_000_000);
    expect(o.eightPercent).toBe(60_000);
    expect(o.graduated.taxable).toBe(600_000);
    expect(o.graduated.incomeTax).toBe(62_500);
    expect(o.graduated.percentageTax).toBe(30_000);
    expect(o.better).toBe("eight");
    expect(o.saving).toBe(32_500);
  });

  test("isn't available above ₱3,000,000", () => {
    const o = compareOptions(3_500_000);
    expect(o.eightPercent).toBeNull();
    expect(o.better).toBe("graduated");
  });
});

test("receipts fall into their calendar quarter", () => {
  expect(quarterlyReceipts([
    { occurredOn: "2026-01-05", amountPhp: 100 }, { occurredOn: "2026-03-31", amountPhp: 50 },
    { occurredOn: "2026-04-01", amountPhp: 10 }, { occurredOn: "2026-12-31", amountPhp: 1 },
    { occurredOn: "2025-12-31", amountPhp: 999 },
  ], 2026)).toEqual([150, 10, 0, 1]);
});

describe("deadlines", () => {
  test("1701Q on May 15, Aug 15 and Nov 15; 1701A on April 15 the year after", () => {
    expect(taxDeadlines(2026, [0, 0, 0, 0], "2026-01-10").map((d) => [d.period, d.form, d.dueOn])).toEqual([
      ["Q1", "1701Q", "2026-05-15"], ["Q2", "1701Q", "2026-08-15"], ["Q3", "1701Q", "2026-11-15"], ["Annual", "1701A", "2027-04-15"],
    ]);
  });

  test("each quarter pays tax on the year so far minus what earlier quarters paid", () => {
    const rows = taxDeadlines(2026, [300_000, 300_000, 300_000, 300_000], "2026-08-01");
    expect(rows.map((r) => r.cumulative)).toEqual([300_000, 600_000, 900_000, 1_200_000]);
    expect(rows.map((r) => r.eightPercent)).toEqual([4_000, 24_000, 24_000, 24_000]);
    // Graduated on 60%: 180k → 0; 360k → 16,500; 540k → 50,500; 720k → 86,500.
    expect(rows.map((r) => r.graduated)).toEqual([0, 16_500, 34_000, 36_000]);
  });

  test("marks the next return still to file", () => {
    expect(taxDeadlines(2026, [0, 0, 0, 0], "2026-08-15").map((r) => r.status)).toEqual(["past", "next", "later", "later"]);
    expect(taxDeadlines(2026, [0, 0, 0, 0], "2026-11-16").map((r) => r.status)).toEqual(["past", "past", "past", "next"]);
  });
});

test("the year so far, scaled to a full year", () => {
  expect(projectedYear(100_000, 2026, "2026-07-02")).toBeCloseTo((100_000 * 365) / 183, 6);
  expect(projectedYear(100_000, 2025, "2026-07-02")).toBe(100_000);
});

test("investment income, gifts and refunds aren't business receipts by default; salary is (freelancers file pay there)", () => {
  expect(["Freelance", "Business", "Salary", "Other"].every(countsAsReceipts)).toBe(true);
  expect(["Investment income", "Gifts", "Refunds", "Interest"].some(countsAsReceipts)).toBe(false);
});
