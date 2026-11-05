"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { dashboardMonth } from "@/lib/finance/dashboard";
import { monthLabel } from "@/lib/finance/dates";
import { FormSheet } from "./form";
import { useAdminUi } from "./shell";
import { Money } from "./ui";

/** A touch/keyboard alternative to chart hover, with privacy bridged into the portalled sheet. */
export function CashFlowHistoryDetails({ points, month }: { points: ReturnType<typeof dashboardMonth>[]; month: string }) {
  const { privacy } = useAdminUi();
  const amount = (value: number | null) => value == null ? <span className="text-muted-foreground">No data</span> : <Money value={value} />;
  return (
    <FormSheet wide title="Monthly recorded totals" description="Recorded entries, each converted once at the rate when it was recorded, so these totals don't move. Missing data is never treated as zero."
      trigger={<Button variant="ghost" size="sm" touch aria-label="View monthly cash-flow details">Details</Button>}>
      <div data-private={privacy.hidden} className="group/shell">
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption>Income, spending and net across the 12 months on the chart.</TableCaption>
            <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Income</TableHead><TableHead>Spent</TableHead><TableHead>Net</TableHead></TableRow></TableHeader>
            <TableBody>
              {[...points].reverse().map((p) => (
                <TableRow key={p.month} data-state={p.month === month ? "selected" : undefined}>
                  <TableCell>{monthLabel(p.month, "short")}{(p.income != null || p.expense != null) && <span className="block text-xs text-muted-foreground">{p.incomplete ? "Incomplete" : "Recorded"}</span>}</TableCell>
                  <TableCell className="font-mono tabular-nums">{amount(p.income)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{amount(p.expense)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{amount(p.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </FormSheet>
  );
}
