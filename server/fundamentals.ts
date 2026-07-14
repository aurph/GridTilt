// ─── Live fundamentals (revenue growth) ─────────────────────────────────────
//
// The Stack's "Rev Growth YoY" column previously served only the hand-curated
// STATIC_MARKET_DATA values - months-stale numbers rendered identically to
// live data. This module fetches the real trailing revenue growth from the
// same quote source (Yahoo quoteSummary financialData), refreshed daily,
// with the fetch injected so the sweep logic is unit-testable offline.
//
// Missing values stay null - the UI's defined em-dash state is honest;
// nothing falls back to a stale curated number pretending to be current.

export interface FundamentalsEntry {
  /** revenue growth YoY, percent (e.g. 12.2 for +12.2%) */
  revenueGrowth: number | null;
}

export type FundamentalsFetch = (ticker: string) => Promise<number | null>;

/**
 * Fetch revenue growth for every ticker with bounded concurrency. Individual
 * failures yield null for that ticker only; the sweep itself never throws.
 */
export async function sweepRevenueGrowth(
  tickers: string[],
  fetchOne: FundamentalsFetch,
  concurrency = 8,
): Promise<Record<string, FundamentalsEntry>> {
  const out: Record<string, FundamentalsEntry> = {};
  const queue = [...(tickers ?? [])];
  async function worker() {
    for (;;) {
      const t = queue.shift();
      if (t === undefined) return;
      try {
        const growth = await fetchOne(t);
        out[t] = {
          revenueGrowth:
            typeof growth === "number" && Number.isFinite(growth) ? Math.round(growth * 10) / 10 : null,
        };
      } catch {
        out[t] = { revenueGrowth: null };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return out;
}

/** Yahoo returns a fraction (0.122 = 12.2%); convert to percent, guard junk. */
export function fractionToPercent(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  // A |growth| above 50x is a data glitch, not a business.
  if (Math.abs(v) > 50) return null;
  return v * 100;
}

// ─── Daily in-memory cache with single-flight refresh ───────────────────────

const TTL_MS = 24 * 60 * 60 * 1000;

let cache: { data: Record<string, FundamentalsEntry>; at: number } | null = null;
let refreshing = false;

export function getCachedFundamentals(): Record<string, FundamentalsEntry> {
  return cache?.data ?? {};
}

export function clearFundamentalsCache(): void {
  cache = null;
  refreshing = false;
}

/**
 * Kick a background refresh when the cache is stale. Non-blocking: callers
 * serve whatever is cached (or nulls) and pick up real values on the next
 * request after the sweep lands. Single-flight.
 */
export function refreshFundamentalsIfStale(tickers: string[], fetchOne: FundamentalsFetch): void {
  const now = Date.now();
  if (refreshing || (cache && now - cache.at < TTL_MS)) return;
  refreshing = true;
  sweepRevenueGrowth(tickers, fetchOne)
    .then((data) => {
      const n = Object.values(data).filter((e) => e.revenueGrowth !== null).length;
      cache = { data, at: Date.now() };
      console.log(`fundamentals: refreshed revenue growth for ${n}/${tickers.length} tickers`);
    })
    .catch((e) => console.error("fundamentals refresh failed:", e))
    .finally(() => {
      refreshing = false;
    });
}
