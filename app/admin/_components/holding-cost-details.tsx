"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPct, formatQty } from "@/lib/finance/format";
import type { HoldingCost } from "@/lib/finance/imports/holding-costs";
import { FormSheet } from "./form";
import { useAdminUi } from "./shell";
import { TokenAmount } from "./ui";

export function BinanceCostDetails({ cost }: { cost: HoldingCost }) {
  const { hidden } = useAdminUi().privacy;
  const estimate = cost.pnlEstimate;
  return <FormSheet title={cost.symbol} description="Purchase cost and estimated profit / loss."
    trigger={<Button variant="link" size="sm" aria-label={`${cost.symbol} cost and P/L details`}>{cost.symbol}</Button>}>
    <div className="group/shell flex flex-col gap-5" data-private={hidden}>
      {cost.reasons.length > 0 && <ul className="flex flex-col gap-2 text-sm text-muted-foreground">{cost.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      {cost.status === "partial" && <p className="text-sm">Holdings totals skip this estimate until these gaps are closed.</p>}
      {estimate ? <>
        <div><p className="text-sm text-muted-foreground">Estimated unrealized P/L</p><p className="mt-1 font-display text-2xl"><TokenAmount value={estimate.pnl} currency="USDT" signed tone /></p></div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-muted-foreground">Average buy cost</dt><dd className="mt-1 font-mono"><TokenAmount value={estimate.averageCost} currency="USDT" /></dd></div>
          <div><dt className="text-muted-foreground">Cost used</dt><dd className="mt-1 font-mono"><TokenAmount value={estimate.cost} currency="USDT" /></dd></div>
          <div><dt className="text-muted-foreground">Balance</dt><dd className="mt-1 font-mono group-data-[private=true]/shell:blur-sm">{formatQty(cost.heldQuantity)} {cost.symbol}</dd></div>
          <div><dt className="text-muted-foreground">Units with an estimated cost</dt><dd className="mt-1 font-mono group-data-[private=true]/shell:blur-sm">{formatQty(estimate.quantity)} · {formatPct(estimate.coverage)}</dd></div>
        </dl>
        <p className="text-sm text-muted-foreground">Uses the average cost of your remaining recorded Spot purchases. If fewer coins remain in your wallet, their cost is reduced proportionally. Extra units without purchase records are excluded from P/L.</p>
        <p className="text-sm text-muted-foreground">Transfers, rewards, missing trades and fees paid in other coins can change the exact result. PHP figures use current exchange rates.</p>
      </> : <p className="text-sm text-muted-foreground">{cost.lines.length ? "A current price in the purchase currency is needed to estimate P/L." : "No remaining purchase records were found for this balance. Import its original buys to calculate P/L."}</p>}
      <Button asChild variant="outline"><Link href="/admin/history?provider=binance">View purchase history</Link></Button>
    </div>
  </FormSheet>;
}
