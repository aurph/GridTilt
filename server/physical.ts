import { fetchWithTimeout } from "./fetch-timeout";
// ─── Physical electricity data ───────────────────────────────────────────
//
// The market gauges read equities; this module is the physical side.
//
// Tier 1 (live now, no key): FRED `IPG2211A2N`, Industrial Production:
// Electric Power Generation, Transmission & Distribution (monthly, NSA,
// index 2017=100). Same series the index validation study correlates
// against, fetched from FRED's public CSV endpoint with attribution.
//
// Tier 2 (live once EIA_API_KEY is set): EIA v2 hourly demand for the
// lower-48 (respondent US48, type D). The key is free at
// https://www.eia.gov/opendata/register.php. Until a key is configured the
// endpoint reports itself unconfigured instead of pretending; this module
// refuses to fake physical data.

const FRED_SERIES = "IPG2211A2N";
const FRED_URL = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${FRED_SERIES}`;
const FRED_CACHE_MS = 24 * 60 * 60 * 1000; // monthly series; daily fetch is plenty

export interface MonthlyPoint {
  month: string; // YYYY-MM
  value: number;
}

export interface ElectricityOutputPayload {
  series: string;
  name: string;
  unit: string;
  source: string;
  sourceUrl: string;
  asOf: string;
  points: MonthlyPoint[];
}

/** Exported for unit tests: parse FRED's two-column CSV. */
export function parseFredCsv(csv: string): MonthlyPoint[] {
  const points: MonthlyPoint[] = [];
  for (const line of csv.trim().split("\n").slice(1)) {
    const [date, raw] = line.split(",");
    const value = parseFloat(raw);
    if (!date || Number.isNaN(value)) continue; // FRED marks gaps with '.'
    points.push({ month: date.slice(0, 7), value });
  }
  return points;
}

let fredCache: { at: number; payload: ElectricityOutputPayload } | null = null;

export async function getElectricityOutputMonthly(): Promise<ElectricityOutputPayload> {
  if (fredCache && Date.now() - fredCache.at < FRED_CACHE_MS) return fredCache.payload;
  const res = await fetchWithTimeout(FRED_URL);
  if (!res.ok) throw new Error(`FRED responded ${res.status}`);
  const points = parseFredCsv(await res.text());
  const payload: ElectricityOutputPayload = {
    series: FRED_SERIES,
    name: "Industrial Production: Electric Power Generation, Transmission & Distribution",
    unit: "index, 2017 = 100, not seasonally adjusted",
    source: "Federal Reserve Bank of St. Louis (FRED)",
    sourceUrl: `https://fred.stlouisfed.org/series/${FRED_SERIES}`,
    asOf: new Date().toISOString(),
    points,
  };
  fredCache = { at: Date.now(), payload };
  return payload;
}

export interface HourlyDemandPoint {
  periodUtc: string;
  megawatts: number;
}

export type HourlyDemandResult =
  | { configured: false; howTo: string }
  | {
      configured: true;
      respondent: string;
      source: string;
      asOf: string;
      points: HourlyDemandPoint[];
    };

const EIA_CACHE_MS = 30 * 60 * 1000;
let eiaCache: { at: number; payload: HourlyDemandResult } | null = null;

export async function getHourlyDemandUS48(): Promise<HourlyDemandResult> {
  const key = process.env.EIA_API_KEY;
  if (!key) {
    return {
      configured: false,
      howTo:
        "Set EIA_API_KEY (free: https://www.eia.gov/opendata/register.php) to serve live US48 hourly demand.",
    };
  }
  if (eiaCache && Date.now() - eiaCache.at < EIA_CACHE_MS) return eiaCache.payload;

  const url = new URL("https://api.eia.gov/v2/electricity/rto/region-data/data/");
  url.searchParams.set("api_key", key);
  url.searchParams.set("frequency", "hourly");
  url.searchParams.set("data[0]", "value");
  url.searchParams.set("facets[respondent][]", "US48");
  url.searchParams.set("facets[type][]", "D"); // D = demand
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("length", "168"); // last 7 days

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`EIA responded ${res.status}`);
  const body = (await res.json()) as {
    response?: { data?: Array<{ period: string; value: number | string }> };
  };
  const rows = body.response?.data ?? [];
  const points: HourlyDemandPoint[] = rows
    .map((r) => ({ periodUtc: r.period, megawatts: Number(r.value) }))
    .filter((p) => Number.isFinite(p.megawatts))
    .reverse(); // oldest first

  const payload: HourlyDemandResult = {
    configured: true,
    respondent: "US48 (lower 48 states)",
    source: "U.S. Energy Information Administration, Hourly Electric Grid Monitor",
    asOf: new Date().toISOString(),
    points,
  };
  eiaCache = { at: Date.now(), payload };
  return payload;
}
