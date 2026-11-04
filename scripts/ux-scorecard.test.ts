import { describe, expect, test } from "bun:test";
import { scoreUx, UX_AREAS, type UxCheck } from "./ux-scorecard";

const passing = (): UxCheck[] => Object.keys(UX_AREAS).flatMap((area) => [1, 2, 3, 4].map((n) => ({
  id: `${area}${n}`, criterion: "Synthetic scoring-engine fixture, not a live UI result", status: "pass" as const, evidence: ["Test fixture only"],
})));

describe("council UX scoring rules", () => {
  test("twenty evidenced passes score ten", () => {
    expect(scoreUx(passing(), [])).toMatchObject({ total: 10, accepted: true });
  });

  test("unverified checks earn no points and remain visible", () => {
    const checks = passing();
    checks.find((c) => c.id === "M3")!.status = "unverified";
    expect(scoreUx(checks, [])).toMatchObject({ total: 9.5, accepted: true, unverified: ["M3"] });
  });

  test("nine is accepted only when the remaining unknowns do not weaken an area or a required check", () => {
    const checks = passing();
    checks.find((c) => c.id === "M3")!.status = "unverified";
    checks.find((c) => c.id === "A3")!.status = "unverified";
    const result = scoreUx(checks, []);
    expect(result).toMatchObject({ total: 9, accepted: true, unverified: ["M3", "A3"], blockingChecks: [] });
    expect(result.areas.every((area) => area.score >= 1.5)).toBe(true);
    expect(scoreUx(checks, ["Privacy regression not reverified"]).accepted).toBe(false);
  });

  test("nine overall is insufficient when an area scores below 1.5", () => {
    const checks = passing();
    checks.find((c) => c.id === "A2")!.status = "fail";
    checks.find((c) => c.id === "A3")!.status = "fail";
    expect(scoreUx(checks, [])).toMatchObject({ total: 9, accepted: false });
  });

  test("a blocker prevents acceptance even at ten", () => {
    expect(scoreUx(passing(), ["Keyboard trap"])).toMatchObject({ total: 10, accepted: false });
  });

  test("an unverified critical financial check blocks acceptance even at 9.5", () => {
    const checks = passing();
    checks.find((c) => c.id === "D1")!.status = "unverified";
    expect(scoreUx(checks, [])).toMatchObject({ total: 9.5, accepted: false, blockingChecks: ["D1"] });
  });

  test("a claimed pass requires evidence", () => {
    const checks = passing();
    checks[0].evidence = [];
    expect(() => scoreUx(checks, [])).toThrow("cannot pass without evidence");
  });

  test("omitted or duplicated checks cannot inflate the score", () => {
    expect(() => scoreUx(passing().slice(1), [])).toThrow("exactly once");
    const checks = passing();
    checks[0].id = checks[1].id;
    expect(() => scoreUx(checks, [])).toThrow("exactly once");
  });
});
