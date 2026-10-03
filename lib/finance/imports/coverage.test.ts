import { describe, expect, test } from "bun:test";
import { missingBalanceProviders, missingStatementProviders, statementCoverage } from "./coverage";

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

describe("dashboard data coverage", () => {
  const coverage = statementCoverage([
    { provider: "wise", month: "2026-09", entries: 7, importedAt: null },
    { provider: "maribank", month: "2026-06", entries: 5, importedAt: null },
    { provider: "maribank", month: "2026-08", entries: 8, importedAt: null },
  ]);

  test("missing September spending prevents a complete savings-rate claim", () => {
    expect(missingStatementProviders(coverage, "2026-09")).toEqual(["maribank"]);
    expect(missingStatementProviders(coverage, "2026-10")).toEqual(["wise", "maribank"]);
  });

  test("detects internal gaps and months before tracking began", () => {
    expect(missingStatementProviders(coverage, "2026-07")).toEqual(["wise", "maribank"]);
    expect(missingStatementProviders({ maribank: coverage.maribank }, "2026-08")).toEqual([]);
    expect(missingStatementProviders({}, "2026-09")).toEqual([]);
  });

  test("current activity does not imply a bank balance is included", () => {
    expect(missingBalanceProviders(coverage, [])).toEqual(["wise", "maribank"]);
    expect(missingBalanceProviders(coverage, [{ provider: "wise", account: "main", currency: "PHP", amount: 0, asOf: "2026-09-30" }])).toEqual(["maribank"]);
    expect(missingBalanceProviders({}, [])).toEqual([]);
  });
});
