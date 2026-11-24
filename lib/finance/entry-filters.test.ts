import { describe, expect, test } from "bun:test";
import { csvCell, entriesCsv, entryFilterParams, filterDatesLabel, isSearching, parseEntryFilters, searchPage } from "./entry-filters";

describe("entry filters", () => {
  test("reads dates, amounts and the account from the URL", () => {
    expect(parseEntryFilters({ q: " grab ", from: "2026-01-01", to: "2026-03-31", min: "1,000", max: "₱5000", account: "GoTyme" })).toEqual({
      q: "grab", from: "2026-01-01", to: "2026-03-31", min: 1000, max: 5000, account: "GoTyme",
    });
  });

  test("drops what isn't valid and swaps reversed ranges", () => {
    expect(parseEntryFilters({ from: "2026-13-01", to: "yesterday", min: "-5", max: "abc" })).toEqual({ q: "", from: null, to: null, min: null, max: null, account: null });
    const f = parseEntryFilters({ from: "2026-05-01", to: "2026-02-01", min: "900", max: "100" });
    expect([f.from, f.to, f.min, f.max]).toEqual(["2026-02-01", "2026-05-01", 100, 900]);
  });

  test("any filter turns the month into a search across all months", () => {
    expect(isSearching(parseEntryFilters({}))).toBe(false);
    expect(isSearching(parseEntryFilters({ min: "0" }))).toBe(true);
    expect(isSearching(parseEntryFilters({ account: "BPI" }))).toBe(true);
  });

  test("round-trips to URL params, blanks left out", () => {
    expect(entryFilterParams(parseEntryFilters({ q: "x", min: "0", account: "" }))).toEqual({ q: "x", min: "0" });
  });

  test("names the date filter in words", () => {
    expect(filterDatesLabel({ from: null, to: null })).toBeNull();
    expect(filterDatesLabel({ from: "2026-01-02", to: null })).toBe("from Fri, Jan 2, 2026");
    expect(filterDatesLabel({ from: null, to: "2026-03-31" })).toBe("until Tue, Mar 31, 2026");
    expect(filterDatesLabel({ from: "2026-01-01", to: "2026-03-31" })).toContain("2026");
  });

  test("the page stays between 1 and 25", () => {
    expect(searchPage({})).toBe(1);
    expect(searchPage({ page: "3" })).toBe(3);
    expect(searchPage({ page: "999" })).toBe(25);
    expect(searchPage({ page: "-2" })).toBe(1);
  });
});

describe("CSV", () => {
  test("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Jollibee, "Big" meal')).toBe('"Jollibee, ""Big"" meal"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
  });

  test("text that a spreadsheet would run as a formula is neutralized; numbers aren't", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-120.00", false)).toBe("-120.00");
  });

  test("spending is negative so the column adds up to the net", () => {
    const csv = entriesCsv([
      { occurredOn: "2026-11-02", kind: "expense", description: "Grab", categoryName: "Transport", account: "GoTyme", amount: 250, currency: "PHP", amountPhp: 250, notes: null },
      { occurredOn: "2026-11-01", kind: "income", description: "Client", categoryName: "Freelance", account: null, amount: 100, currency: "USD", amountPhp: 5800.5, notes: "Nov" },
    ]);
    expect(csv.split("\r\n")).toEqual([
      "Date,Type,Description,Category,Account,Amount,Currency,Amount (PHP),Notes",
      "2026-11-02,Spending,Grab,Transport,GoTyme,-250.00,PHP,-250.00,",
      "2026-11-01,Income,Client,Freelance,,100.00,USD,5800.50,Nov",
      "",
    ]);
  });
});
