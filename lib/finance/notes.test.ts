import { expect, test } from "bun:test";
import { filingNote } from "./notes";

test("tells the importer's notes from the person's own", () => {
  expect(filingNote("Categorized by AI: Fee posted to Fees & charges")).toEqual({ by: "ai", reason: "Fee posted to Fees & charges" });
  expect(filingNote("Taught once: Opencode is Subscriptions.")).toEqual({ by: "taught", reason: "Opencode is Subscriptions." });
  expect(filingNote("Automatically imported; PHP conversion uses the rate at posting.")?.by).toBe("import");
  expect(filingNote("Imported transaction; PHP conversion uses the exchange rate at posting.")?.by).toBe("import");
  expect(filingNote("Lunch with the team")).toBeNull();
  expect(filingNote(null)).toBeNull();
  expect(filingNote("")).toBeNull();
});
