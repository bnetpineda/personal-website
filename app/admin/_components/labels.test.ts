import { describe, expect, test } from "bun:test";
import { ENTRY_KINDS, ENTRY_STATUSES } from "@/lib/finance/imports/types";
import { TERMS, entryKindLabel, entryStatusLabel, staleLabel } from "./labels";

describe("shared admin wording", () => {
  test("every stored kind and status has plain words, never the raw value", () => {
    for (const kind of [...ENTRY_KINDS, "income", "expense"]) {
      const label = entryKindLabel(kind);
      expect(label).not.toBe(kind);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
    for (const status of ENTRY_STATUSES) expect(entryStatusLabel(status)).not.toBe(status);
  });

  test("money out is Spending everywhere", () => {
    expect(entryKindLabel("expense")).toBe(TERMS.spending);
  });

  test("an unexpected value is capitalised and spaced, not shown as stored", () => {
    expect(entryKindLabel("staking_reward")).toBe("Staking reward");
    expect(entryStatusLabel("on-hold")).toBe("On hold");
  });

  test("a stale hand-entered value has one name per kind on every page", () => {
    expect(staleLabel("holding")).toBe("Value due");
    expect(staleLabel("debt")).toBe("Balance due");
  });
});
