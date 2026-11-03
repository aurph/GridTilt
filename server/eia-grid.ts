import { fetchWithTimeout } from "./fetch-timeout";
// ─── Live grid: EIA hourly demand by operator and generation by fuel ─────
//
// Two calls to EIA's Hourly Electric Grid Monitor (API v2), cached together:
//
// 1. electricity/rto/region-data, type D (demand), for the lower 48 and
//    for every grid operator the site names. PJM, MISO, ERCOT and SPP are
//    balancing authorities in EIA's data, so they come back exactly. WECC,
//    SERC and NPCC are NERC regions, which EIA does not report as one
//    respondent; they are summed from EIA's regional aggregates and labelled
//    as such on every surface that shows them.
// 2. electricity/rto/fuel-type-data for the lower 48: what was generating
//    in the latest reported hour, by fuel.
//
// Same contract as server/physical.ts and server/retail-rates.ts: free EIA
// key required, self-reports unconfigured without one, serves the last good
// fetch marked stale when a refresh fails, never fabricates a value.

export const EIA_GRID_SOURCE = {
  label: "U.S. Energy Information Administration, Hourly Electric Grid Monitor",
  short: "EIA Hourly Electric Grid Monitor",
  url: "https://www.eia.gov/electricity/gridmonitor/dashboard/electric_overview/US48/US48",
  apiDocs: "https://www.eia.gov/opendata/browser/electricity/rto",
} as const;

/** Site operator name -> EIA respondents. `composed` means a sum of regions. */
export const OPERATOR_RESPONDENTS: Record<
  string,
  { label: string; respondents: string[]; composed: boolean; note: string }
> = {
  US48: {
    label: "Lower 48 states",
    respondents: ["US48"],
    composed: false,
    note: "EIA respondent US48, the contiguous United States.",
  },
  PJM: { label: "PJM", respondents: ["PJM"], composed: false, note: "EIA balancing authority PJM." },
  MISO: { label: "MISO", respondents: ["MISO"], composed: false, note: "EIA balancing authority MISO." },
  ERCOT: { label: "ERCOT", respondents: ["ERCO"], composed: false, note: "EIA balancing authority ERCO." },
  SPP: { label: "SPP", respondents: ["SWPP"], composed: false, note: "EIA balancing authority SWPP." },
  NPCC: {
    label: "NPCC",
    respondents: ["NE", "NY"],
    composed: true,
    note: "Sum of EIA regions New England and New York (the US part of NPCC).",
  },
  WECC: {
    label: "WECC",
    respondents: ["CAL", "NW", "SW"],
    composed: true,
    note: "Sum of EIA regions California, Northwest and Southwest (the US part of WECC).",
  },
  SERC: {
    label: "SERC",
    respondents: ["SE", "CAR", "FLA", "TEN"],
    composed: true,
    note: "Sum of EIA regions Southeast, Carolinas, Florida and Tennessee; SERC's footprint is approximated.",
  },
};

export const FUEL_LABELS: Record<string, string> = {
  NG: "Natural gas",
  COL: "Coal",
  NUC: "Nuclear",
  WND: "Wind",
  SUN: "Solar",
  WAT: "Hydro",
  OIL: "Petroleum",
  OTH: "Other",
  BAT: "Battery storage",
  PS: "Pumped storage",
  UES: "Unknown energy storage",
  GEO: "Geothermal",
  BIO: "Biomass",
  SNB: "Solar with storage",
};

export interface HourPoint {
  /** EIA period, UTC hour, e.g. "2026-11-03T16". */
  t: string;
  mw: number;
}

export interface OperatorDemand {
  label: string;
  respondents: string[];
  composed: boolean;
  note: string;
  latestMw: number;
  latestPeriodUtc: string;
  peakMw: number;
  peakPeriodUtc: string;
  minMw: number;
  /** Hourly, oldest first, up to 7 days. */
  points: HourPoint[];
}

export interface FuelShare {
  code: string;
  label: string;
  mw: number;
  sharePct: number;
}

export interface GenerationMix {
  periodUtc: string;
  totalMw: number;
  fuels: FuelShare[];
}

export type GridLiveResult =
  | { configured: false; howTo: string }
  | {
      configured: true;
      source: string;
      sourceUrl: string;
      /** When GridTilt fetched this from EIA. Not a data date. */
      retrievedAt: string;
      /** True when the latest refresh failed and this is the previous good fetch. */
      stale: boolean;
      /** Newest hour reported anywhere in the demand response. */
      latestPeriodUtc: string | null;
      demand: Record<string, OperatorDemand>;
      /** Null when the fuel call failed or returned nothing usable; demand still serves. */
      mix: GenerationMix | null;
    };

interface EiaRow {
  period: string;
  respondent?: string;
  type?: string;
  fueltype?: string;
  value: number | string | null;
  "value-units"?: string;
}

const PERIOD = /^\d{4}-\d{2}-\d{2}T\d{2}$/;
/** US48 peaks near 750,000 MW; anything above a million is not a demand reading. */
const MAX_MW = 1_500_000;

function readMw(raw: number | string | null | undefined): number | null {
  // Number(null) is 0, which would fabricate a zero-load hour.
  if (raw == null || raw === "") return null;
  const mw = Number(raw);
  if (!Number.isFinite(mw) || mw < 0 || mw > MAX_MW) return null;
  return mw;
}

/**
 * Exported for unit tests: group EIA rows into per-respondent hourly series,
 * oldest first. A row counts only when it carries a real period and a
 * finite megawatt value; the first of any duplicate respondent-hour is kept.
 */
export function groupByRespondent(rows: EiaRow[]): Record<string, HourPoint[]> {
  const out: Record<string, HourPoint[]> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    if (typeof r.respondent !== "string" || !r.respondent) continue;
    if (typeof r.period !== "string" || !PERIOD.test(r.period)) continue;
    if (r.type !== undefined && r.type !== "D") continue;
    const mw = readMw(r.value);
    if (mw === null) continue;
    const key = `${r.respondent}|${r.period}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (out[r.respondent] ??= []).push({ t: r.period, mw });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.t.localeCompare(b.t));
  return out;
}

/**
 * Exported for unit tests: build each operator's series from its respondents.
 * A composed operator only has an hour when every member reported it, so a
 * missing region never reads as a drop in load. Operators with no usable
 * hours are left out rather than served empty.
 */
export function composeOperators(byRespondent: Record<string, HourPoint[]>): Record<string, OperatorDemand> {
  const out: Record<string, OperatorDemand> = {};
  for (const [name, spec] of Object.entries(OPERATOR_RESPONDENTS)) {
    const members = spec.respondents.map((r) => byRespondent[r] ?? []);
    if (members.some((m) => m.length === 0)) continue;
    let points: HourPoint[];
    if (members.length === 1) {
      points = members[0];
    } else {
      const sums = new Map<string, { mw: number; n: number }>();
      for (const series of members) {
        for (const p of series) {
          const cur = sums.get(p.t) ?? { mw: 0, n: 0 };
          cur.mw += p.mw;
          cur.n += 1;
          sums.set(p.t, cur);
        }
      }
      points = Array.from(sums.entries())
        .filter(([, v]) => v.n === members.length)
        .map(([t, v]) => ({ t, mw: v.mw }))
        .sort((a, b) => a.t.localeCompare(b.t));
    }
    if (points.length === 0) continue;
    let peak = points[0];
    let min = points[0];
    for (const p of points) {
      if (p.mw > peak.mw) peak = p;
      if (p.mw < min.mw) min = p;
    }
    const latest = points[points.length - 1];
    out[name] = {
      label: spec.label,
      respondents: spec.respondents,
      composed: spec.composed,
      note: spec.note,
      latestMw: latest.mw,
      latestPeriodUtc: latest.t,
      peakMw: peak.mw,
      peakPeriodUtc: peak.t,
      minMw: min.mw,
      points,
    };
  }
  return out;
}

/**
 * Exported for unit tests: the generation mix for the newest hour that at
 * least `minFuels` fuel types reported. EIA posts fuels for an hour as they
 * arrive, so the very latest period can hold one or two fuels; taking the
 * newest complete-enough hour keeps shares honest.
 */
export function latestMix(rows: EiaRow[], minFuels = 4): GenerationMix | null {
  const byPeriod = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (typeof r.fueltype !== "string" || !r.fueltype) continue;
    if (typeof r.period !== "string" || !PERIOD.test(r.period)) continue;
    const mw = readMw(r.value);
    if (mw === null) continue;
    const fuels = byPeriod.get(r.period) ?? new Map<string, number>();
    if (!fuels.has(r.fueltype)) fuels.set(r.fueltype, mw);
    byPeriod.set(r.period, fuels);
  }
  const periods = Array.from(byPeriod.keys()).sort().reverse();
  for (const period of periods) {
    const fuels = byPeriod.get(period)!;
    if (fuels.size < minFuels) continue;
    const totalMw = Array.from(fuels.values()).reduce((s, v) => s + v, 0);
    if (totalMw <= 0) continue;
    const list: FuelShare[] = Array.from(fuels.entries())
      .map(([code, mw]) => ({
        code,
        label: FUEL_LABELS[code] ?? code,
        mw,
        sharePct: Math.round((mw / totalMw) * 1000) / 10,
      }))
      .sort((a, b) => b.mw - a.mw);
    return { periodUtc: period, totalMw, fuels: list };
  }
  return null;
}

const CACHE_MS = 30 * 60 * 1000;
/** After a failed refresh, serve the stale copy this long before asking EIA again. */
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000;

type Configured = Extract<GridLiveResult, { configured: true }>;
let cache: { at: number; payload: Configured } | null = null;
let lastFailureAt: number | null = null;
let lastFailureReason: string | null = null;
let inflight: Promise<GridLiveResult> | null = null;

/** Test seam. */
export function resetGridLiveCache(): void {
  cache = null;
  lastFailureAt = null;
  lastFailureReason = null;
  inflight = null;
}

/**
 * Freshness envelope for the data-status registry: the live feed has no
 * file, so this is the stamp the registry reads instead. `lastRefreshed` is
 * the newest hour EIA reported, not when we asked.
 */
export function gridLiveStamp(): {
  lastChecked: string | null;
  lastRefreshed: string | null;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
} {
  return {
    lastChecked: cache ? new Date(cache.at).toISOString() : null,
    lastRefreshed: cache?.payload.latestPeriodUtc ? `${cache.payload.latestPeriodUtc}:00:00Z` : null,
    lastFailureAt: lastFailureAt === null ? null : new Date(lastFailureAt).toISOString(),
    lastFailureReason,
  };
}

type FetchLike = (url: URL) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * EIA's v2 API root. Overridable only so a local mock can stand in during
 * development; production never sets it.
 */
function eiaBase(): string {
  const base = process.env.EIA_API_BASE || "https://api.eia.gov/v2/";
  return base.endsWith("/") ? base : `${base}/`;
}

function demandUrl(key: string): URL {
  const url = new URL("electricity/rto/region-data/data/", eiaBase());
  url.searchParams.set("api_key", key);
  url.searchParams.set("frequency", "hourly");
  url.searchParams.set("data[0]", "value");
  url.searchParams.set("facets[type][]", "D");
  const respondents = new Set<string>();
  for (const spec of Object.values(OPERATOR_RESPONDENTS)) spec.respondents.forEach((r) => respondents.add(r));
  respondents.forEach((r) => url.searchParams.append("facets[respondent][]", r));
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  // respondents x 168 hours (7 days), under EIA's 5,000-row cap
  url.searchParams.set("length", String(Math.min(5000, respondents.size * 168)));
  return url;
}

function fuelUrl(key: string): URL {
  const url = new URL("electricity/rto/fuel-type-data/data/", eiaBase());
  url.searchParams.set("api_key", key);
  url.searchParams.set("frequency", "hourly");
  url.searchParams.set("data[0]", "value");
  url.searchParams.set("facets[respondent][]", "US48");
  url.searchParams.set("sort[0][column]", "period");
  url.searchParams.set("sort[0][direction]", "desc");
  // every fuel for the last day or so is plenty to find one complete hour
  url.searchParams.set("length", "400");
  return url;
}

async function readRows(fetchImpl: FetchLike, url: URL): Promise<EiaRow[]> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`EIA responded ${res.status}`);
  const body = (await res.json()) as { response?: { data?: EiaRow[] } };
  return Array.isArray(body?.response?.data) ? body.response!.data! : [];
}

export async function getGridLive(
  opts: { fetchImpl?: FetchLike; now?: () => number; env?: NodeJS.ProcessEnv } = {},
): Promise<GridLiveResult> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((url) => fetchWithTimeout(url));
  const key = env.EIA_API_KEY;
  if (!key) {
    return {
      configured: false,
      howTo:
        "Set EIA_API_KEY (free: https://www.eia.gov/opendata/register.php) to serve live demand by grid operator and generation by fuel.",
    };
  }
  if (cache && now() - cache.at < CACHE_MS) return cache.payload;
  if (cache && lastFailureAt !== null && now() - lastFailureAt < RETRY_AFTER_FAILURE_MS) {
    return { ...cache.payload, stale: true };
  }
  // Single-flight: a burst of page loads after the cache expires makes one
  // pair of EIA calls, not one pair per visitor.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const demandRows = await readRows(fetchImpl, demandUrl(key));
      const demand = composeOperators(groupByRespondent(demandRows));
      // No lower-48 series means the answer is unusable, whatever else came back.
      if (!demand.US48) throw new Error("EIA returned no usable US48 demand rows");

      let mix: GenerationMix | null = null;
      try {
        mix = latestMix(await readRows(fetchImpl, fuelUrl(key)));
      } catch {
        // Demand still serves; the mix card says it has nothing rather than
        // the whole block going dark.
        mix = cache?.payload.mix ?? null;
      }

      const latestPeriodUtc = Object.values(demand).reduce<string | null>(
        (best, d) => (best === null || d.latestPeriodUtc > best ? d.latestPeriodUtc : best),
        null,
      );
      const payload: Configured = {
        configured: true,
        source: EIA_GRID_SOURCE.label,
        sourceUrl: EIA_GRID_SOURCE.url,
        retrievedAt: new Date(now()).toISOString(),
        stale: false,
        latestPeriodUtc,
        demand,
        mix,
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
