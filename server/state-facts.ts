// ─── State grid facts (server copy) ──────────────────────────────────────────
//
// What My Grid shows about a state's grid, for the state share card
// (/api/og?template=state_fact&state=XX): the primary operator from
// client/src/data/state-grid.ts and the NERC 2025 LTRA areas from
// client/src/data/nerc-reserve-margins.ts. Copied, not imported, because
// nothing is shared between client and server in this project.
// server/__tests__/state-facts.test.ts fails when the copies drift, so change
// both together.

export type NercRisk = "Normal" | "Elevated" | "High";

export interface StateGridFact {
  name: string;
  /** One of the seven map regions, or null when no assessed region applies. */
  region: string | null;
  operatorLabel: string;
  /** Where the state sits in more than one market, as My Grid states it. */
  note?: string;
}

export interface NercAreaFact {
  key: string;
  label: string;
  season: "summer 2026" | "winter 2026-27";
  margin: number;
  reference: number;
  /** NERC applied its 15% default because the area sets no reference level. */
  referenceDefault?: boolean;
  risk: NercRisk;
  outlook?: string;
}

export const NERC_LTRA = {
  label: "NERC 2025 Long-Term Reliability Assessment (January 2026)",
  short: "NERC 2025 LTRA",
  url: "https://www.nerc.com/globalassets/our-work/assessments/nerc_ltra_2025.pdf",
  published: "2026-01",
} as const;

/** client/src/data/state-grid.ts STATE_GRID_SOURCE, verbatim. */
export const STATE_GRID_SOURCE = "FERC and EIA RTO/ISO footprints; NERC regional boundaries; primary operator shown, splits noted";

export const STATES: Record<string, StateGridFact> = {
  AL: { name: "Alabama", region: "SERC", operatorLabel: "Southern Company territory (SERC)" },
  AK: { name: "Alaska", region: null, operatorLabel: "Alaska's own interconnections", note: "Alaska is not connected to the lower-48 grid and has no regional market." },
  AZ: { name: "Arizona", region: "WECC", operatorLabel: "Western grid (WECC), utility-run" },
  AR: { name: "Arkansas", region: "MISO", operatorLabel: "MISO South" },
  CA: { name: "California", region: "WECC", operatorLabel: "CAISO, within the Western grid", note: "CAISO runs most of California; NERC assesses reliability at the WECC level shown here." },
  CO: { name: "Colorado", region: "WECC", operatorLabel: "Western grid (WECC), utility-run" },
  CT: { name: "Connecticut", region: "NPCC", operatorLabel: "ISO New England" },
  DE: { name: "Delaware", region: "PJM", operatorLabel: "PJM Interconnection" },
  DC: { name: "District of Columbia", region: "PJM", operatorLabel: "PJM Interconnection" },
  FL: { name: "Florida", region: "SERC", operatorLabel: "Florida utilities (SERC)" },
  GA: { name: "Georgia", region: "SERC", operatorLabel: "Southern Company territory (SERC)" },
  HI: { name: "Hawaii", region: null, operatorLabel: "Hawaii's island grids", note: "Each Hawaiian island runs its own grid; there is no regional market." },
  ID: { name: "Idaho", region: "WECC", operatorLabel: "Western grid (WECC), utility-run" },
  IL: { name: "Illinois", region: "PJM", operatorLabel: "PJM (north), MISO (downstate)", note: "Northern Illinois including Chicago is PJM; most of downstate is MISO. Figures shown are PJM." },
  IN: { name: "Indiana", region: "MISO", operatorLabel: "MISO" },
  IA: { name: "Iowa", region: "MISO", operatorLabel: "MISO" },
  KS: { name: "Kansas", region: "SPP", operatorLabel: "Southwest Power Pool" },
  KY: { name: "Kentucky", region: "SERC", operatorLabel: "Kentucky utilities (SERC)", note: "Kentucky utilities sit across SERC, PJM, and MISO seams. Figures shown are SERC." },
  LA: { name: "Louisiana", region: "MISO", operatorLabel: "MISO South" },
  ME: { name: "Maine", region: "NPCC", operatorLabel: "ISO New England" },
  MD: { name: "Maryland", region: "PJM", operatorLabel: "PJM Interconnection" },
  MA: { name: "Massachusetts", region: "NPCC", operatorLabel: "ISO New England" },
  MI: { name: "Michigan", region: "MISO", operatorLabel: "MISO" },
  MN: { name: "Minnesota", region: "MISO", operatorLabel: "MISO" },
  MS: { name: "Mississippi", region: "MISO", operatorLabel: "MISO South", note: "Central and western Mississippi is MISO (Entergy); the northeast is TVA and the southeast is Mississippi Power, both outside RTO markets. Figures shown are MISO." },
  MO: { name: "Missouri", region: "MISO", operatorLabel: "MISO (east), SPP (west)", note: "Eastern Missouri is MISO; western utilities are SPP; much of rural Missouri is served by Associated Electric, which runs its own balancing area outside both markets. Figures shown are MISO." },
  MT: { name: "Montana", region: "WECC", operatorLabel: "Western grid (WECC)", note: "Most of Montana is on the Western grid, since April 2026 operated within SPP's western RTO; the eastern edge sits in MISO and SPP." },
  NE: { name: "Nebraska", region: "SPP", operatorLabel: "Southwest Power Pool" },
  NV: { name: "Nevada", region: "WECC", operatorLabel: "Western grid (WECC), utility-run" },
  NH: { name: "New Hampshire", region: "NPCC", operatorLabel: "ISO New England" },
  NJ: { name: "New Jersey", region: "PJM", operatorLabel: "PJM Interconnection" },
  NM: { name: "New Mexico", region: "WECC", operatorLabel: "Western grid (WECC)", note: "Most of New Mexico is on the Western grid; the eastern edge is SPP." },
  NY: { name: "New York", region: "NPCC", operatorLabel: "NYISO" },
  NC: { name: "North Carolina", region: "SERC", operatorLabel: "Duke territory (SERC)" },
  ND: { name: "North Dakota", region: "MISO", operatorLabel: "MISO (east), SPP (west)", note: "North Dakota splits nearly evenly: MISO serves the east including most population centers, SPP the west including oil-field load. Figures shown are MISO." },
  OH: { name: "Ohio", region: "PJM", operatorLabel: "PJM Interconnection" },
  OK: { name: "Oklahoma", region: "SPP", operatorLabel: "Southwest Power Pool" },
  OR: { name: "Oregon", region: "WECC", operatorLabel: "Western grid (WECC), utility-run" },
  PA: { name: "Pennsylvania", region: "PJM", operatorLabel: "PJM Interconnection" },
  RI: { name: "Rhode Island", region: "NPCC", operatorLabel: "ISO New England" },
  SC: { name: "South Carolina", region: "SERC", operatorLabel: "South Carolina utilities (SERC)" },
  SD: { name: "South Dakota", region: "SPP", operatorLabel: "SPP (most of the state), MISO (eastern edge)", note: "Figures shown are SPP." },
  TN: { name: "Tennessee", region: "SERC", operatorLabel: "TVA territory (SERC)" },
  TX: { name: "Texas", region: "ERCOT", operatorLabel: "ERCOT", note: "Most of Texas is ERCOT; the Panhandle and eastern edges sit in SPP and MISO, and El Paso is on the Western grid." },
  UT: { name: "Utah", region: "WECC", operatorLabel: "Western grid (WECC), utility-run" },
  VT: { name: "Vermont", region: "NPCC", operatorLabel: "ISO New England" },
  VA: { name: "Virginia", region: "PJM", operatorLabel: "PJM Interconnection" },
  WA: { name: "Washington", region: "WECC", operatorLabel: "Western grid (WECC), utility-run" },
  WV: { name: "West Virginia", region: "PJM", operatorLabel: "PJM Interconnection" },
  WI: { name: "Wisconsin", region: "MISO", operatorLabel: "MISO" },
  WY: { name: "Wyoming", region: "WECC", operatorLabel: "Western grid (WECC), utility-run" },
};

export const NERC_AREAS: Record<string, NercAreaFact> = {
  "PJM": { key: "PJM", label: "PJM", season: "summer 2026", margin: 29.7, reference: 18.6, risk: "Elevated", outlook: "High from 2029" },
  "MISO": { key: "MISO", label: "MISO", season: "summer 2026", margin: 11, reference: 8.1, risk: "Normal", outlook: "Elevated in 2027, High from 2028" },
  "Texas RE-ERCOT": { key: "Texas RE-ERCOT", label: "ERCOT", season: "summer 2026", margin: 28.2, reference: 13.75, risk: "Elevated", outlook: "High from 2029" },
  "MRO-SPP": { key: "MRO-SPP", label: "SPP", season: "summer 2026", margin: 32.4, reference: 19, risk: "Elevated", outlook: "Elevated through 2030" },
  "NPCC-New England": { key: "NPCC-New England", label: "New England", season: "summer 2026", margin: 18.3, reference: 13.4, risk: "Normal", outlook: "Elevated from 2029" },
  "NPCC-New York": { key: "NPCC-New York", label: "New York", season: "summer 2026", margin: 22.3, reference: 15, risk: "Elevated", outlook: "Elevated through 2030" },
  "SERC-Central": { key: "SERC-Central", label: "SERC-Central", season: "summer 2026", margin: 19.1, reference: 15, referenceDefault: true, risk: "Normal" },
  "SERC-East": { key: "SERC-East", label: "SERC-East", season: "summer 2026", margin: 30.6, reference: 15, referenceDefault: true, risk: "Normal", outlook: "Elevated from 2027" },
  "SERC-Florida Peninsula": { key: "SERC-Florida Peninsula", label: "Florida Peninsula", season: "summer 2026", margin: 27.4, reference: 15, risk: "Normal" },
  "SERC-Southeast": { key: "SERC-Southeast", label: "SERC-Southeast", season: "summer 2026", margin: 40.1, reference: 15, referenceDefault: true, risk: "Normal" },
  "WECC-Basin": { key: "WECC-Basin", label: "WECC-Basin", season: "summer 2026", margin: 36.3, reference: 13.5, risk: "Elevated", outlook: "High from 2029" },
  "WECC-California": { key: "WECC-California", label: "California", season: "summer 2026", margin: 53.2, reference: 20.3, risk: "Normal" },
  "WECC-Rocky Mountain": { key: "WECC-Rocky Mountain", label: "WECC-Rocky Mountain", season: "summer 2026", margin: 51.3, reference: 17.8, risk: "Normal" },
  "WECC-Southwest": { key: "WECC-Southwest", label: "WECC-Southwest", season: "summer 2026", margin: 41.1, reference: 13.3, risk: "Normal" },
  "WECC-Northwest": { key: "WECC-Northwest", label: "WECC-Northwest", season: "winter 2026-27", margin: 30.2, reference: 17.8, risk: "Normal", outlook: "High from 2029" },
};

export const REGION_AREAS: Record<string, string[]> = {
  PJM: ["PJM"],
  MISO: ["MISO"],
  ERCOT: ["Texas RE-ERCOT"],
  SPP: ["MRO-SPP"],
  NPCC: ["NPCC-New England", "NPCC-New York"],
  SERC: ["SERC-Central", "SERC-East", "SERC-Florida Peninsula", "SERC-Southeast"],
  WECC: ["WECC-Basin", "WECC-California", "WECC-Northwest", "WECC-Rocky Mountain", "WECC-Southwest"],
};

export const STATE_NERC_AREA: Record<string, string> = {
  CT: "NPCC-New England",
  ME: "NPCC-New England",
  MA: "NPCC-New England",
  NH: "NPCC-New England",
  RI: "NPCC-New England",
  VT: "NPCC-New England",
  NY: "NPCC-New York",
  AL: "SERC-Southeast",
  GA: "SERC-Southeast",
  FL: "SERC-Florida Peninsula",
  NC: "SERC-East",
  SC: "SERC-East",
  TN: "SERC-Central",
  KY: "SERC-Central",
  AZ: "WECC-Southwest",
  NM: "WECC-Southwest",
  NV: "WECC-Southwest",
  CA: "WECC-California",
  CO: "WECC-Rocky Mountain",
  WY: "WECC-Rocky Mountain",
  ID: "WECC-Basin",
  UT: "WECC-Basin",
  MT: "WECC-Northwest",
  OR: "WECC-Northwest",
  WA: "WECC-Northwest",
};

/** Where another NERC area covers part of the state. */
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

/** Points of margin above the area's own reference level, as My Grid prints it. */
export function cushion(a: NercAreaFact): number {
  return +(a.margin - a.reference).toFixed(2);
}

/**
 * The NERC area for a state: its listed sub-area, or the one area of its
 * region. Null when the state sits in a multi-area region with no listed
 * area, or has no assessed region (Alaska, Hawaii). Same rule as
 * areaForState in client/src/lib/reserve-margins.ts.
 */
export function areaForState(code: string): NercAreaFact | null {
  const listed = STATE_NERC_AREA[code];
  if (listed) return NERC_AREAS[listed] ?? null;
  const region = STATES[code]?.region;
  const areas = region ? (REGION_AREAS[region] ?? []).map((k) => NERC_AREAS[k]).filter(Boolean) : [];
  return areas.length === 1 ? areas[0] : null;
}
