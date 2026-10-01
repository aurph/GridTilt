/**
 * US electricity use by year, TWh, and the years a published report estimates
 * data-center use. The landing chart, its preview sparkline and the Overview
 * chart all read this one series; they used to carry three copies that drifted
 * apart (310 TWh of data-center use in 2023 on one, 176 on another).
 *
 * Measurements only. The 2026-2030 "GridTilt projection" rows are gone: they
 * had no stated assumptions and ran to 2,100 TWh of data-center use in 2030,
 * over three times LBNL's reference case.
 */

export interface ElectricityYear {
  year: string;
  /** US electricity end use, TWh. EIA. */
  demand: number | null;
  /** US data-center electricity use, TWh. Null in years no report estimates. */
  dcDemand: number | null;
}

/**
 * EIA Monthly Energy Review, Table 7.1, "Electricity End Use, Total": retail
 * sales plus direct use, billion kWh (= TWh), annual. Retrieved 2026-09-28 from
 * the release carrying data through May 2026. Direct use is electricity
 * generated and used on site. The series previously on the site matched this
 * one through 2022 and then ran 184-295 TWh high for 2023-2025.
 */
export const US_END_USE_SOURCE = {
  label: "EIA Monthly Energy Review, Table 7.1",
  measure: "US electricity end use (retail sales plus direct use)",
  url: "https://www.eia.gov/totalenergy/data/browser/?tbl=T07.01",
  retrieved: "2026-09-28",
} as const;

const US_END_USE_TWH: Array<[string, number]> = [
  ["2010", 3887],
  ["2011", 3883],
  ["2012", 3832],
  ["2013", 3868],
  ["2014", 3903],
  ["2015", 3900],
  ["2016", 3902],
  ["2017", 3864],
  ["2018", 4003],
  ["2019", 3954],
  ["2020", 3856],
  ["2021", 3945],
  ["2022", 4067],
  ["2023", 4011],
  ["2024", 4110],
  ["2025", 4195],
];

export interface DataCenterAnchor {
  year: string;
  twh: number;
  source: string;
  sourceUrl: string;
}

const DOE_2024_REPORT_URL =
  "https://www.energy.gov/articles/doe-releases-new-report-evaluating-increase-electricity-demand-data-centers";

/**
 * The only years with a published figure. Both reports are bottom-up models
 * over shipment data, not metered totals.
 *
 * The two editions differ: the 2025 Update revised years before 2024 slightly
 * below the 2024 Report without restating them one by one. So 176 (old edition)
 * and 192 (new edition) are not a measured one-year change and are drawn as
 * separate points, never joined.
 */
export const DATA_CENTER_ANCHORS: DataCenterAnchor[] = [
  // DOE, December 20, 2024: "climbed from 58 TWh in 2014 to 176 TWh in 2023".
  { year: "2014", twh: 58, source: "LBNL 2024 report (DOE summary)", sourceUrl: DOE_2024_REPORT_URL },
  { year: "2023", twh: 176, source: "LBNL 2024 report (DOE summary)", sourceUrl: DOE_2024_REPORT_URL },
  // LBNL-2001758, published 2026-06-18: 192 TWh in 2024, 4.7% of US use.
  { year: "2024", twh: 192, source: "LBNL 2025 Update", sourceUrl: "https://escholarship.org/uc/item/33m6w3x0" },
];

export const electricityData: ElectricityYear[] = US_END_USE_TWH.map(([year, twh]) => ({
  year,
  demand: twh,
  dcDemand: DATA_CENTER_ANCHORS.find((a) => a.year === year)?.twh ?? null,
}));

export interface DemandAnnotation {
  year: string;
  label: string;
}

/**
 * Only events that moved the measured series. The 2022 (IRA, ChatGPT) and 2024
 * (TMI restart, SMR deal) markers came off: they are not demand events, and
 * drawing them on a demand line implied they caused its moves.
 */
export const demandAnnotations: DemandAnnotation[] = [
  { year: "2020", label: "COVID demand drop" },
];
