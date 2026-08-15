/**
 * US electricity demand by end-use sector.
 *
 * Residential, commercial and industrial are exhaustive. Data centers are not a
 * fourth sector; their load is metered inside commercial and industrial, so it
 * must stay out of any sector total. The Overview card previously added it,
 * printing 4,490 TWh where the sectors sum to 4,202. Tests enforce the rule.
 */

export interface Sector {
  sector: string;
  twh: number;
  /** Year-over-year change in percent. */
  yoy: number;
}

/** Source: EIA Electric Power Monthly (2025). There is no fourth end-use sector. */
export const US_SECTOR_DEMAND: Sector[] = [
  { sector: "Residential", twh: 1658, yoy: 2.1 },
  { sector: "Commercial", twh: 1569, yoy: 2.4 },
  { sector: "Industrial", twh: 975, yoy: -3.2 },
];

/**
 * Data-center load: a slice of the sectors above, not an addition to them.
 *
 * Flagged estimated. EIA's end-use accounting has no data-center category, so
 * this is derived rather than metered. Source: LBNL, 2024 United States Data
 * Center Energy Usage Report (DOE-funded) — 176 TWh measured in 2023, 2028
 * projected range 325-580 TWh; the 2025 figure sits inside that projection
 * band. The Overview KPI labels it as an estimate and cites LBNL, never EIA.
 * https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report_1.pdf
 */
export const DATA_CENTER_LOAD = {
  twh: 288,
  yoy: 33.3,
  estimated: true,
  containedIn: "commercial and industrial",
} as const;

/** Sum of the end-use sectors. Never includes data-center load. */
export function sectorTotalTWh(sectors: Sector[] = US_SECTOR_DEMAND): number {
  return sectors.reduce((sum, s) => sum + (Number.isFinite(s.twh) ? s.twh : 0), 0);
}

/**
 * Share of a total, 0-100. Null when the denominator is unusable so a caller
 * renders nothing rather than a meaningless zero.
 */
export function sectorShare(twh: number, totalTWh: number): number | null {
  if (!Number.isFinite(totalTWh) || totalTWh <= 0 || !Number.isFinite(twh)) return null;
  return (twh / totalTWh) * 100;
}

export interface DemandPoint {
  year: string;
  demand: number | null;
}

/**
 * Lowest measured year in a demand series, skipping unmeasured years.
 *
 * The card claimed "up 15% from the 2022 low"; the series trough is 2020 and 2022
 * to 2025 is about +11%. Derived so the copy cannot drift from the series again.
 */
export function demandTrough(series: DemandPoint[]): { year: string; twh: number } | null {
  let best: { year: string; twh: number } | null = null;
  for (const p of series) {
    if (typeof p.demand !== "number" || !Number.isFinite(p.demand)) continue;
    if (best === null || p.demand < best.twh) best = { year: p.year, twh: p.demand };
  }
  return best;
}

/** Latest measured point in a demand series. */
export function latestDemand(series: DemandPoint[]): { year: string; twh: number } | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const p = series[i];
    if (typeof p.demand === "number" && Number.isFinite(p.demand)) {
      return { year: p.year, twh: p.demand };
    }
  }
  return null;
}

/** Percent change from one figure to another. Null when the base is unusable. */
export function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}
