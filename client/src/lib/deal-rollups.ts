/**
 * Reads /api/deals/metrics on surfaces other than the Deals page, so agreement
 * totals are quoted from one place.
 *
 * The Overview's nuclear KPI was hardcoded and disagreed with the served data
 * three ways: headline 12+ GW, named companies 10.3 GW, computeDealMetrics
 * 15.5 GW. It also gave Microsoft 1.2 GW where the queue says 835 MW, and counted
 * Meta's 6.6 GW RFP, a request rather than a contract, as committed. The served
 * 15.5 GW then turned out to include letters of intent and unreviewed rows; only
 * reviewed, signed agreements are summed now (server/deals.ts).
 */

export interface BucketLite {
  key: string;
  count: number;
  mw: number;
}

export interface DealRowLite {
  id: string;
  type: string;
  /** Normalised buyer name. */
  offtaker: string;
  /** Null when undisclosed. */
  capacityMW: number | null;
  /** "signed" | "framework" | "option" | "preliminary" | "portfolio" | "unreviewed" */
  firmness: string;
  aggregate?: boolean;
  includes?: string[];
}

/**
 * Bucket for one generation type. Null when the payload has not arrived or has no
 * agreements of that type, so callers render a placeholder rather than zero capacity.
 */
export function bucketFor(
  byType: BucketLite[] | undefined | null,
  key: string,
): BucketLite | null {
  if (!Array.isArray(byType)) return null;
  const found = byType.find((b) => b.key === key);
  return found && Number.isFinite(found.mw) ? found : null;
}

/**
 * Buyers of one generation type by signed capacity, largest first. Only signed,
 * non-aggregate rows count, each once; undisclosed capacity adds nothing.
 */
export function signedBuyersForType(
  rows: DealRowLite[] | undefined | null,
  type: string,
): Array<{ buyer: string; mw: number }> {
  if (!Array.isArray(rows)) return [];
  const signed = rows.filter((r) => r.firmness === "signed" && !r.aggregate);
  const nested = new Set(signed.flatMap((r) => r.includes ?? []));
  const totals = new Map<string, number>();
  for (const r of signed) {
    if (r.type !== type || nested.has(r.id)) continue;
    if (typeof r.capacityMW !== "number" || !Number.isFinite(r.capacityMW)) continue;
    totals.set(r.offtaker, (totals.get(r.offtaker) ?? 0) + r.capacityMW);
  }
  return Array.from(totals.entries())
    .map(([buyer, mw]) => ({ buyer, mw }))
    .sort((a, b) => b.mw - a.mw || a.buyer.localeCompare(b.buyer));
}

/** Megawatts as gigawatts for display. Null in, null out. */
export function asGW(mw: number | null | undefined, digits = 1): string | null {
  if (typeof mw !== "number" || !Number.isFinite(mw) || mw <= 0) return null;
  return (mw / 1000).toFixed(digits);
}
