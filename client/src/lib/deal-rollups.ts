/**
 * Reads /api/deals/metrics on surfaces other than the Deals page, so deal totals
 * are quoted from one place.
 *
 * The Overview's nuclear KPI was hardcoded and disagreed with the served data
 * three ways: headline 12+ GW, named companies 10.3 GW, computeDealMetrics
 * 15.5 GW. It also gave Microsoft 1.2 GW where the queue says 835 MW, and counted
 * Meta's 6.6 GW RFP, a request rather than a contract, as committed.
 */

export interface BucketLite {
  key: string;
  count: number;
  mw: number;
}

export interface DealRowLite {
  type: string;
  /** Normalised buyer name. */
  offtaker: string;
  capacityMW: number;
}

/**
 * Bucket for one generation type. Null when the payload has not arrived or has no
 * deals of that type, so callers render a placeholder rather than zero capacity.
 */
export function bucketFor(
  byType: BucketLite[] | undefined | null,
  key: string,
): BucketLite | null {
  if (!Array.isArray(byType)) return null;
  const found = byType.find((b) => b.key === key);
  return found && Number.isFinite(found.mw) ? found : null;
}

/** Buyers of one generation type, largest first. Empty when nothing matches. */
export function buyersForType(
  rows: DealRowLite[] | undefined | null,
  type: string,
): Array<{ buyer: string; mw: number }> {
  if (!Array.isArray(rows)) return [];
  const totals = new Map<string, number>();
  const order: string[] = [];
  for (const r of rows) {
    if (r.type !== type) continue;
    const mw = Number.isFinite(r.capacityMW) ? r.capacityMW : 0;
    if (!totals.has(r.offtaker)) order.push(r.offtaker);
    totals.set(r.offtaker, (totals.get(r.offtaker) ?? 0) + mw);
  }
  return order
    .map((buyer) => ({ buyer, mw: totals.get(buyer) as number }))
    .sort((a, b) => b.mw - a.mw || a.buyer.localeCompare(b.buyer));
}

/** Megawatts as gigawatts for display. Null in, null out. */
export function asGW(mw: number | null | undefined, digits = 1): string | null {
  if (typeof mw !== "number" || !Number.isFinite(mw) || mw <= 0) return null;
  return (mw / 1000).toFixed(digits);
}
