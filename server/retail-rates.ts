import { fetchWithTimeout } from "./fetch-timeout";
// ─── Residential electricity rates by state ─────────────────────────────
//
// EIA v2 retail-sales: average residential price in cents/kWh, monthly, for
// every state in one call. Powers the My Grid page's "what electricity
// costs where you live" context. Same rules as the rest of server/physical:
// free EIA key required, self-reports unconfigured without one, 24 h cache,
// never fabricates.
//
// Dates: `retrievedAt` is when GridTilt fetched the data, not a data date.
// Each state's own latest month is the last point of its series; one state's
// newest month does not vouch for another's, so `newestMonth` is only the
// newest month anywhere in the response.

export interface RatePoint {
  month: string; // YYYY-MM
  centsPerKwh: number;
}

export type RetailRatesResult =
  | { configured: false; howTo: string }
  | {
      configured: true;
      unit: string;
      source: string;
      sourceUrl: string;
      /** When GridTilt fetched this from EIA. Not a data date. */
      retrievedAt: string;
      /** Newest month anywhere in the response; a state can lag it. */
      newestMonth: string | null;
      /** True when the latest refresh failed and this is the previous good fetch. */
      stale: boolean;
      /** state postal code -> monthly series, oldest first */
      byState: Record<string, RatePoint[]>;
    };

interface EiaRetailRow {
  period: string;
  stateid: string;
  sectorid?: string;
  price: number | string | null;
  "price-units"?: string;
}

const STATE_ID = /^[A-Z]{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Residential averages run from about 10 to 45 cents; anything outside 0-200 is not a price. */
const MAX_CENTS = 200;

/**
 * Exported for unit tests: group EIA rows into per-state series, oldest first.
 * A row counts only when it is a state's residential price in cents per kWh
 * for a real month; the first of any duplicate state-month is kept.
 */
export function groupRetailRows(rows: EiaRetailRow[]): Record<string, RatePoint[]> {
  const byState: Record<string, RatePoint[]> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    if (typeof r.stateid !== "string" || !STATE_ID.test(r.stateid)) continue;
    if (typeof r.period !== "string" || !MONTH.test(r.period)) continue;
    // The request asks for the residential sector; a row that says otherwise is not one.
    if (r.sectorid !== undefined && r.sectorid !== "RES") continue;
    const units = r["price-units"];
    if (units !== undefined && !/cents per kilowatt/i.test(units)) continue;
    // Number(null) is 0, which would fabricate a zero-cent rate; reject
    // empty values before coercing.
    if (r.price == null || r.price === "") continue;
    const centsPerKwh = Number(r.price);
    if (!Number.isFinite(centsPerKwh) || centsPerKwh <= 0 || centsPerKwh > MAX_CENTS) continue;
    const key = `${r.stateid}|${r.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (byState[r.stateid] ??= []).push({ month: r.period, centsPerKwh });
  }
  for (const state of Object.keys(byState)) {
    byState[state].sort((a, b) => a.month.localeCompare(b.month));
  }
  return byState;
}

/** The newest month in any state's series, or null for an empty set. */
export function newestMonth(byState: Record<string, RatePoint[]>): string | null {
  let newest: string | null = null;
  for (const series of Object.values(byState)) {
    const last = series[series.length - 1]?.month;
    if (last && (!newest || last > newest)) newest = last;
  }
  return newest;
}

const CACHE_MS = 24 * 60 * 60 * 1000;
/** After a failed refresh, serve the stale copy this long before asking EIA again. */
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000;
let cache: { at: number; payload: Extract<RetailRatesResult, { configured: true }> } | null = null;
let lastFailureAt: number | null = null;

/** Test seam. */
export function resetRetailRatesCache(): void {
  cache = null;
  lastFailureAt = null;
}

type FetchLike = (url: URL) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function getRetailRatesByState(
  opts: { fetchImpl?: FetchLike; now?: () => number; env?: NodeJS.ProcessEnv } = {},
): Promise<RetailRatesResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url) => fetchWithTimeout(url));
  const key = env.EIA_API_KEY;
  if (!key) {
    return {
      configured: false,
      howTo:
        "Set EIA_API_KEY (free: https://www.eia.gov/opendata/register.php) to serve residential rates by state.",
    };
  }
  if (cache && now() - cache.at < CACHE_MS) return cache.payload;
  if (cache && lastFailureAt !== null && now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) {
    return { ...cache.payload, stale: true };
  }

  const url = new URL("https://api.eia.gov/v2/electricity/retail-sales/data/");
  url.searchParams.set("api_key", key);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.set("data[0]", "price");
  url.searchParams.set("facets[sectorid][]", "RES");
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  // 51 jurisdictions x 25 months, with headroom for territories in the feed
  url.searchParams.set("length", "1600");

  try {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`EIA responded ${res.status}`);
    const body = (await res.json()) as { response?: { data?: EiaRetailRow[] } };
    const byState = groupRetailRows(Array.isArray(body?.response?.data) ? body.response!.data! : []);
    // An empty or malformed answer is a failed refresh, not "no rates anywhere".
    if (Object.keys(byState).length === 0) throw new Error("EIA returned no usable residential rows");

    const payload = {
      configured: true as const,
      unit: "cents per kWh, residential average",
      source: "U.S. Energy Information Administration, Electric Power Monthly",
      sourceUrl: "https://www.eia.gov/electricity/data/browser/",
      retrievedAt: new Date(now()).toISOString(),
      newestMonth: newestMonth(byState),
      stale: false,
      byState,
    };
    cache = { at: now(), payload };
    lastFailureAt = null;
    return payload;
  } catch (error) {
    lastFailureAt = now();
    // A failed refresh keeps the last good data, labeled stale with its own
    // retrieval time; it never resets how fresh that data looks.
    if (cache) return { ...cache.payload, stale: true };
    throw error;
  }
}
