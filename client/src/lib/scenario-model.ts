/**
 * Arithmetic behind the scenario calculator's demand and pace outputs.
 *
 * The old in-page formula started from an unsourced 4,490 TWh "2025E" US total
 * (AEO2025's reference case has about that figure for 2030, not 2025), took
 * 4.5% of it as data-center use, multiplied that by PUE although a data-center
 * total already includes cooling and power losses, and added the result on top
 * of the US total that already contained it. Per-year pace divided the
 * 2025-2030 total by 5 while the timeline spreads it over 6 years.
 */
import { DATA_CENTER_ANCHORS, electricityData } from "../data/electricity-demand";

/** The calculator's timeline: new capacity is added in each of these years. */
export const SCENARIO_YEARS = [2025, 2026, 2027, 2028, 2029, 2030] as const;

const LBNL_2025_UPDATE_URL = "https://escholarship.org/uc/item/33m6w3x0";

/**
 * Starting point: the latest year with both a measured US total (EIA) and a
 * published data-center estimate (LBNL), taken from the shared data module so
 * the calculator and the demand charts cannot disagree.
 */
function latestAnchor() {
  for (const a of [...DATA_CENTER_ANCHORS].sort((x, y) => Number(y.year) - Number(x.year))) {
    const us = electricityData.find((d) => d.year === a.year)?.demand;
    if (typeof us === "number") return { year: Number(a.year), usTwh: us, dataCenterTwh: a.twh, source: a.source };
  }
  throw new Error("no year has both a US total and a data-center estimate");
}

export const DEMAND_ANCHOR = latestAnchor();

/**
 * LBNL 2025 Update (LBNL-2001758, pp. 24-25): the national average PUE
 * "improves from 1.55 to 1.45" between 2018 and 2024 and reaches 1.36 in 2030.
 * Dividing the 2024 total by 1.45 gives the computing (IT) load that the growth
 * rate applies to; the reader's PUE turns that load back into facility use.
 */
export const FLEET_PUE = {
  2024: 1.45,
  projected2030: 1.36,
  source: "LBNL 2025 Update",
  sourceUrl: LBNL_2025_UPDATE_URL,
} as const;

/**
 * LBNL 2025 Update, 2030 data-center use: 649 TWh reference case, 521-843 TWh
 * range. Context for the reader's result, not an input.
 */
export const LBNL_2030_RANGE = {
  low: 521,
  reference: 649,
  high: 843,
  source: "LBNL 2025 Update",
  sourceUrl: LBNL_2025_UPDATE_URL,
} as const;

export interface ScenarioUse {
  year: number;
  /** US data-center electricity use, TWh. */
  dataCenterTwh: number;
  /** Everything else, held at the anchor year's level, TWh. */
  otherTwh: number;
  /** US electricity use, TWh: the rest plus data centers, counted once. */
  totalTwh: number;
  /** Data centers as a percent of US use. */
  dataCenterSharePct: number;
}

/**
 * Data-center use in `year`: the anchor year's computing load grown at
 * `growthPct` a year, times `pue`. The rest of US use stays at its anchor-year
 * level, so the total counts data centers once.
 */
export function scenarioUse(year: number, growthPct: number, pue: number): ScenarioUse {
  const computingTwh = DEMAND_ANCHOR.dataCenterTwh / FLEET_PUE[2024];
  const dataCenterTwh = computingTwh * Math.pow(1 + growthPct / 100, year - DEMAND_ANCHOR.year) * pue;
  const otherTwh = DEMAND_ANCHOR.usTwh - DEMAND_ANCHOR.dataCenterTwh;
  const totalTwh = otherTwh + dataCenterTwh;
  return { year, dataCenterTwh, otherTwh, totalTwh, dataCenterSharePct: (dataCenterTwh / totalTwh) * 100 };
}

/** Average added per year across the timeline (six years, 2025 through 2030). */
export function perScenarioYear(total: number): number {
  return total / SCENARIO_YEARS.length;
}
