import { fetchWithTimeout } from "./fetch-timeout";
import { eiaBase } from "./eia-grid";
// ─── US electricity use from the Monthly Energy Review API ───────────────
//
// EIA v2 total-energy: the same series the site used to hand-copy from MER
// Tables 7.1 and 7.6 (the client's static tables match these values and stay
// only as the fallback). Annual end use for the long line, annual retail sales
// by sector, and rolling 12-month figures, so a page can say what the last year
// of data shows instead of waiting for a calendar year to close.
//
// Same contract as the other physical modules: free key, self-reports
// unconfigured without one, serves the last good fetch marked stale when a
// refresh fails, never fabricates. A rolling figure exists only when all 24
// months behind it were reported; EIA's data lags by about three months.

export const ELECTRICITY_USE_SOURCE = {
  label: "EIA Monthly Energy Review, Tables 7.1 and 7.6",
  url: "https://www.eia.gov/totalenergy/data/browser/?tbl=T07.01",
} as const;

const END_USE = "ELTCPUS";
const RETAIL_TOTAL = "ESTCPUS";
const SECTOR_MSN: Array<[string, string]> = [
  ["Residential", "ESRCPUS"],
  ["Commercial", "ESCCPUS"],
  ["Industrial", "ESICPUS"],
  ["Transportation", "ESACPUS"],
];
const ALL_MSN = [END_USE, RETAIL_TOTAL, ...SECTOR_MSN.map(([, m]) => m)];
const FIRST_YEAR = 2010;

export interface SectorFigure {
  sector: string;
  twh: number;
  /** Percent change from the same period a year earlier. */
  yoy: number;
}

export interface PeriodFigures {
  /** Display label for the period, "2025" or "12 months through 2026-07". */
  period: string;
  retailTotalTwh: number;
  sectors: SectorFigure[];
}

export interface RollingFigures extends PeriodFigures {
  /** Last month in the window, YYYY-MM. */
  through: string;
  endUseTwh: number;
  endUseYoy: number;
  retailYoy: number;
}

export type ElectricityUseResult =
  | { configured: false; howTo: string }
  | {
      configured: true;
      source: string;
      sourceUrl: string;
      /** When GridTilt fetched this from EIA. Not a data date. */
      retrievedAt: string;
      stale: boolean;
      /** Annual end use, TWh, oldest first. Complete calendar years only. */
      endUse: Array<{ year: string; twh: number }>;
      /** Latest complete year by sector, or null if EIA's rows did not cover one. */
      annual: PeriodFigures | null;
      rolling: RollingFigures | null;
    };

interface EiaRow {
  period: string;
  msn: string;
  value: number | string | null;
  unit?: string;
}

const YEAR = /^\d{4}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Exported for unit tests: msn -> period -> TWh, from EIA's million kWh rows. */
export function indexRows(rows: EiaRow[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (typeof r.msn !== "string" || typeof r.period !== "string") continue;
    if (!YEAR.test(r.period) && !MONTH.test(r.period)) continue;
    if (r.unit !== undefined && !/million kilowatthours/i.test(r.unit)) continue;
    // Number(null) is 0, and EIA writes "Not Available" for gaps.
    if (r.value == null || r.value === "") continue;
    const mkwh = Number(r.value);
    if (!Number.isFinite(mkwh) || mkwh < 0) continue;
    const series = out.get(r.msn) ?? new Map<string, number>();
    if (!series.has(r.period)) series.set(r.period, mkwh / 1000);
    out.set(r.msn, series);
  }
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const yoy = (now: number, prior: number) => round1(((now - prior) / prior) * 100);

/** The latest year in `years` with a positive prior year for every sector. */
export function annualFigures(idx: Map<string, Map<string, number>>): PeriodFigures | null {
  const retail = idx.get(RETAIL_TOTAL);
  if (!retail) return null;
  const years = Array.from(retail.keys()).filter((p) => YEAR.test(p)).sort().reverse();
  for (const year of years) {
    const prior = String(Number(year) - 1);
    const sectors: SectorFigure[] = [];
    for (const [sector, msn] of SECTOR_MSN) {
      const now = idx.get(msn)?.get(year);
      const was = idx.get(msn)?.get(prior);
      if (now === undefined || !was) break;
      sectors.push({ sector, twh: now, yoy: yoy(now, was) });
    }
    if (sectors.length === SECTOR_MSN.length) {
      return { period: year, retailTotalTwh: retail.get(year)!, sectors };
    }
  }
  return null;
}

function monthsBack(through: string, count: number): string[] {
  const [y, m] = through.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Sum of the 12 months in a window, or null if any month is missing. */
function sumWindow(series: Map<string, number> | undefined, months: string[]): number | null {
  if (!series) return null;
  let total = 0;
  for (const m of months) {
    const v = series.get(m);
    if (v === undefined) return null;
    total += v;
  }
  return total;
}

/**
 * The newest 12-month window where every series has all 24 months behind it
 * (this window and the one a year earlier), so no gap can pass as a drop.
 */
export function rollingFigures(idx: Map<string, Map<string, number>>): RollingFigures | null {
  const endUse = idx.get(END_USE);
  if (!endUse) return null;
  const candidates = Array.from(endUse.keys()).filter((p) => MONTH.test(p)).sort().reverse().slice(0, 6);
  for (const through of candidates) {
    const window = monthsBack(through, 12);
    const prior = monthsBack(monthsBack(through, 13)[12], 12);
    const useNow = sumWindow(endUse, window);
    const useWas = sumWindow(endUse, prior);
    const retailNow = sumWindow(idx.get(RETAIL_TOTAL), window);
    const retailWas = sumWindow(idx.get(RETAIL_TOTAL), prior);
    if (!useNow || !useWas || !retailNow || !retailWas) continue;
    const sectors: SectorFigure[] = [];
    for (const [sector, msn] of SECTOR_MSN) {
      const now = sumWindow(idx.get(msn), window);
      const was = sumWindow(idx.get(msn), prior);
      if (now === null || !was) break;
      sectors.push({ sector, twh: now, yoy: yoy(now, was) });
    }
    if (sectors.length !== SECTOR_MSN.length) continue;
    return {
      period: `12 months through ${through}`,
      through,
      endUseTwh: useNow,
      endUseYoy: yoy(useNow, useWas),
      retailTotalTwh: retailNow,
      retailYoy: yoy(retailNow, retailWas),
      sectors,
    };
  }
  return null;
}

const CACHE_MS = 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000;

type Configured = Extract<ElectricityUseResult, { configured: true }>;
let cache: { at: number; payload: Configured } | null = null;
let lastFailureAt: number | null = null;
let lastFailureReason: string | null = null;
let inflight: Promise<ElectricityUseResult> | null = null;

/** Test seam. */
export function resetElectricityUseCache(): void {
  cache = null;
  lastFailureAt = null;
  lastFailureReason = null;
  inflight = null;
}

/** Freshness envelope for the data-status registry. */
export function electricityUseStamp(): {
  lastChecked: string | null;
  lastRefreshed: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
} {
  const through = cache?.payload.rolling?.through;
  return {
    lastChecked: cache ? new Date(cache.at).toISOString() : null,
    lastRefreshed: through ? `${through}-01` : null,
    lastFailureAt: lastFailureAt === null ? null : new Date(lastFailureAt).toISOString(),
    lastFailureReason,
  };
}

type FetchLike = (url: URL) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

function totalEnergyUrl(key: string, frequency: "annual" | "monthly", start: string): URL {
  const url = new URL("total-energy/data/", eiaBase());
  url.searchParams.set("api_key", key);
  url.searchParams.set("frequency", frequency);
  url.searchParams.set("data[0]", "value");
  for (const msn of ALL_MSN) url.searchParams.append("facets[msn][]", msn);
  url.searchParams.set("start", start);
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.set("length", "1000");
  return url;
}

async function readRows(fetchImpl: FetchLike, url: URL): Promise<EiaRow[]> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`EIA responded ${res.status}`);
  const body = (await res.json()) as { response?: { data?: EiaRow[] } };
  return Array.isArray(body?.response?.data) ? body.response!.data! : [];
}

export async function getElectricityUse(
  opts: { fetchImpl?: FetchLike; now?: () => number; env?: NodeJS.ProcessEnv } = {},
): Promise<ElectricityUseResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url) => fetchWithTimeout(url));
  const key = env.EIA_API_KEY;
  if (!key) {
    return {
      configured: false,
      howTo: "Set EIA_API_KEY (free: https://www.eia.gov/opendata/register.php) to serve US electricity use.",
    };
  }
  if (cache && now() - cache.at < CACHE_MS) return cache.payload;
  if (cache && lastFailureAt !== null && now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) {
    return { ...cache.payload, stale: true };
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const startMonth = `${new Date(now()).getUTCFullYear() - 3}-01`;
      const [annualRows, monthlyRows] = await Promise.all([
        readRows(fetchImpl, totalEnergyUrl(key, "annual", String(FIRST_YEAR))),
        readRows(fetchImpl, totalEnergyUrl(key, "monthly", startMonth)),
      ]);
      const annualIdx = indexRows(annualRows);
      const endUse = Array.from(annualIdx.get(END_USE)?.entries() ?? [])
        .filter(([year]) => YEAR.test(year))
        .map(([year, twh]) => ({ year, twh: Math.round(twh) }))
        .sort((a, b) => a.year.localeCompare(b.year));
      // An empty or malformed answer is a failed refresh, not "no electricity".
      if (endUse.length < 5) throw new Error("EIA returned no usable annual end-use rows");

      const payload: Configured = {
        configured: true,
        source: ELECTRICITY_USE_SOURCE.label,
        sourceUrl: ELECTRICITY_USE_SOURCE.url,
        retrievedAt: new Date(now()).toISOString(),
        stale: false,
        endUse,
        annual: annualFigures(annualIdx),
        rolling: rollingFigures(indexRows(monthlyRows)),
      };
      cache = { at: now(), payload };
      lastFailureAt = null;
      lastFailureReason = null;
      return payload;
    } catch (error) {
      lastFailureAt = now();
      lastFailureReason = error instanceof Error ? error.message : String(error);
      if (cache) return { ...cache.payload, stale: true };
      throw error;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
