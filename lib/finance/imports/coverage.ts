import type { Provider } from "../connections/types";
import { addMonths } from "../dates";
import type { StatementBalance } from "../statement-balances";

export const STATEMENT_PROVIDERS = ["wise", "maribank"] as const;
export type StatementProvider = (typeof STATEMENT_PROVIDERS)[number];

export interface StatementCoverage {
  /** First and last month with imported activity ("YYYY-MM"). */
  from: string;
  to: string;
  entries: number;
  importedAt: Date;
  /** Months between `from` and `to` with nothing imported: usually a statement not uploaded yet. */
  missing: string[];
}

/** Only banks already used in imports can leave a gap in the tracked cash flow. */
export function missingStatementProviders(coverage: Partial<Record<Provider, StatementCoverage>>, month: string): StatementProvider[] {
  return STATEMENT_PROVIDERS.filter((provider) => {
    const bank = coverage[provider];
    return bank != null && (month < bank.from || month > bank.to || bank.missing.includes(month));
  });
}

/** An imported bank with no closing balance is omitted from tracked net worth, including when its activity is current. */
export function missingBalanceProviders(coverage: Partial<Record<Provider, StatementCoverage>>, balances: readonly StatementBalance[]): StatementProvider[] {
  return STATEMENT_PROVIDERS.filter((provider) => coverage[provider] != null && !balances.some((b) => b.provider === provider));
}

type MonthRow = { provider: Provider; month: string; entries: number; importedAt: Date | null };

export function statementCoverage(rows: MonthRow[]): Partial<Record<Provider, StatementCoverage>> {
  const out: Partial<Record<Provider, StatementCoverage>> = {};
  for (const provider of new Set(rows.map((r) => r.provider))) {
    const mine = rows.filter((r) => r.provider === provider).sort((a, b) => a.month.localeCompare(b.month));
    const months = new Set(mine.map((r) => r.month));
    const from = mine[0].month, to = mine.at(-1)!.month;
    const missing: string[] = [];
    for (let m = addMonths(from, 1); m < to && missing.length < 24; m = addMonths(m, 1)) if (!months.has(m)) missing.push(m);
    out[provider] = {
      from, to, missing,
      entries: mine.reduce((sum, r) => sum + Number(r.entries), 0),
      importedAt: new Date(Math.max(...mine.map((r) => r.importedAt?.getTime() ?? 0))),
    };
  }
  return out;
}
