import type { ConnectedPosition, Provider } from "./connections/types";
import { PROVIDER_META } from "./connections/types";

/** A closing balance from an uploaded bank statement. */
export interface StatementBalance { provider: Provider; account: string; currency: string; amount: number; asOf: string }

/** Statement balances as cash positions, so net worth counts bank money the same way as synced cash. */
export function statementPositions(balances: readonly StatementBalance[]): ConnectedPosition[] {
  return balances.filter((b) => b.amount !== 0).map((b) => ({
    id: `${b.provider}:${b.account}:${b.currency}`,
    name: `${PROVIDER_META[b.provider].name} ${b.currency}`,
    symbol: b.currency,
    assetClass: "cash",
    currency: b.currency,
    quantity: b.amount,
    marketValue: b.amount,
    costBasis: b.amount,
  }));
}
