import type { MonthPoint } from "./calc";
import type { Provider } from "./connections/types";
import { missingStatementProviders, type StatementCoverage } from "./imports/coverage";

/** Recorded amounts are not a complete month's totals while statements are missing. */
export function dashboardMonth(point: MonthPoint, coverage: Partial<Record<Provider, StatementCoverage>>, current: string) {
  const missing = missingStatementProviders(coverage, point.month);
  const incomplete = missing.length > 0 || point.month > current;
  // A zero-filled gap is unknown, not evidence that nothing was earned or spent.
  const income = incomplete && point.income === 0 ? null : point.income;
  const expense = incomplete && point.expense === 0 ? null : point.expense;
  return {
    month: point.month,
    income,
    expense,
    // Do not turn one known side and one unknown side into an apparent surplus or deficit.
    net: income == null || expense == null ? null : point.net,
    incomplete,
    missing,
  };
}
