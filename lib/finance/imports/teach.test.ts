import { describe, expect, test } from "bun:test";
import { autoTeachPicks, closestGuess, teachGroups } from "./teach";

describe("teach once", () => {
  test("groups unsure payments by payee and direction, biggest first, with the model's usual guess", () => {
    const groups = teachGroups([
      { description: "Card Payment: Grok Xai", kind: "expense", amountPhp: 6466.38, occurredOn: "2026-07-14", aiReason: "Jev: Other, closest Subscriptions (60% likely)" },
      { description: "Card Payment: Grok Xai", kind: "expense", amountPhp: 6438.98, occurredOn: "2026-08-13", aiReason: "Jev: Other (47% likely)" },
      { description: "Received money from Romer Martin LLC with reference 806096", kind: "income", amountPhp: 16281.72, occurredOn: "2026-08-05", aiReason: null },
      { description: "Received from Romer Martin LLC", kind: "income", amountPhp: 120134.04, occurredOn: "2026-09-22", aiReason: null },
      { description: "Top Up - Data: All-Net Surf 30", kind: "expense", amountPhp: 29.7, occurredOn: "2026-07-30", aiReason: "Jev: Other, closest Bills & Utilities (75% likely)" },
    ]);
    expect(groups.map(({ payee, kind, count, totalPhp, lastOn, guess }) => ({ payee, kind, count, totalPhp, lastOn, guess }))).toEqual([
      { payee: "Romer Martin LLC", kind: "income", count: 2, totalPhp: 136415.76, lastOn: "2026-09-22", guess: null },
      { payee: "Grok Xai", kind: "expense", count: 2, totalPhp: 12905.36, lastOn: "2026-08-13", guess: "Subscriptions" },
      { payee: "All-Net Surf 30", kind: "expense", count: 1, totalPhp: 29.7, lastOn: "2026-07-30", guess: "Bills & Utilities" },
    ]);
  });

  test("reads the closest category from the model's reason", () => {
    expect(closestGuess("Jev: Other, closest Family & Gifts (55% likely)")).toBe("Family & Gifts");
    expect(closestGuess("Jev: Other (43% likely)")).toBeNull();
  });

  test("skips generic channel lines so they never become blanket payee rules", () => {
    const groups = teachGroups([
      { description: "QR payment", kind: "expense", amountPhp: 4000, occurredOn: "2026-11-09", aiReason: "Jev: Other (71% likely)" },
      { description: "Refund for card payment", kind: "income", amountPhp: 71.61, occurredOn: "2026-11-10", aiReason: "Jev: Other (52% likely)" },
      { description: "Outbound interbank transfer", kind: "expense", amountPhp: 1875, occurredOn: "2026-11-15", aiReason: "Jev: Other, closest Transfer (58% likely)" },
      { description: "Card payment: BLIZZARD *US1066982371", kind: "expense", amountPhp: 961.02, occurredOn: "2026-11-06", aiReason: "Jev: Other, closest Entertainment (69% likely)" },
    ]);
    expect(groups.map((g) => g.payee)).toEqual(["BLIZZARD"]);
  });
});

describe("auto-sorting", () => {
  const categories = [
    { id: 1, name: "Subscriptions", kind: "expense" as const, archived: false },
    { id: 2, name: "Other", kind: "expense" as const, archived: false },
    { id: 3, name: "Old", kind: "expense" as const, archived: true },
    { id: 4, name: "Salary", kind: "income" as const, archived: false },
  ];
  const unsure = (description: string, guess: string | null, amountPhp = 500, kind: "expense" | "income" = "expense") =>
    ({ description, kind, amountPhp, occurredOn: "2026-10-01", aiReason: guess ? `Jev: Other, closest ${guess} (62% likely)` : "Jev: Other (40% likely)" });
  const picks = (entries: ReturnType<typeof unsure>[], declined = new Set<string>()) =>
    autoTeachPicks(teachGroups(entries), categories, declined).map((p) => `${p.group.payee} → ${p.category.name}`);

  test("files a payee once the model guessed the same category three times", () => {
    expect(picks([unsure("Netflix", "Subscriptions"), unsure("Netflix", "Subscriptions")])).toEqual([]);
    expect(picks([unsure("Netflix", "Subscriptions"), unsure("Netflix", "Subscriptions"), unsure("Netflix", "Subscriptions")])).toEqual(["Netflix → Subscriptions"]);
  });

  test("not when its guesses disagree, a payment is large, or it is income", () => {
    expect(picks([...Array(3)].map(() => unsure("Netflix", "Subscriptions")).concat([unsure("Netflix", null), unsure("Netflix", null)]))).toEqual([]);
    expect(picks([unsure("Netflix", "Subscriptions"), unsure("Netflix", "Subscriptions"), unsure("Netflix", "Subscriptions", 5000)])).toEqual([]);
    expect(picks([...Array(3)].map(() => unsure("Acme", "Salary", 500, "income")))).toEqual([]);
  });

  test("not to Other, an archived category, or a payee the person un-did", () => {
    expect(picks([...Array(3)].map(() => unsure("Shop", "Other")))).toEqual([]);
    expect(picks([...Array(3)].map(() => unsure("Shop", "Old")))).toEqual([]);
    expect(picks([...Array(3)].map(() => unsure("Netflix", "Subscriptions")), new Set(["netflix|expense"]))).toEqual([]);
  });
});
