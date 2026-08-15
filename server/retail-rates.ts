import { fetchWithTimeout } from "./fetch-timeout";
// ─── Residential electricity rates by state ─────────────────────────────
//
// EIA v2 retail-sales: average residential price in cents/kWh, monthly, for
// every state in one call. Powers the My Grid page's "what electricity
// costs where you live" context. Same rules as the rest of server/physical:
// free EIA key required, self-reports unconfigured without one, 24 h cache,
// never fabricates.

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
      asOf: string;
      /** state postal code -> monthly series, oldest first */
      byState: Record<string, RatePoint[]>;
    };

interface EiaRetailRow {
  period: string;
  stateid: string;
  price: number | string | null;
}

/** Exported for unit tests: group EIA rows into per-state series, oldest first. */
export function groupRetailRows(rows: EiaRetailRow[]): Record<string, RatePoint[]> {
  const byState: Record<string, RatePoint[]> = {};
  for (const r of rows) {
    // Number(null) is 0, which would fabricate a zero-cent rate; reject
    // empty values before coercing.
    if (!r.stateid || !r.period || r.price == null || r.price === "") continue;
    const centsPerKwh = Number(r.price);
    if (!Number.isFinite(centsPerKwh)) continue;
    (byState[r.stateid] ??= []).push({ month: r.period, centsPerKwh });
  }
  for (const state of Object.keys(byState)) {
    byState[state].sort((a, b) => a.month.localeCompare(b.month));
  }
  return byState;
}

const CACHE_MS = 24 * 60 * 60 * 1000;
let cache: { at: number; payload: RetailRatesResult } | null = null;

export async function getRetailRatesByState(): Promise<RetailRatesResult> {
  const key = process.env.EIA_API_KEY;
  if (!key) {
    return {
      configured: false,
      howTo:
        "Set EIA_API_KEY (free: https://www.eia.gov/opendata/register.php) to serve residential rates by state.",
    };
  }
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.payload;

  const url = new URL("https://api.eia.gov/v2/electricity/retail-sales/data/");
  url.searchParams.set("api_key", key);
  url.searchParams.set("frequency", "monthly");
  url.searchParams.set("data[0]", "price");
  url.searchParams.set("facets[sectorid][]", "RES");
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  // 51 jurisdictions x 25 months, with headroom for territories in the feed
  url.searchParams.set("length", "1600");

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`EIA responded ${res.status}`);
  const body = (await res.json()) as { response?: { data?: EiaRetailRow[] } };
  const byState = groupRetailRows(body.response?.data ?? []);

  const payload: RetailRatesResult = {
    configured: true,
    unit: "cents per kWh, residential average",
    source: "U.S. Energy Information Administration, Electric Power Monthly",
    sourceUrl: "https://www.eia.gov/electricity/data/browser/",
    asOf: new Date().toISOString(),
    byState,
  };
  cache = { at: Date.now(), payload };
  return payload;
}
