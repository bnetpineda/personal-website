import { describe, expect, test } from "bun:test";
import { carryOver } from "./entry-carry";

const form = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

describe("Add another", () => {
  test("keeps the date, currency, category and account, not the amount or description", () => {
    expect(carryOver(form({ occurredOn: "2026-11-21", currency: "USD", categoryId: "7", account: "GoTyme", amount: "250", description: "Lunch" }))).toEqual({
      occurredOn: "2026-11-21",
      currency: "USD",
      categoryId: 7,
      account: "GoTyme",
    });
  });

  test("blank or malformed fields fall back to the form's own defaults", () => {
    expect(carryOver(form({ occurredOn: "", categoryId: "", account: "  " }))).toEqual({});
    expect(carryOver(form({ occurredOn: "yesterday", categoryId: "x" }))).toEqual({});
  });
});
