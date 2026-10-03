import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PROVIDER_META } from "@/lib/finance/connections/types";
import { monthLabel } from "@/lib/finance/dates";
import type { StatementProvider } from "@/lib/finance/imports/coverage";

export function StatementCoverageNotice({ missing, month, comparisonOnly = false }: { missing: StatementProvider[]; month: string; comparisonOnly?: boolean }) {
  if (!missing.length) return null;
  return (
    <Alert variant="warning" className="mb-6">
      <AlertTitle>{comparisonOnly ? "Comparison unavailable" : "Provisional totals"} · {monthLabel(month, "short")}</AlertTitle>
      <AlertDescription>
        <p>
          {missing.map((p) => PROVIDER_META[p].name).join(" and ")} statement activity does not cover this month.
          {comparisonOnly
            ? " The previous month is incomplete, so its totals cannot be used for this comparison."
            : " Totals reflect recorded entries only. Savings rates and month comparisons stay unavailable until coverage is complete."}
        </p>
        <div className="flex flex-wrap gap-2">
          {missing.map((provider) => (
            <Button key={provider} asChild variant="outline" size="sm">
              <Link href={`/admin/connections#${provider}`}>Import {PROVIDER_META[provider].name} statement</Link>
            </Button>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
