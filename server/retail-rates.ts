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

export interface UsagePoint {
  month: string; // YYYY-MM
  /** state residential sales ÷ residential customers, that month */
  avgMonthlyKwh: number;
  /** avgMonthlyKwh × that month's average price */
  typicalBillUsd: number;
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
      /** state postal code -> derived usage/bill series, oldest first */
      usageByState: Record<string, UsagePoint[]>;
      usageNote: string;
    };

interface EiaRetailRow {
  period: string;
  stateid: string;
  price: number | string | null;
  sales?: number | string | null;
  customers?: number | string | null;
  "sales-units"?: string;
  "customers-units"?: string;
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

/**
 * Exported for unit tests: derive typical monthly usage and bill per state.
 * Only rows whose own units fields say what the arithmetic assumes are
 * used; a units change upstream drops the derivation rather than shipping
 * a wrong number. Sales arrive in million kWh, so per-customer kWh is
 * sales × 1e6 ÷ customers, and the bill is kWh × price ÷ 100.
 */
export function deriveUsage(rows: EiaRetailRow[]): Record<string, UsagePoint[]> {
  const byState: Record<string, UsagePoint[]> = {};
  for (const r of rows) {
    if (!r.stateid || !r.period) continue;
    if (r.price == null || r.price === "" || r.sales == null || r.sales === "" || r.customers == null || r.customers === "") continue;
    if (!(r["sales-units"] ?? "").toLowerCase().includes("million kilowatthour")) continue;
    if (!(r["customers-units"] ?? "").toLowerCase().includes("number of customers")) continue;
    const price = Number(r.price);
    const sales = Number(r.sales);
    const customers = Number(r.customers);
    if (!Number.isFinite(price) || !Number.isFinite(sales) || !Number.isFinite(customers) || customers <= 0 || sales <= 0) continue;
    const avgMonthlyKwh = (sales * 1_000_000) / customers;
    (byState[r.stateid] ??= []).push({
      month: r.period,
      avgMonthlyKwh,
      typicalBillUsd: (avgMonthlyKwh * price) / 100,
    });
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
  url.searchParams.set("data[1]", "sales");
  url.searchParams.set("data[2]", "customers");
  url.searchParams.set("facets[sectorid][]", "RES");
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  // 51 jurisdictions plus the US row and census divisions x 25 months;
  // sorted newest first, so a truncation trims the oldest month
  url.searchParams.set("length", "2400");

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`EIA responded ${res.status}`);
  const body = (await res.json()) as { response?: { data?: EiaRetailRow[] } };
  const rows = body.response?.data ?? [];
  const byState = groupRetailRows(rows);
  const usageByState = deriveUsage(rows);

  const payload: RetailRatesResult = {
    configured: true,
    unit: "cents per kWh, residential average",
    source: "U.S. Energy Information Administration, Electric Power Monthly",
    sourceUrl: "https://www.eia.gov/electricity/data/browser/",
    asOf: new Date().toISOString(),
    byState,
    usageByState,
    usageNote: "Typical usage is state residential sales divided by residential customers; the bill is that usage at the month's average rate.",
  };
  cache = { at: Date.now(), payload };
  return payload;
}
