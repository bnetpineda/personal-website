import { describe, expect, test } from "bun:test";
import { dashboardCategoryFilter, dashboardHref, dashboardMonthHref } from "./nav";

describe("dashboard navigation", () => {
  test("month navigation exits all-time search without dropping the shared filters", () => {
    const href = dashboardMonthHref({ q: "Client & salary", kind: "income", category: 7 }, "2026-09", "2026-11");
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.get("month")).toBe("2026-09");
    expect(url.searchParams.get("kind")).toBe("income");
    expect(url.searchParams.get("category")).toBe("7");
    expect(url.searchParams.has("q")).toBe(false);
  });

  test("returning to this month removes both month and search", () => {
    expect(dashboardMonthHref({ month: "2026-09", q: "salary" }, "2026-11", "2026-11")).toBe("/admin");
  });

  test("category selection and deselection both retain its type", () => {
    expect(dashboardCategoryFilter(null, { id: 7, kind: "income" })).toEqual({ kind: "income", category: 7 });
    expect(dashboardCategoryFilter(7, { id: 7, kind: "income" })).toEqual({ kind: "income", category: null });
    expect(dashboardCategoryFilter(7, { id: 9, kind: "expense" })).toEqual({ kind: "expense", category: 9 });
  });

  test("search terms are encoded and empty filters are omitted", () => {
    const href = dashboardHref({ q: "A&B + groceries", category: null, kind: "", month: null });
    expect(new URL(href, "https://example.test").searchParams.get("q")).toBe("A&B + groceries");
    expect(href).not.toContain("category");
    expect(href).not.toContain("kind");
  });
});
