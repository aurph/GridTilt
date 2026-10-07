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
 * 192 TWh in 2024, 4.7% of total US electricity. LBNL, United States Data Center
 * Energy Usage Report: 2025 Update (LBNL-2001758, June 2026). Excludes crypto
 * mining, which is out of that report's scope. 2024 is its last historical year.
 *
 * Still flagged estimated: LBNL's figure is a bottom-up model over shipment data,
 * not a metered total, and EIA's end-use accounting has no data-center category
 * to check it against.
 *
 * History, because this number has been wrong twice. It was first 288 TWh
 * attributed to "EIA 2025", which EIA does not publish. That was then re-cited to
 * LBNL as a 2025 point inside the 2024 report's projection band, which fixed the
 * attribution but kept a figure LBNL never printed: the 2025 Update puts 2024 at
 * 192 TWh and 2028 at 464 TWh, so 288 in 2025 implies a one-year jump the model
 * does not show. Both versions also happened to make the sector card total
 * 4,490 TWh, which is how an unsourced number kept surviving review.

 */
export const DATA_CENTER_LOAD = {
  twh: 192,
  /** The year the figure is for, which is not the sector rows' year. */
  year: 2024,
  sharePctOfUS: 4.7,
  estimated: true,
  containedIn: "commercial and industrial",
  source: "LBNL 2025 Update",
  sourceUrl: "https://escholarship.org/uc/item/33m6w3x0",
} as const;

/**
 * LBNL's Reference Case for 2030: 649 TWh, 11.8% of forecast US electricity,
 * with a compounded-uncertainty range of 521-843 TWh (9.5-15.3%).
 *
 * Supersedes the 2024 Report's 6.7-12.0%-by-2028 range. The site quoted only
 * that range's top as "12%+ by 2028", which read as a floor rather than a ceiling
 * and is now two editions out of date.
 */
export const DATA_CENTER_2030 = {
  twh: 649,
  sharePctOfUS: 11.8,
  lowPct: 9.5,
  highPct: 15.3,
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
