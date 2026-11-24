import { describe, expect, test } from "bun:test";
import { datedPairs, FX_STALE_MS, missingRanges, rateOn, ratesToFetch } from "./fx-history";

describe("ratesToFetch", () => {
  const now = new Date("2026-11-20T00:00:00Z");
  const saved = [
    { currency: "USD", updatedAt: new Date(now.getTime() - 60 * 60 * 1000) },
    { currency: "JPY", updatedAt: new Date("2025-11-20T00:00:00Z") },
  ];

  test("fetches missing and stale rates, never PHP", () => {
    expect(ratesToFetch(["USD", "JPY", "EUR", "PHP", "JPY"], saved, now)).toEqual(["JPY", "EUR"]);
  });

  test("a rate fetched just inside the window is kept", () => {
    expect(ratesToFetch(["USD"], [{ currency: "USD", updatedAt: new Date(now.getTime() - FX_STALE_MS + 1000) }], now)).toEqual([]);
  });
});

describe("dated rates", () => {
  const today = "2026-11-20";
  const history = [
    { currency: "USD", on: "2026-10-30", rate: 58.1 },
    { currency: "USD", on: "2026-11-02", rate: 58.4 },
    { currency: "EUR", on: "2026-11-02", rate: 63 },
  ];

  test("recent days and PHP use the current rate", () => {
    expect(datedPairs([{ currency: "USD", on: "2026-11-19" }, { currency: "PHP", on: "2026-01-01" }, { currency: "USD", on: "2026-11-01" },
      { currency: "USD", on: "2026-11-01" }], today)).toEqual([{ currency: "USD", on: "2026-11-01" }]);
  });

  test("a day uses the latest rate published on or before it, within a week", () => {
    expect(rateOn(history, "USD", "2026-11-02")).toBe(58.4);
    expect(rateOn(history, "USD", "2026-11-01")).toBe(58.1);
    expect(rateOn(history, "USD", "2026-11-09")).toBe(58.4);
    expect(rateOn(history, "USD", "2026-11-10")).toBeNull();
    expect(rateOn(history, "USD", "2026-10-29")).toBeNull();
    expect(rateOn(history, "JPY", "2026-11-02")).toBeNull();
  });

  test("one fetch range per currency covers every day without a saved rate", () => {
    const ranges = missingRanges([{ currency: "USD", on: "2026-11-01" }, { currency: "USD", on: "2026-11-15" }, { currency: "USD", on: "2026-10-01" },
      { currency: "JPY", on: "2026-11-03" }], history);
    expect(Object.fromEntries(ranges)).toEqual({ USD: { from: "2026-09-24", to: "2026-11-15" }, JPY: { from: "2026-10-27", to: "2026-11-03" } });
  });
});
