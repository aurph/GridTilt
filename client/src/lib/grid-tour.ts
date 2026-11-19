/**
 * "How the grid works": the stops of the map's guided tour.
 *
 * Each stop is a title, two short sentences at most, the regions to light
 * up, the layers to show and where the map goes. A stop states only what the
 * site already sources: the fixed sentences restate the regions' own
 * descriptions and EIA's account of the three interconnections, and every
 * figure comes in through TourFacts, read from the site's data at the time.
 * A caption never carries a number that was not handed in.
 *
 * Pure, so it is unit-tested; the map component only plays it.
 */
import { GRID_REGIONS, type GridRegionId, type Interconnection } from "../data/grid-regions";
import { NERC_LTRA } from "../data/nerc-reserve-margins";
import { regionRiskLevel } from "./grid-regions";
import type { MapLayer } from "./map-layers";
import { SERIES } from "./tokens";

export interface TourFacts {
  /** Regions NERC rates Elevated or High for 2026 in every area it assesses there. */
  elevated: Array<{ id: GridRegionId; name: string }>;
  nercSource: string;
  sites: { count: number; version: string } | null;
  campuses: number | null;
  topSiteRegion: { id: GridRegionId; name: string; count: number } | null;
  queue: { gw: number; asOf: string } | null;
}

/** Regions drawn as one body for a stop, under one name and color. */
export interface TourGroup {
  label: string;
  regions: GridRegionId[];
  color: string;
  /** Where the name is drawn: [lat, lng]. */
  at: [number, number];
}

export interface TourStep {
  id: string;
  title: string;
  caption: string;
  /** Where the stop's facts come from, shown under the caption. */
  source: string;
  sourceHref?: string;
  /** Regions to light up; the rest dim. Null leaves every region as it is. */
  spotlight: GridRegionId[] | null;
  /** When set, the regions are drawn as these bodies instead of one by one. */
  groups?: TourGroup[];
  /** Where the map goes: the whole lower 48, or one region. */
  focus: "all" | GridRegionId;
  layers: MapLayer[];
  stress: boolean;
}

/** "A", "A and B", "A, B and C". */
function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The facts the tour reads, from what the page has loaded so far. */
export function tourFacts(input: {
  siteCount?: number | null;
  sitesVersion?: string | null;
  campusCount?: number | null;
  /** Mapped sites per region (lib/grid-regions regionStats). */
  siteCounts?: Record<GridRegionId, { sites: number | null }> | null;
  queue?: { gw: number; asOf: string } | null;
}): TourFacts {
  const elevated = GRID_REGIONS.filter((r) => {
    const level = regionRiskLevel(r.id);
    return level === "Elevated" || level === "High";
  }).map((r) => ({ id: r.id, name: r.name }));

  let top: TourFacts["topSiteRegion"] = null;
  if (input.siteCounts) {
    for (const r of GRID_REGIONS) {
      const n = input.siteCounts[r.id]?.sites ?? 0;
      if (n > 0 && (!top || n > top.count)) top = { id: r.id, name: r.name, count: n };
    }
  }
  return {
    elevated,
    nercSource: `${NERC_LTRA.short} (${NERC_LTRA.published})`,
    sites: typeof input.siteCount === "number" && input.sitesVersion ? { count: input.siteCount, version: input.sitesVersion } : null,
    campuses: typeof input.campusCount === "number" ? input.campusCount : null,
    topSiteRegion: top,
    queue: input.queue && input.queue.gw > 0 ? input.queue : null,
  };
}

const n = (v: number) => v.toLocaleString("en-US");

/** The three grids, in the order a reader scans the map: west to east, then Texas. */
const INTERCONNECTIONS: Array<{ label: Interconnection; color: string; at: [number, number] }> = [
  { label: "Western", color: SERIES[3], at: [41.2, -113.5] },
  { label: "Eastern", color: SERIES[0], at: [38.6, -86.5] },
  { label: "Texas", color: "#F07800", at: [31.2, -98.9] },
];

export function buildTourSteps(facts: TourFacts): TourStep[] {
  const operators = GRID_REGIONS.filter((r) => r.kind === "market").map((r) => r.id);
  const noMarket = GRID_REGIONS.filter((r) => r.kind === "no-market").map((r) => r.id);

  const dataCenters =
    facts.sites && facts.campuses !== null
      ? `${n(facts.sites.count)} mapped data center sites and ${n(facts.campuses)} tracked campuses.${
          facts.topSiteRegion ? ` ${facts.topSiteRegion.name} holds the most sites, ${n(facts.topSiteRegion.count)}.` : ""
        }`
      : "Data centers cluster where power, fiber and land meet. Each one leans on the region it sits in.";

  return [
    {
      id: "interconnections",
      title: "Three grids, not one",
      caption: "The lower 48 run on three grids that rarely trade power: the Western, the Eastern and Texas. ERCOT runs the Texas one, which makes it an operator and a grid at once.",
      source: "EIA, Energy Explained: how electricity is delivered",
      sourceHref: "https://www.eia.gov/energyexplained/electricity/delivery-to-consumers.php",
      spotlight: null,
      groups: INTERCONNECTIONS.map((g) => ({
        label: g.label,
        color: g.color,
        at: g.at,
        regions: GRID_REGIONS.filter((r) => r.interconnection === g.label).map((r) => r.id),
      })),
      focus: "all",
      layers: ["regions"],
      stress: false,
    },
    {
      id: "operators",
      title: "Market operators",
      caption: "Seven operators, like PJM and MISO, run a wholesale market and direct power plants they do not own. Their lines follow utility territories, so they are approximate.",
      source: "Each operator's own description",
      spotlight: operators,
      focus: "all",
      layers: ["regions"],
      stress: false,
    },
    {
      id: "no-market",
      title: "No market operator",
      caption: "The Southeast and most of the West have none. Utilities there plan and run their own grids and trade with neighbors directly.",
      source: "FERC, electric power markets",
      sourceHref: "https://www.ferc.gov/industries-data/electric/electric-power-markets",
      spotlight: noMarket,
      focus: "all",
      layers: ["regions"],
      stress: false,
    },
    {
      id: "stress",
      title: "Where the grid is tight",
      caption: `A reserve margin is the spare capacity an area expects above its peak demand. NERC rates ${
        facts.elevated.length > 0 ? listOf(facts.elevated.map((r) => r.name)) : "no region"
      } elevated for 2026.`,
      source: facts.nercSource,
      sourceHref: NERC_LTRA.url,
      spotlight: facts.elevated.length > 0 ? facts.elevated.map((r) => r.id) : null,
      focus: "all",
      layers: ["regions"],
      stress: true,
    },
    {
      id: "data-centers",
      title: "Where data centers land",
      caption: dataCenters,
      source: facts.sites
        ? `PNNL IM3 atlas ${facts.sites.version}, © OpenStreetMap contributors; GridTilt registry`
        : "GridTilt registry",
      spotlight: facts.topSiteRegion ? [facts.topSiteRegion.id] : null,
      focus: facts.topSiteRegion ? facts.topSiteRegion.id : "all",
      layers: ["campuses", "sites", "regions"],
      stress: false,
    },
    {
      id: "queue",
      title: "The line to plug in",
      caption: `New plants and large loads wait in an interconnection queue before they can connect.${
        facts.queue ? ` ${n(facts.queue.gw)} GW of projects were waiting nationwide.` : ""
      }`,
      source: facts.queue ? `LBNL Queued Up, ${facts.queue.asOf}` : "LBNL Queued Up",
      sourceHref: "https://emp.lbl.gov/queues",
      spotlight: null,
      focus: "all",
      layers: ["plants", "regions"],
      stress: false,
    },
  ];
}
