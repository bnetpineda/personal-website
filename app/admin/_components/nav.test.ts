import { describe, expect, test } from "bun:test";
import { dashboardCategoryFilter, dashboardHref, dashboardMonthHref, exportCsvHref, isNavActive, nextMonthWithin, openingMonth } from "./nav";

describe("dashboard navigation", () => {
  test("month navigation exits all-time search without dropping the shared filters", () => {
    const href = dashboardMonthHref({ q: "Client & salary", kind: "income", category: 7 }, "2026-09");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("month")).toBe("2026-09");
    expect(url.searchParams.get("kind")).toBe("income");
    expect(url.searchParams.get("category")).toBe("7");
    expect(url.searchParams.has("q")).toBe(false);
  });

  test("month navigation clears the search filters too", () => {
    const href = dashboardMonthHref({ from: "2026-01-01", to: "2026-02-01", min: 100, max: 900, account: "GoTyme", page: 3, kind: "expense" }, "2026-09");
    expect(href).toBe("/admin?kind=expense&month=2026-09");
  });

  test("the CSV export carries the list's filters, not the page or the add sheet", () => {
    expect(exportCsvHref({ month: "2026-09", kind: "expense", category: 4, page: 2, add: "expense" })).toBe("/admin/export/csv?kind=expense&category=4&month=2026-09");
    expect(exportCsvHref({ q: "grab", min: 0, account: "GoTyme" })).toBe("/admin/export/csv?q=grab&min=0&account=GoTyme");
    expect(exportCsvHref({})).toBe("/admin/export/csv");
  });

  test("choosing this month keeps it in the URL, so it isn't redirected to an older month", () => {
    expect(dashboardMonthHref({ month: "2026-09", q: "salary" }, "2026-11")).toBe("/admin?month=2026-11");
  });

  test("opening goes to the latest month with both income and spending, not one with only a few fees", () => {
    const both = (month: string) => [{ month, kind: "income" as const }, { month, kind: "expense" as const }];
    const fees = (month: string) => [{ month, kind: "expense" as const }];
    expect(openingMonth([...both("2026-09"), ...fees("2026-10")], "2026-11")).toBe("2026-09");
    expect(openingMonth([...both("2026-09"), ...fees("2026-11")], "2026-11")).toBe("2026-09");
    // This month stays once it answers the question.
    expect(openingMonth([...both("2026-09"), ...both("2026-11")], "2026-11")).toBeNull();
    // With no complete month anywhere, any records beat none.
    expect(openingMonth(fees("2026-10"), "2026-11")).toBe("2026-10");
    expect(openingMonth(fees("2026-11"), "2026-11")).toBeNull();
    expect(openingMonth([], "2026-11")).toBeNull();
    // A future-dated entry isn't a reason to open in the future.
    expect(openingMonth([...both("2026-10"), ...both("2026-12")], "2026-11")).toBe("2026-10");
  });

  test("Earnings, History and Goals count as Portfolio; Categories counts as the Overview", () => {
    expect(isNavActive("/admin/holdings", "/admin/earnings")).toBe(true);
    expect(isNavActive("/admin/holdings", "/admin/history")).toBe(true);
    expect(isNavActive("/admin/connections", "/admin/connections/activity")).toBe(true);
    expect(isNavActive("/admin/connections", "/admin/connectionsx")).toBe(false);
    expect(isNavActive("/admin/holdings", "/admin/goals")).toBe(true);
    // Categories is opened from the Overview, so the Overview stays lit there (but isn't "the page").
    expect(isNavActive("/admin", "/admin/categories")).toBe(true);
    expect(isNavActive("/admin", "/admin/categories", { exact: true })).toBe(false);
    expect(isNavActive("/admin/connections", "/admin/categories")).toBe(false);
    expect(isNavActive("/admin", "/admin")).toBe(true);
    expect(isNavActive("/admin/recurring", "/admin/holdings")).toBe(false);
  });

  test("the next-month arrow stops at this month", () => {
    expect(nextMonthWithin("2026-10", "2026-11")).toBe("2026-11");
    expect(nextMonthWithin("2025-12", "2026-11")).toBe("2026-01");
    expect(nextMonthWithin("2026-11", "2026-11")).toBeNull();
    // A future month opened from an old link still can't go further out.
    expect(nextMonthWithin("2026-12", "2026-11")).toBeNull();
  });

  test("a category filter toggles without touching the type filter, so clearing it restores what was on", () => {
    expect(dashboardCategoryFilter(null, { id: 7 })).toEqual({ category: 7 });
    expect(dashboardCategoryFilter(7, { id: 7 })).toEqual({ category: null });
    expect(dashboardCategoryFilter(7, { id: 9 })).toEqual({ category: 9 });
  });

  test("search terms are encoded and empty filters are omitted", () => {
    const href = dashboardHref({ q: "A&B + groceries", category: null, kind: "", month: null });
    expect(new URL(href, "https://example.test").searchParams.get("q")).toBe("A&B + groceries");
    expect(href).not.toContain("category");
    expect(href).not.toContain("kind");
  });
});
