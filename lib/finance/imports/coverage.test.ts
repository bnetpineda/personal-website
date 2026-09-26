import { describe, expect, test } from "bun:test";
import { statementCoverage } from "./coverage";

describe("statement coverage", () => {
  const at = (iso: string) => new Date(iso);
  test("spans the months with activity and lists the gaps", () => {
    const coverage = statementCoverage([
      { provider: "maribank", month: "2026-05", entries: 3, importedAt: at("2026-09-20T00:00:00Z") },
      { provider: "maribank", month: "2026-02", entries: 5, importedAt: at("2026-09-27T00:00:00Z") },
      { provider: "maribank", month: "2025-12", entries: 2, importedAt: at("2026-09-01T00:00:00Z") },
      { provider: "wise", month: "2026-06", entries: 4, importedAt: null },
    ]);
    expect(coverage.maribank).toEqual({ from: "2025-12", to: "2026-05", entries: 10, importedAt: at("2026-09-27T00:00:00Z"), missing: ["2026-01", "2026-03", "2026-04"] });
    expect(coverage.wise?.missing).toEqual([]);
    expect(coverage.ibkr).toBeUndefined();
  });
});
