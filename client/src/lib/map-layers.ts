/**
 * The map's layers and how they live in the address bar.
 *
 * Every layer draws by default; the Layers control turns them off. State is
 * `?layers=` (a comma list, absent when everything is on), `?stress=1` (the
 * regions colored by NERC's risk levels) and `?region=` (the selected
 * region). The map used to have three views that never drew together
 * (`?view=dc|clusters|stress`) and a region filter (`?rtos=`); links that
 * carry those still land on the nearest layer set.
 *
 * Pure, so it is unit-tested (this repo has no DOM tests).
 */
import type { GridRegionId } from "../data/grid-regions";
import { regionIdForSlug } from "./grid-regions";
import { MIN_TRACKED_MW } from "./real-gauges";

/** In drawing order, bottom of the legend to top of the map aside. */
export const MAP_LAYERS = ["campuses", "sites", "clusters", "plants", "regions"] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];

export const DEFAULT_LAYERS: readonly MapLayer[] = MAP_LAYERS;

export const LAYER_LABEL: Record<MapLayer, string> = {
  campuses: "Tracked campuses",
  sites: "Data center sites",
  clusters: "AI clusters",
  plants: "Power plants",
  regions: "Grid regions",
};

export interface MapView {
  layers: MapLayer[];
  /** Color the regions by NERC's risk levels. */
  stress: boolean;
  region: GridRegionId | null;
}

function paramsOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

const inOrder = (set: Set<string>): MapLayer[] => MAP_LAYERS.filter((l) => set.has(l));

/** The old region filter's names, where one of them is one region today. */
const OLD_RTO: Record<string, string> = { PJM: "pjm", MISO: "miso", ERCOT: "ercot", SPP: "spp", SERC: "serc", WECC: "wecc" };

export function parseMapView(search: string): MapView {
  const params = paramsOf(search);
  const oldView = params.get("view");

  let layers: MapLayer[] = [...DEFAULT_LAYERS];
  const raw = params.get("layers");
  if (raw !== null) {
    layers = inOrder(new Set(raw.split(",").map((s) => s.trim())));
  } else if (oldView === "clusters") {
    // The AI Clusters view drew the clusters over the region fills.
    layers = ["clusters", "regions"];
  }

  const stress = params.has("stress") ? params.get("stress") === "1" : raw === null && oldView === "stress";

  let region = regionIdForSlug(params.get("region"));
  if (!params.has("region")) {
    const rtos = (params.get("rtos") ?? "").split(",").filter(Boolean);
    region = rtos.length === 1 ? regionIdForSlug(OLD_RTO[rtos[0]] ?? null) : null;
  }
  return { layers, stress, region };
}

/** The query for a view, without the leading "?": empty for the default view. */
export function mapViewQuery(view: MapView): string {
  const params = new URLSearchParams();
  const isDefault = view.layers.length === DEFAULT_LAYERS.length && DEFAULT_LAYERS.every((l) => view.layers.includes(l));
  if (!isDefault) params.set("layers", view.layers.length === 0 ? "none" : inOrder(new Set(view.layers)).join(","));
  if (view.stress) params.set("stress", "1");
  if (view.region) params.set("region", view.region);
  return params.toString();
}

export function toggleLayer(layers: readonly MapLayer[], layer: MapLayer): MapLayer[] {
  const set = new Set<string>(layers);
  if (set.has(layer)) set.delete(layer);
  else set.add(layer);
  return inOrder(set);
}

const NOUN: Array<[Exclude<MapLayer, "regions">, string, string]> = [
  ["sites", "data center site", "data center sites"],
  ["campuses", "tracked campus", "tracked campuses"],
  ["clusters", "AI cluster", "AI clusters"],
  ["plants", "power plant", "power plants"],
];

/**
 * What the overlay says is on the map: one phrase per visible point layer
 * whose data has arrived. Counts only; megawatts are said separately, and
 * only for tracked campuses (trackedHeadline).
 */
export function layerSummary(counts: Partial<Record<Exclude<MapLayer, "regions">, number>>, layers: readonly MapLayer[]): string[] {
  const out: string[] = [];
  for (const [layer, one, many] of NOUN) {
    const n = counts[layer];
    if (!layers.includes(layer) || typeof n !== "number") continue;
    out.push(`${n.toLocaleString("en-US")} ${n === 1 ? one : many}`);
  }
  return out;
}

/**
 * The tracked-power figure for a set of campuses, by the site's standing
 * definition: campuses of 400 MW and up, operational or under construction.
 * The map draws every tracked campus, but smaller and announced ones are not
 * added, so this stays the number the Overview gauge shows. Mapped sites and
 * plants never enter it.
 */
export function trackedHeadline(campuses: Array<{ powerMW: number; status: string }>): {
  gw: string;
  count400: number;
  countAll: number;
  announcedGw: string;
} {
  let mw = 0;
  let announced = 0;
  let count400 = 0;
  for (const c of campuses) {
    if (!(typeof c.powerMW === "number" && Number.isFinite(c.powerMW) && c.powerMW >= MIN_TRACKED_MW)) continue;
    count400 += 1;
    if (c.status === "announced") announced += c.powerMW;
    else mw += c.powerMW;
  }
  return { gw: (mw / 1000).toFixed(1), count400, countAll: campuses.length, announcedGw: (announced / 1000).toFixed(1) };
}

/** Dots grow a little as you zoom in, so a metro reads as buildings rather than a smear. */
export function zoomScale(zoom: number): number {
  if (zoom >= 9) return 2.1;
  if (zoom >= 7.5) return 1.7;
  if (zoom >= 6) return 1.35;
  if (zoom >= 5) return 1.12;
  return 1;
}

/**
 * A power plant's marker radius in px before zoom scaling: 250 MW is about
 * 2.4, 1 GW 3.1, 4 GW 4.6. Deliberately gentler than the campus scale, so
 * plants do not swamp data centers.
 */
export function plantRadius(mw: number): number {
  return 1.6 + 1.5 * Math.sqrt(Math.max(0, mw) / 1000);
}
