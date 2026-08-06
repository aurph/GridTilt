/**
 * Average the live (finite) percentage changes in a set of tickers.
 *
 * Stale rows — a Yahoo throttle leaves changePercent null — are excluded
 * entirely rather than coerced to 0, so a partial throttle doesn't pull the
 * average toward zero. With no live observations at all the average reads 0.
 *
 * Shared by /api/sector-pulse and /api/supply-chain so the two surfaces can
 * never disagree on this rule again.
 */
export function averageLiveChanges(changes: Array<number | null | undefined>): number {
  const live = changes.filter(
    (c): c is number => typeof c === "number" && Number.isFinite(c),
  );
  if (live.length === 0) return 0;
  return parseFloat((live.reduce((s, v) => s + v, 0) / live.length).toFixed(2));
}
