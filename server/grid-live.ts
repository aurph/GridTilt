// ─── Live grid snapshot (pure parsers + cached fetch) ────────────────────
//
// "Your grid right now" for My Grid: today's demand curve and the current
// fuel mix, from each ISO's own public, keyless dashboard feeds (the same
// feeds behind their official dashboards; 5-minute data). Parsers are pure
// and unit-tested against captured shapes; the fetch layer caches for five
// minutes and serves a recent stale snapshot rather than flapping when an
// upstream blips. Coverage is honest: ERCOT, CAISO, and MISO have keyless
// feeds; the remaining regions arrive via EIA once EIA_API_KEY is set.

import { fetchWithTimeout } from "./fetch-timeout";

export type LiveRto = "ercot" | "caiso" | "miso";
export const LIVE_RTOS: LiveRto[] = ["ercot", "caiso", "miso"];
export const isLiveRto = (s: string): s is LiveRto => (LIVE_RTOS as string[]).includes(s);

export interface FuelSlice {
  fuel: string; // canonical: gas coal nuclear wind solar hydro storage geothermal biomass imports other
  mw: number; // negatives are real (storage charging, solar at night)
}

export interface GridLiveSnapshot {
  rto: LiveRto;
  operator: string;
  asOf: string; // as reported by the feed, in the grid's local time
  demand: { time: string; mw: number }[]; // today's actuals, 5-minute, "HH:MM"
  currentDemandMW: number;
  peakDemandMW: number; // today's max actual so far
  fuelMix: FuelSlice[]; // latest interval, sorted by mw desc
  source: string;
  sourceUrl: string;
}

// ── fuel-name normalization ───────────────────────────────────────────────

const FUEL_MAP: Array<[RegExp, string]> = [
  [/natural gas/i, "gas"],
  [/coal/i, "coal"],
  [/nuclear/i, "nuclear"],
  [/wind/i, "wind"],
  [/solar/i, "solar"],
  [/hydro/i, "hydro"],
  [/storage|batter/i, "storage"],
  [/geothermal/i, "geothermal"],
  [/bio/i, "biomass"],
  [/import/i, "imports"],
];

export function normalizeFuel(raw: string): string {
  for (const [re, canon] of FUEL_MAP) if (re.test(raw)) return canon;
  return "other";
}

/** Merge same-canonical slices (e.g. CAISO's small + large hydro) and sort. */
export function foldFuel(slices: FuelSlice[]): FuelSlice[] {
  const m = new Map<string, number>();
  for (const s of slices) m.set(s.fuel, (m.get(s.fuel) ?? 0) + s.mw);
  return Array.from(m.entries())
    .map(([fuel, mw]) => ({ fuel, mw: Math.round(mw) }))
    .sort((a, b) => b.mw - a.mw);
}

// ── ERCOT ─────────────────────────────────────────────────────────────────
// supply-demand.json: { lastUpdated, data: [{ demand, capacity, forecast,
// timestamp: "YYYY-MM-DD HH:MM:SS-05:00", ... }] }. Future rows keep a
// populated demand field but are flagged forecast:1 — filter on the flag,
// not on demand>0, or "today's peak" silently becomes the forecast peak.
// fuel-mix.json: { lastUpdated, data: { "YYYY-MM-DD": { "<ts>": { Fuel:
// { gen } } } } } — carries yesterday too; take latest day, latest interval.

export function parseErcot(
  supplyDemand: { lastUpdated: string; data: Array<{ demand: number; forecast?: number; timestamp: string }> },
  fuelMix: { data: Record<string, Record<string, Record<string, { gen: number }>>> },
): Pick<GridLiveSnapshot, "asOf" | "demand" | "currentDemandMW" | "peakDemandMW" | "fuelMix"> {
  const demand = (supplyDemand.data ?? [])
    .filter((r) => r.demand > 0 && !r.forecast)
    .map((r) => ({ time: r.timestamp.slice(11, 16), mw: Math.round(r.demand) }));

  const days = Object.keys(fuelMix.data ?? {}).sort();
  const latestDay = fuelMix.data?.[days[days.length - 1]] ?? {};
  const intervals = Object.keys(latestDay).sort();
  const latest = latestDay[intervals[intervals.length - 1]] ?? {};
  const fuel = foldFuel(
    Object.entries(latest).map(([name, v]) => ({ fuel: normalizeFuel(name), mw: v.gen })),
  );

  return {
    asOf: supplyDemand.lastUpdated,
    demand,
    currentDemandMW: demand[demand.length - 1]?.mw ?? 0,
    peakDemandMW: demand.reduce((m, r) => Math.max(m, r.mw), 0),
    fuelMix: fuel,
  };
}

// ── CAISO ─────────────────────────────────────────────────────────────────
// outlook/current/demand.csv: Time,Day ahead forecast,Hour ahead forecast,
// Current demand,Demand response — future rows have an empty actual.
// outlook/current/fuelsource.csv: Time,<fuel columns...> — take the last row
// with a complete set of values.

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { header, rows };
}

export function parseCaiso(
  demandCsv: string,
  fuelCsv: string,
): Pick<GridLiveSnapshot, "asOf" | "demand" | "currentDemandMW" | "peakDemandMW" | "fuelMix"> {
  const d = parseCsv(demandCsv);
  const demandCol = d.header.findIndex((h) => /current demand/i.test(h));
  const demand = d.rows
    .filter((r) => r[demandCol] !== "" && r[demandCol] != null)
    .map((r) => ({ time: r[0], mw: Math.round(Number(r[demandCol])) }))
    .filter((r) => Number.isFinite(r.mw));

  const f = parseCsv(fuelCsv);
  const complete = f.rows.filter((r) => r.length === f.header.length && r.slice(1).every((c) => c !== ""));
  const last = complete[complete.length - 1] ?? [];
  const fuel = foldFuel(
    f.header.slice(1).map((name, i) => ({ fuel: normalizeFuel(name), mw: Number(last[i + 1] ?? 0) })),
  );

  return {
    asOf: `${last[0] ?? demand[demand.length - 1]?.time ?? ""} PT`,
    demand,
    currentDemandMW: demand[demand.length - 1]?.mw ?? 0,
    peakDemandMW: demand.reduce((m, r) => Math.max(m, r.mw), 0),
    fuelMix: fuel,
  };
}

// ── MISO ──────────────────────────────────────────────────────────────────
// RealTimeTotalLoad: { LoadInfo: { RefId, FiveMinTotalLoad: [{ Load:
// { Time: "HH:MM", Value: "87744" } }] } }
// FuelMix/Today: { RefId, Fuel: { Type: [{ INTERVALEST, CATEGORY, ACT }] } }
// — Type[] carries EVERY interval of the day; keep only the latest one or
// the "current" mix silently becomes a day-total (a ~4 TW gas reading).

/** "2026-09-01 1:05:00 PM" -> sortable minutes-of-day (12-hour source). */
export function misoIntervalKey(intervalEst: string): number {
  const m = /(\d{1,2}):(\d{2}):\d{2}\s*(AM|PM)/i.exec(intervalEst);
  if (!m) return -1;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

export function parseMiso(
  loadJson: { LoadInfo: { RefId: string; FiveMinTotalLoad: Array<{ Load: { Time: string; Value: string } }> } },
  fuelJson: { Fuel: { Type: Array<{ INTERVALEST?: string; CATEGORY: string; ACT: string }> } },
): Pick<GridLiveSnapshot, "asOf" | "demand" | "currentDemandMW" | "peakDemandMW" | "fuelMix"> {
  const demand = (loadJson.LoadInfo?.FiveMinTotalLoad ?? [])
    .map((r) => ({ time: r.Load.Time, mw: Math.round(Number(r.Load.Value)) }))
    .filter((r) => Number.isFinite(r.mw) && r.mw > 0);

  // The newest interval streams in category-by-category (observed live: the
  // freshest stamp held only "Imports"). Use the latest interval that is
  // reasonably complete relative to the fullest interval of the day.
  const types = fuelJson.Fuel?.Type ?? [];
  const counts = new Map<number, number>();
  for (const t of types) {
    const k = misoIntervalKey(t.INTERVALEST ?? "");
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const maxCount = Math.max(0, ...Array.from(counts.values()));
  const pickKey = Array.from(counts.entries())
    .filter(([, n]) => n >= maxCount * 0.8)
    .reduce((m, [k]) => Math.max(m, k), -1);
  const fuel = foldFuel(
    types
      .filter((t) => misoIntervalKey(t.INTERVALEST ?? "") === pickKey)
      .map((t) => ({
        fuel: normalizeFuel(t.CATEGORY),
        mw: Number(String(t.ACT).replace(/,/g, "")),
      })),
  );

  return {
    asOf: loadJson.LoadInfo?.RefId ?? "",
    demand,
    currentDemandMW: demand[demand.length - 1]?.mw ?? 0,
    peakDemandMW: demand.reduce((m, r) => Math.max(m, r.mw), 0),
    fuelMix: fuel,
  };
}

// ── fetch + cache ─────────────────────────────────────────────────────────

const FEEDS: Record<LiveRto, { operator: string; source: string; sourceUrl: string; urls: string[] }> = {
  ercot: {
    operator: "ERCOT",
    source: "ERCOT public dashboard feeds",
    sourceUrl: "https://www.ercot.com/gridmktinfo/dashboards",
    urls: [
      "https://www.ercot.com/api/1/services/read/dashboards/supply-demand.json",
      "https://www.ercot.com/api/1/services/read/dashboards/fuel-mix.json",
    ],
  },
  caiso: {
    operator: "CAISO",
    source: "CAISO Today's Outlook feeds",
    sourceUrl: "https://www.caiso.com/todays-outlook",
    urls: [
      "https://www.caiso.com/outlook/current/demand.csv",
      "https://www.caiso.com/outlook/current/fuelsource.csv",
    ],
  },
  miso: {
    operator: "MISO",
    source: "MISO public API",
    sourceUrl: "https://www.misoenergy.org/markets-and-operations/real-time--market-data/",
    urls: [
      "https://public-api.misoenergy.org/api/RealTimeTotalLoad",
      "https://public-api.misoenergy.org/api/FuelMix/Today",
    ],
  },
};

const CACHE_MS = 5 * 60 * 1000;
const STALE_OK_MS = 30 * 60 * 1000;
const cache = new Map<LiveRto, { at: number; snap: GridLiveSnapshot }>();

async function fetchText(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, { headers: { accept: "application/json, text/csv, */*" } }, 10_000);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

export async function getGridLive(rto: LiveRto): Promise<GridLiveSnapshot> {
  const hit = cache.get(rto);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.snap;

  try {
    const feed = FEEDS[rto];
    const [a, b] = await Promise.all(feed.urls.map(fetchText));
    let parsed;
    if (rto === "ercot") parsed = parseErcot(JSON.parse(a), JSON.parse(b));
    else if (rto === "caiso") parsed = parseCaiso(a, b);
    else parsed = parseMiso(JSON.parse(a), JSON.parse(b));
    if (parsed.demand.length === 0) throw new Error("feed returned no demand actuals");
    const snap: GridLiveSnapshot = {
      rto,
      operator: feed.operator,
      source: feed.source,
      sourceUrl: feed.sourceUrl,
      ...parsed,
    };
    cache.set(rto, { at: Date.now(), snap });
    return snap;
  } catch (e) {
    // A recent stale snapshot beats an error page; older than that, be honest.
    if (hit && Date.now() - hit.at < STALE_OK_MS) return hit.snap;
    throw e;
  }
}

/** Test seam. */
export function clearGridLiveCache(): void {
  cache.clear();
}
