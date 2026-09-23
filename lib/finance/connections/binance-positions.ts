import type { ConnectedPosition, ConnectionSnapshot } from "./types";

export const BINANCE_MISSING_PRICE_WARNING = "Some assets have no supported price pair and are excluded from totals.";

/**
 * Spot may repeat Simple Earn principal as LD-prefixed receipts. Keep the authoritative Earn
 * quantity (including accrued rewards), not the receipt plus the underlying asset. A prefix
 * alone is insufficient: retain priced tokens, unmatched receipts and quantities not covered
 * by the returned Earn positions.
 */
export function removeBinanceEarnReceipts(positions: readonly ConnectedPosition[]): ConnectedPosition[] {
  const earned = new Map<string, number>();
  for (const position of positions) {
    if ((position.id.startsWith("flexible:") || position.id.startsWith("locked:")) && position.quantity > 0) {
      earned.set(position.symbol, (earned.get(position.symbol) ?? 0) + position.quantity);
    }
  }
  return positions.filter((position) => {
    if (!position.symbol.startsWith("LD") || position.id !== `spot:${position.symbol}` || position.marketValue != null || position.quantity <= 0) return true;
    const covered = earned.get(position.symbol.slice(2));
    return covered == null || position.quantity > covered + Math.max(1e-12, covered * 1e-8);
  });
}

/** Also repair older saved snapshots on read, including their obsolete unpriced-receipt warning. */
export function normalizeBinanceSnapshot(snapshot: ConnectionSnapshot): ConnectionSnapshot {
  const positions = removeBinanceEarnReceipts(snapshot.positions);
  if (positions.length === snapshot.positions.length) return snapshot;
  const missingPrice = positions.some((position) => position.marketValue == null);
  return { ...snapshot, positions, warnings: snapshot.warnings.filter((warning) => warning !== BINANCE_MISSING_PRICE_WARNING || missingPrice) };
}
