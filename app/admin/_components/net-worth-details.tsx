"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSET_CLASS_META, type AssetClass } from "@/lib/finance/constants";
import { dayRangeLabel } from "@/lib/finance/dates";
import { FormSheet } from "./form";
import { monthEnds } from "./month-ends";
import type { NetWorthPoint } from "./net-worth-history";
import { useAdminUi } from "./shell";
import { Money } from "./ui";


/** A touch and keyboard alternative to the net worth chart, with privacy carried into the portalled sheet. */
export function NetWorthDetails({ points, classes }: { points: NetWorthPoint[]; classes: AssetClass[] }) {
  const { privacy } = useAdminUi();
  const rows = monthEnds(points);
  return (
    <FormSheet
      wide
      title="Net worth by month"
      description="The last saved day of each month in the range on the chart. Asset classes are before debts."
      trigger={<Button variant="ghost" size="sm" aria-label="View net worth details">Details</Button>}
    >
      <div data-private={privacy.hidden} className="group/shell">
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption>Net worth and what it was made of, one row per month.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Day</TableHead>
                <TableHead className="text-right">Net worth</TableHead>
                {classes.map((c) => <TableHead key={c} className="text-right">{ASSET_CLASS_META[c].plural}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.date}>
                  <TableCell>{dayRangeLabel(p.date, p.date)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums"><Money value={p.netWorth} /></TableCell>
                  {classes.map((c) => <TableCell key={c} className="text-right font-mono tabular-nums"><Money value={p.byClass[c] ?? 0} /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </FormSheet>
  );
}
