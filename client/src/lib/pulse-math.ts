/**
 * Client mirror of server/pulse-math.ts.
 *
 * Same rule, same rounding: stale rows — a Yahoo throttle leaves changePercent
 * null — are EXCLUDED from the average rather than coerced to 0, so a partial
 * throttle cannot drag the number toward zero. With no live observations at
 * all the average reads 0.
 *
 * This exists as a copy rather than an import because the Vite root is
 * `client/`, so pulling `server/pulse-math.ts` into the bundle would mean a
 * build-config change. The copy is kept honest by
 * client/src/lib/__tests__/pulse-math.test.ts, which imports BOTH
 * implementations and asserts they agree across a shared table. If you change
 * one, that test fails until you change the other.
 */
export function averageLiveChanges(changes: Array<number | null | undefined>): number {
  const live = changes.filter(
    (c): c is number => typeof c === "number" && Number.isFinite(c),
  );
  if (live.length === 0) return 0;
  return parseFloat((live.reduce((s, v) => s + v, 0) / live.length).toFixed(2));
}

/**
 * Average, or null when nothing live was observed.
 *
 * Pages that render "--" for an unknown average need to tell "no live data"
 * apart from "genuinely flat at 0.00%", which averageLiveChanges deliberately
 * collapses into 0 for the gauge surfaces.
 */
export function averageLiveChangesOrNull(changes: Array<number | null | undefined>): number | null {
  const live = changes.filter(
    (c): c is number => typeof c === "number" && Number.isFinite(c),
  );
  if (live.length === 0) return null;
  return averageLiveChanges(live);
}
