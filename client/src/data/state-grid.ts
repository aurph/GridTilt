/**
 * State -> primary grid operator, for the My Grid page. Keys into
 * RTO_CONFIG where a NERC-assessed region applies. This is a deliberate
 * simplification: several states sit in more than one market, and the
 * split is stated in `note` rather than hidden. Alaska and Hawaii run
 * their own interconnections and carry no regional key.
 *
 * Sources: FERC and EIA RTO/ISO footprint maps; NERC regional boundaries.
 *
 * Verified 2026-07-27: all 51 primary assignments checked against FERC,
 * EIA, RTO membership pages, and state PSC sources (session audit). Known
 * seams as of the SPP RTO West launch (April 2026) are reflected in notes.
 */

export interface StateGrid {
  name: string;
  /** key into RTO_CONFIG, or null when no assessed region applies */
  region: string | null;
  /** what a resident would call it, when the region key is coarse */
  operatorLabel: string;
  note?: string;
}

export const STATE_GRID: Record<string, StateGrid> = {
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

export const STATE_GRID_SOURCE = "FERC and EIA RTO/ISO footprints; NERC regional boundaries; primary operator shown, splits noted";
