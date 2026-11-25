import { describe, expect, test } from "bun:test";
import { accountCurrency, guessEntry, typicalAmount, type EntryHint } from "./entry-guess";

const hint = (description: string, categoryId: number, extra: Partial<EntryHint> = {}): EntryHint =>
  ({ description, categoryId, account: null, currency: "PHP", amount: null, ...extra });

const hints: EntryHint[] = [
  hint("Jollibee", 1, { account: "GCash", amount: 189 }),
  hint("Grocery at SM", 2, { account: "Maya" }),
  hint("Grocery at Puregold", 2),
  hint("Gym membership", 3, { account: "Wise USD", currency: "USD", amount: 30 }),
  hint("Gas", 4),
  hint("Gaming", 5),
  hint("grab", 6, { rule: true, currency: null }),
  hint("grab food", 1, { rule: true, currency: null }),
];

describe("guessEntry", () => {
  test("a past description, in any case or spacing", () => {
    expect(guessEntry("  JOLLIBEE ", hints)?.categoryId).toBe(1);
  });

  test("the same payee written differently", () => {
    expect(guessEntry("Jollibee 2", hints)?.description).toBe("Jollibee");
  });

  test("the start of past descriptions, only when they agree on a category", () => {
    expect(guessEntry("Groc", hints)?.categoryId).toBe(2);
    expect(guessEntry("Ga", hints)).toBeNull();
    expect(guessEntry("Gam", hints)?.categoryId).toBe(5);
  });

  test("a rule for a payee typed for the first time; the most specific rule wins", () => {
    expect(guessEntry("Grab ride to BGC", hints)?.categoryId).toBe(6);
    expect(guessEntry("Grab Food order", hints)?.categoryId).toBe(1);
  });

  test("rules are never offered as a past entry, and nothing is guessed from one letter", () => {
    expect(guessEntry("grab", hints)?.rule).toBe(true);
    expect(guessEntry("j", hints)).toBeNull();
    expect(guessEntry("Something new", hints)).toBeNull();
  });
});

describe("typicalAmount", () => {
  test("the median of amounts that agree", () => {
    expect(typicalAmount([189, 189, 199])).toBe(189);
    expect(typicalAmount([30, 30])).toBe(30);
  });

  test("nothing for one purchase or amounts that vary", () => {
    expect(typicalAmount([189])).toBeNull();
    expect(typicalAmount([850, 2300, 1400])).toBeNull();
    expect(typicalAmount([])).toBeNull();
  });
});

describe("accountCurrency", () => {
  test("the currency last used with an account", () => {
    expect(accountCurrency("wise usd", hints)).toBe("USD");
    expect(accountCurrency("GCash", hints)).toBe("PHP");
    expect(accountCurrency("BPI", hints)).toBeNull();
    expect(accountCurrency(" ", hints)).toBeNull();
  });
});
