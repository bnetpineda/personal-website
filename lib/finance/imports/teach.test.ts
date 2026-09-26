import { describe, expect, test } from "bun:test";
import { closestGuess, teachGroups } from "./teach";

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
});
