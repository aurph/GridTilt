/**
 * Reserve margins from NERC's 2025 Long-Term Reliability Assessment (released
 * January 29, 2026), Table 2 and each assessment area's dashboard: summer 2026,
 * or winter 2026-27 for an area that peaks in winter. One source for the Power
 * map, the Overview headroom gauge, My Grid and the region pages.
 *
 * The figures this replaced were labeled "NERC LTRA 2025 (2026 projections)"
 * but matched neither the 2025 nor the 2024 report (PJM 17.5% where NERC has
 * 29.7%, MISO 13.4% for 11.0%, ERCOT 15.8% for 28.2%, SPP 27.8% for 32.4%),
 * gave one figure each for WECC, SERC and NPCC, which NERC reports only by
 * sub-area, and carried a GridTilt "AI load signal" that contradicted NERC's
 * own risk ratings. Checked 2026-09-29.
 *
 * NERC judges each area against its own reference margin level (7.8% to 20.3%
 * across areas; 15% where an area sets none), and its risk ratings also weigh
 * extreme weather and energy limits. A lower margin is not by itself a higher
 * risk.
 */

export type NercRisk = "Normal" | "Elevated" | "High";

export interface NercArea {
  /** NERC's assessment area name. */
  key: string;
  /** Short display label. */
  label: string;
  season: "summer 2026" | "winter 2026-27";
  /** Anticipated reserve margin, percent. */
  margin: number;
  /** Reference margin level, percent. */
  reference: number;
  /** NERC applied its 15% default because the area sets no reference level. */
  referenceDefault?: boolean;
  /** NERC's risk level for 2026. */
  risk: NercRisk;
  /** Later years, as NERC rates them. */
  outlook?: string;
  /** Page of the area's dashboard in the report. */
  page: number;
  note?: string;
}

export const NERC_LTRA = {
  label: "NERC 2025 Long-Term Reliability Assessment (January 2026)",
  short: "NERC 2025 LTRA",
  url: "https://www.nerc.com/globalassets/our-work/assessments/nerc_ltra_2025.pdf",
  /** YYYY-MM the report was published; dates every card and page that cites it. */
  published: "2026-01",
} as const;

const area = (a: NercArea): [string, NercArea] => [a.key, a];

export const NERC_AREAS: Record<string, NercArea> = Object.fromEntries([
  area({ key: "PJM", label: "PJM", season: "summer 2026", margin: 29.7, reference: 18.6, risk: "Elevated", outlook: "High from 2029", page: 90 }),
  area({ key: "MISO", label: "MISO", season: "summer 2026", margin: 11.0, reference: 8.1, risk: "Normal", outlook: "Elevated in 2027, High from 2028", page: 42 }),
  area({ key: "Texas RE-ERCOT", label: "ERCOT", season: "summer 2026", margin: 28.2, reference: 13.75, risk: "Elevated", outlook: "High from 2029", page: 128 }),
  area({ key: "MRO-SPP", label: "SPP", season: "summer 2026", margin: 32.4, reference: 19.0, risk: "Elevated", outlook: "Elevated through 2030", page: 59 }),
  area({ key: "NPCC-New England", label: "New England", season: "summer 2026", margin: 18.3, reference: 13.4, risk: "Normal", outlook: "Elevated from 2029", page: 68 }),
  area({ key: "NPCC-New York", label: "New York", season: "summer 2026", margin: 22.3, reference: 15.0, risk: "Elevated", outlook: "Elevated through 2030", page: 74 }),
  area({ key: "SERC-Central", label: "SERC-Central", season: "summer 2026", margin: 19.1, reference: 15.0, referenceDefault: true, risk: "Normal", page: 95 }),
  area({ key: "SERC-East", label: "SERC-East", season: "summer 2026", margin: 30.6, reference: 15.0, referenceDefault: true, risk: "Normal", outlook: "Elevated from 2027", page: 102 }),
  area({ key: "SERC-Florida Peninsula", label: "Florida Peninsula", season: "summer 2026", margin: 27.4, reference: 15.0, risk: "Normal", page: 112 }),
  area({
    key: "SERC-Southeast", label: "SERC-Southeast", season: "summer 2026", margin: 40.1, reference: 15.0, referenceDefault: true, risk: "Normal", page: 120,
    note: "NERC's summary table (Table 2) shows 35.9%; the area's own table shows 40.1%.",
  }),
  area({ key: "WECC-Basin", label: "WECC-Basin", season: "summer 2026", margin: 36.3, reference: 13.5, risk: "Elevated", outlook: "High from 2029", page: 138 }),
  area({ key: "WECC-California", label: "California", season: "summer 2026", margin: 53.2, reference: 20.3, risk: "Normal", page: 147 }),
  area({ key: "WECC-Rocky Mountain", label: "WECC-Rocky Mountain", season: "summer 2026", margin: 51.3, reference: 17.8, risk: "Normal", page: 159 }),
  area({ key: "WECC-Southwest", label: "WECC-Southwest", season: "summer 2026", margin: 41.1, reference: 13.3, risk: "Normal", page: 163 }),
  area({ key: "WECC-Northwest", label: "WECC-Northwest", season: "winter 2026-27", margin: 30.2, reference: 17.8, risk: "Normal", outlook: "High from 2029", page: 154 }),
]);

/**
 * The site's seven map regions and the NERC areas inside them. PJM, MISO,
 * ERCOT and SPP are one assessment area each; SERC, WECC and NPCC are reported
 * only by sub-area, so they never get one figure of their own.
 */
export const REGION_AREAS: Record<string, string[]> = {
  PJM: ["PJM"],
  MISO: ["MISO"],
  ERCOT: ["Texas RE-ERCOT"],
  SPP: ["MRO-SPP"],
  NPCC: ["NPCC-New England", "NPCC-New York"],
  SERC: ["SERC-Central", "SERC-East", "SERC-Florida Peninsula", "SERC-Southeast"],
  WECC: ["WECC-Basin", "WECC-California", "WECC-Northwest", "WECC-Rocky Mountain", "WECC-Southwest"],
};

/**
 * State (two-letter code) -> the NERC assessment area covering most of it, for
 * the states in the multi-area regions (SERC, WECC, NPCC). From the LTRA's area
 * descriptions (pp. 68, 74, 95, 102, 112, 120, 138, 147, 154, 159, 163), its
 * area map (p. 41) and SERC's 2025 Winter Reliability Assessment for Florida,
 * which the LTRA does not describe. Checked 2026-09-29. States in PJM, MISO,
 * ERCOT and SPP take that region's one area (areaForState in
 * lib/reserve-margins.ts).
 */
export const STATE_NERC_AREA: Record<string, string> = {
  CT: "NPCC-New England", ME: "NPCC-New England", MA: "NPCC-New England",
  NH: "NPCC-New England", RI: "NPCC-New England", VT: "NPCC-New England",
  NY: "NPCC-New York",
  AL: "SERC-Southeast", GA: "SERC-Southeast",
  FL: "SERC-Florida Peninsula",
  NC: "SERC-East", SC: "SERC-East",
  TN: "SERC-Central", KY: "SERC-Central",
  AZ: "WECC-Southwest", NM: "WECC-Southwest", NV: "WECC-Southwest",
  CA: "WECC-California",
  CO: "WECC-Rocky Mountain", WY: "WECC-Rocky Mountain",
  ID: "WECC-Basin", UT: "WECC-Basin",
  MT: "WECC-Northwest", OR: "WECC-Northwest", WA: "WECC-Northwest",
};

/** Where another NERC area covers part of the state (same sources). */
export const STATE_NERC_NOTE: Record<string, string> = {
  AL: "North Alabama (TVA) is in SERC-Central.",
  GA: "North Georgia (TVA) is in SERC-Central.",
  FL: "The western panhandle is in SERC-Southeast.",
  NC: "The northeast is in PJM and the far west in SERC-Central.",
  TN: "A northeastern sliver is in PJM.",
  KY: "About two-thirds of Kentucky's land is in PJM and the west is in MISO; SERC-Central covers LG&E-KU and TVA.",
  NM: "The eastern edge is in SPP.",
  NV: "A small section is in WECC-California.",
  CA: "The far north is in WECC-Northwest and the southeast corner in WECC-Southwest.",
  WY: "The west is in WECC-Basin.",
  ID: "Northern Idaho is in WECC-Northwest.",
  MT: "The eastern edge is in SPP and MISO.",
};
