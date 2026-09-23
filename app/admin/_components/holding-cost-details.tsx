"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HoldingCost } from "@/lib/finance/imports/holding-costs";
import { FormSheet } from "./form";
import { NativeAmount } from "./import-controls";
import { useAdminUi } from "./shell";

/** One report per coin across wallets; never repeat a coin-wide cost as a wallet's basis. */
export function BinanceCostDetails({ cost }: { cost: HoldingCost }) {
  const { hidden } = useAdminUi().privacy;
  const single = cost.positionCount === 1 && cost.lines.length === 1 ? cost.lines[0] : null;
  const label = cost.status === "unavailable" ? "Missing history" : cost.status === "partial" ? "Partial estimate" : "FIFO estimate";
  return <div className="flex flex-col gap-1" data-cost-status={cost.status}>
    {single && <NativeAmount value={single.cost} currency={single.currency} crypto />}
    <FormSheet title={`${cost.symbol} cost basis`} description="Spot trade estimates across this coin's Spot and Simple Earn balances."
      trigger={<Button variant="link" size="sm" aria-label={`${cost.symbol} cost basis details`}>{label} · Details</Button>}>
      <div className="group/shell flex flex-col gap-4" data-private={hidden}>
        <div><Badge variant={cost.status === "estimate" ? "outline" : "warning"}>{label}</Badge></div>
        <dl className="grid grid-cols-1 gap-3 text-sm">
          <div><dt className="text-muted-foreground">Current balance across wallets</dt><dd className="font-mono"><NativeAmount value={cost.heldQuantity} currency={cost.symbol} crypto /></dd></div>
          <div><dt className="text-muted-foreground">Remaining units in imported Spot lots</dt><dd className="font-mono"><NativeAmount value={cost.trackedQuantity} currency={cost.symbol} crypto /></dd></div>
        </dl>
        {cost.lines.map((line) => <Card key={line.pair}>
          <CardHeader><CardTitle>{line.pair}</CardTitle></CardHeader>
          <CardContent><dl className="flex flex-col gap-3 text-sm">
            <div><dt className="text-muted-foreground">Remaining trade cost (FIFO)</dt><dd className="font-mono"><NativeAmount value={line.cost} currency={line.currency} crypto /></dd></div>
            <div><dt className="text-muted-foreground">Average cost per {cost.symbol}</dt><dd className="font-mono"><NativeAmount value={line.averageCost} currency={line.currency} crypto /></dd></div>
            <div><dt className="text-muted-foreground">Remaining purchased units</dt><dd className="font-mono"><NativeAmount value={line.quantity} currency={cost.symbol} crypto /></dd></div>
          </dl></CardContent>
        </Card>)}
        {!!cost.reasons.length && <Alert variant="warning"><AlertTitle>What is missing</AlertTitle><AlertDescription>
          <ul className="list-disc space-y-2 pl-4">{cost.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </AlertDescription></Alert>}
        <p className="text-sm text-muted-foreground">FIFO uses the oldest imported purchases first when you sell. Base-coin and quote-coin trading fees are included. Costs stay in the currency you paid; USDT is not labeled as USD.</p>
        <p className="text-sm text-muted-foreground">These trade-only estimates are separate from portfolio cost and profit totals. A matching quantity does not prove every acquisition is covered. Add every pair you traded and the original acquisition records for rewards, Convert, P2P or transferred coins before treating this as your full cost basis.</p>
        <Button asChild variant="outline"><Link href="/admin/history">Review investment history</Link></Button>
      </div>
    </FormSheet>
  </div>;
}
