/**
 * US electricity demand by end-use sector, and the data-center load that sits
 * inside it.
 *
 * The distinction this module exists to enforce: residential, commercial and
 * industrial are the end-use sectors, and they are exhaustive. Data centers are
 * not a fourth one. Their load is metered inside commercial and industrial, so
 * adding a data-center figure to the sector list counts it twice.
 *
 * That is not hypothetical. The Overview card previously listed data centers as
 * a fourth peer row at 288 TWh, and the "total" it printed (4,490 TWh) was the
 * three real sectors (4,202 TWh) plus that 288. The residual between the sector
 * sum and total demand happens to be close to the data-center figure, which is
 * exactly what makes the mistake easy to make and hard to notice.
 *
 * Keep the data-center figure out of any sector total. The tests enforce it.
 */

export interface Sector {
  sector: string;
  twh: number;
  /** Year-over-year change in percent. */
  yoy: number;
}

/**
 * The three end-use sectors. Source: EIA Electric Power Monthly (2025).
 * Exhaustive by construction: there is no fourth end-use sector to add.
 */
export const US_SECTOR_DEMAND: Sector[] = [
  { sector: "Residential", twh: 1658, yoy: 2.1 },
  { sector: "Commercial", twh: 1569, yoy: 2.4 },
  { sector: "Industrial", twh: 975, yoy: -3.2 },
];

/**
 * Data-center load, which is a slice of the sectors above rather than an
 * addition to them.
 *
 * Flagged estimated on purpose. EIA's end-use accounting has no data-center
 * category to read this off, so whatever its origin it is a derived figure
 * rather than a metered one, and it renders with the estimate treatment so it
 * never reads as measured. The precise provenance of this number is not
 * recorded in the repo; the Overview KPI card attributes it to EIA 2025, which
 * is worth reconciling with a source before either claim hardens.
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
 * The card used to claim demand was "up 15% from the 2022 low". In the series on
 * the same page the trough is 2020, and 2022 to 2025 is about +11%, so both the
 * year and the number were wrong. Deriving them means the sentence cannot drift
 * from the data it sits next to.
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
