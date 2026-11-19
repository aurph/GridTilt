/**
 * The nine grid regions the map teaches.
 *
 * A normal reader thinks in the operators (ERCOT, PJM, CAISO), so the regions
 * are the seven market operators plus the two parts of the lower 48 that have
 * none: the Southeast and the West outside CAISO. Florida sits in the
 * Southeast. NERC's reliability regions appear only as the source of each
 * region's stress reading (`nercAreas`).
 *
 * Descriptions say what each organization is, as it describes itself on its
 * own "about" page (each checked on REGIONS_CHECKED). Dated figures do not go
 * here: live demand, reserve margins and counts are read beside the text from
 * their own sources, and a number in this prose would go stale next to them.
 *
 * Shapes: client/public/geo/grid-regions.json, built by
 * scripts/build-grid-regions.mjs. They are approximate (BOUNDARY_NOTE).
 */
import { SERIES } from "../lib/tokens";

export const GRID_REGION_IDS = ["pjm", "ercot", "miso", "spp", "caiso", "nyiso", "isone", "southeast", "west"] as const;
export type GridRegionId = (typeof GRID_REGION_IDS)[number];

/** The three grids of the lower 48. Texas is ERCOT's. */
export type Interconnection = "Eastern" | "Western" | "Texas";

export interface GridRegion {
  /** Also the page address: /region/<id>. */
  id: GridRegionId;
  /** The short name people say. */
  name: string;
  fullName: string;
  /** A market operator runs a wholesale market here, or none does. */
  kind: "market" | "no-market";
  /**
   * Which of the three grids of the lower 48 it is on (EIA, Energy Explained:
   * how electricity is delivered). SPP is filed under Eastern, where nearly
   * all of it is; the western part it began operating in April 2026 is not in
   * the drawn shape (BOUNDARY_NOTE).
   */
  interconnection: Interconnection;
  /** The states it covers, in words. */
  states: string;
  description: string;
  /** The organization's own page the description was checked against. */
  about: { label: string; url: string };
  /** The key this region's hourly demand and fuel mix are served under (server/eia-grid.ts). */
  liveKey: string;
  /** NERC assessment areas whose reserve margins and risk levels cover it. */
  nercAreas: string[];
  /** Said beside the stress reading where NERC's areas and the region do not line up. */
  nercNote?: string;
  /** Identity hue: region fill, chips and table rows. */
  color: string;
  /** Where the short name is drawn at a national zoom: [lat, lng], inside the region. */
  labelAt: [number, number];
}

/** The day every description below was last checked against the organization's own page. */
export const REGIONS_CHECKED = "2026-11-18";

export const GRID_REGIONS: GridRegion[] = [
  {
    id: "pjm",
    name: "PJM",
    fullName: "PJM Interconnection",
    kind: "market",
    interconnection: "Eastern",
    states: "Delaware, Maryland, New Jersey, Ohio, Pennsylvania, Virginia, West Virginia and DC, and parts of Illinois, Indiana, Kentucky, Michigan, North Carolina and Tennessee",
    description:
      "PJM Interconnection runs the high-voltage grid and a wholesale electricity market in all or parts of 13 states and the District of Columbia. It does not own power lines or power plants; it directs their operation for many owners.",
    about: { label: "pjm.com: Who we are", url: "https://www.pjm.com/about-pjm/who-we-are" },
    liveKey: "PJM",
    nercAreas: ["PJM"],
    color: SERIES[0],
    labelAt: [40.4, -79.2],
  },
  {
    id: "ercot",
    name: "ERCOT",
    fullName: "Electric Reliability Council of Texas",
    kind: "market",
    interconnection: "Texas",
    states: "Most of Texas",
    description:
      "ERCOT runs the grid and wholesale electricity market for most of Texas. Its grid is a separate interconnection from the rest of the country's, with only small ties to its neighbors.",
    about: { label: "ercot.com: About ERCOT", url: "https://www.ercot.com/about" },
    liveKey: "ERCOT",
    nercAreas: ["Texas RE-ERCOT"],
    color: SERIES[2],
    labelAt: [31.3, -98.9],
  },
  {
    id: "miso",
    name: "MISO",
    fullName: "Midcontinent Independent System Operator",
    kind: "market",
    interconnection: "Eastern",
    states: "All or parts of Arkansas, Illinois, Indiana, Iowa, Kentucky, Louisiana, Michigan, Minnesota, Mississippi, Missouri, Montana, North Dakota, South Dakota, Texas and Wisconsin",
    description:
      "MISO runs the high-voltage grid and a wholesale electricity market across 15 US states, from Minnesota to Louisiana, and the Canadian province of Manitoba.",
    about: { label: "misoenergy.org: About MISO", url: "https://www.misoenergy.org/meet-miso/about-miso/" },
    liveKey: "MISO",
    nercAreas: ["MISO"],
    color: SERIES[1],
    labelAt: [44.3, -91.3],
  },
  {
    id: "spp",
    name: "SPP",
    fullName: "Southwest Power Pool",
    kind: "market",
    interconnection: "Eastern",
    states: "Kansas, Nebraska, Oklahoma, the Dakotas and parts of the neighboring states; since April 2026, parts of the West as well",
    description:
      "Southwest Power Pool runs the high-voltage grid and a wholesale electricity market across the central United States. Since April 2026 it also operates part of the western grid, the first operator to work in both.",
    about: { label: "spp.org: About us", url: "https://www.spp.org/about-us/" },
    liveKey: "SPP",
    nercAreas: ["MRO-SPP"],
    color: SERIES[5],
    labelAt: [38.9, -99.4],
  },
  {
    id: "caiso",
    name: "CAISO",
    fullName: "California Independent System Operator",
    kind: "market",
    interconnection: "Western",
    states: "Most of California and a small part of Nevada",
    description:
      "The California ISO manages the flow of electricity on the high-voltage lines serving most of California and runs a wholesale electricity market. Los Angeles, Sacramento and a few other areas run their own grids outside it.",
    about: { label: "caiso.com: About", url: "https://www.caiso.com/about" },
    liveKey: "CAISO",
    nercAreas: ["WECC-California"],
    nercNote: "NERC assesses California as one area, which includes the utilities outside CAISO.",
    color: SERIES[8],
    labelAt: [36.9, -120.4],
  },
  {
    id: "nyiso",
    name: "NYISO",
    fullName: "New York Independent System Operator",
    kind: "market",
    interconnection: "Eastern",
    states: "New York",
    description:
      "The New York ISO operates New York State's high-voltage grid and runs its wholesale electricity markets. It does not own power lines or power plants.",
    about: { label: "nyiso.com: What we do", url: "https://www.nyiso.com/what-we-do" },
    liveKey: "NYISO",
    nercAreas: ["NPCC-New York"],
    color: SERIES[6],
    labelAt: [42.9, -75.6],
  },
  {
    id: "isone",
    name: "ISO-NE",
    fullName: "ISO New England",
    kind: "market",
    interconnection: "Eastern",
    states: "Connecticut, Maine, Massachusetts, New Hampshire, Rhode Island and Vermont",
    description:
      "ISO New England keeps electricity flowing across the six New England states. It operates the grid, runs the wholesale electricity markets and plans the power system.",
    about: { label: "iso-ne.com: About us", url: "https://www.iso-ne.com/about" },
    liveKey: "ISO-NE",
    nercAreas: ["NPCC-New England"],
    color: SERIES[7],
    labelAt: [44.7, -69.4],
  },
  {
    id: "southeast",
    name: "Southeast",
    fullName: "The Southeast",
    kind: "no-market",
    interconnection: "Eastern",
    states: "Alabama, Florida, Georgia, South Carolina and Tennessee, and parts of Kentucky, Mississippi, Missouri and North Carolina",
    description:
      "The Southeast has no regional market operator. Utilities and public power such as Southern Company, Duke Energy, the Tennessee Valley Authority and Florida Power & Light plan and run their own grids, and trade with their neighbors directly.",
    about: { label: "ferc.gov: Electric power markets, Southeast", url: "https://www.ferc.gov/industries-data/electric/electric-power-markets" },
    liveKey: "SOUTHEAST",
    nercAreas: ["SERC-Central", "SERC-East", "SERC-Florida Peninsula", "SERC-Southeast"],
    nercNote: "NERC assesses the Southeast in four areas, each against its own reference margin.",
    color: SERIES[4],
    labelAt: [32.9, -84.6],
  },
  {
    id: "west",
    name: "West",
    fullName: "The West outside CAISO",
    kind: "no-market",
    interconnection: "Western",
    states: "Arizona, Colorado, Idaho, Montana, Nevada, New Mexico, Oregon, Utah, Washington and Wyoming, and the parts of California outside CAISO",
    description:
      "Outside California, most of the West has no regional market operator. Utilities and federal power agencies such as the Bonneville Power Administration, PacifiCorp and Arizona Public Service run their own grids. In April 2026 Southwest Power Pool began operating part of it.",
    about: { label: "ferc.gov: Electric power markets, West", url: "https://www.ferc.gov/industries-data/electric/electric-power-markets" },
    liveKey: "WEST",
    nercAreas: ["WECC-Basin", "WECC-Northwest", "WECC-Rocky Mountain", "WECC-Southwest"],
    nercNote: "NERC assesses the West outside California in four areas, each against its own reference margin.",
    color: SERIES[3],
    labelAt: [41.4, -113.6],
  },
];

const BY_ID = Object.fromEntries(GRID_REGIONS.map((r) => [r.id, r])) as Record<GridRegionId, GridRegion>;

export function gridRegion(id: GridRegionId): GridRegion {
  return BY_ID[id];
}

/**
 * Region page addresses that were NERC regions before the pages were rebuilt
 * around operators, and the page that holds them now. NPCC is two operators
 * (NYISO and ISO-NE), so it keeps a short page of its own instead.
 */
export const REGION_SLUG_ALIASES: Record<string, GridRegionId> = { serc: "southeast", wecc: "west" };

/** Where the lines come from and how far to trust them. Shown wherever the regions are drawn. */
export const BOUNDARY_NOTE =
  "Region lines are approximate. Operator footprints follow utility service territories and interleave at the edges; where two overlap, the smaller is drawn on top. The source predates Southwest Power Pool's April 2026 expansion into the West.";

export const BOUNDARY_SOURCE = {
  label: "HIFLD Independent System Operators (Oak Ridge National Laboratory, 2020)",
  url: "https://services8.arcgis.com/Rl9BjEMrBgxxeBfh/arcgis/rest/services/Independent_System_Operator/FeatureServer/0",
} as const;

/**
 * The EIA balancing authorities behind each region. A power plant reports
 * one (Form EIA-860M), and that says whose grid it is on better than where
 * its dot falls on approximate lines. The seven operators are one authority
 * each. The Southeast is EIA's Southeast, Carolinas, Florida and Tennessee
 * regions plus LG&E and KU and Associated Electric Cooperative; the West is
 * EIA's Northwest and Southwest regions plus the California authorities
 * outside CAISO. The live demand feed sums the same ones (server/eia-grid.ts).
 *
 * Source: EIA-930 reference tables, the "BAs" sheet, retrieved 2026-11-19
 * (https://www.eia.gov/electricity/930-content/EIA930_Reference_Tables.xlsx),
 * retired authorities included because an older plant record can still name
 * one. An authority in no list here (SPA, SIKE, GLHB: small ones inside an
 * operator's footprint) is placed as drawn.
 */
export const REGION_AUTHORITIES: Record<GridRegionId, readonly string[]> = {
  pjm: ["PJM"],
  ercot: ["ERCO"],
  miso: ["MISO"],
  spp: ["SWPP"],
  caiso: ["CISO"],
  nyiso: ["NYIS"],
  isone: ["ISNE"],
  southeast: [
    "AEC", "AECI", "CPLE", "CPLW", "DUK", "FMPP", "FPC", "FPL", "GVL", "HST", "JEA", "LGEE", "NSB", "SC", "SCEG", "SEC", "SEPA", "SOCO", "TAL",
    "TEC", "TVA", "YAD",
  ],
  west: [
    "AVA", "AVRN", "AZPS", "BANC", "BHBA", "BPAT", "CHPD", "DEAA", "DOPD", "EPE", "GCPD", "GRID", "GRIF", "GRMA", "GWA", "HGMA", "IID", "IPCO",
    "LDWP", "NEVP", "NWMT", "PACE", "PACW", "PGE", "PNM", "PSCO", "PSEI", "SCL", "SRP", "SWPW", "TEPC", "TIDC", "TPWR", "WACM", "WALC", "WAUE",
    "WAUW", "WWA",
  ],
};
