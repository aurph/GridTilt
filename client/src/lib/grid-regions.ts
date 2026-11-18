/**
 * Pure helpers for the grid regions: which region a point is in, the box the
 * map flies to, what is inside each region, and the NERC reading behind its
 * stress. No DOM and no Leaflet, so they are unit-tested.
 *
 * "Inside a region" means inside its boundary as drawn (the shapes are
 * approximate; see BOUNDARY_NOTE in data/grid-regions.ts), so the counts in a
 * region's panel match the dots the reader sees inside the shape.
 */
import { GRID_REGION_IDS, REGION_SLUG_ALIASES, gridRegion, type GridRegionId } from "../data/grid-regions";
import { NERC_AREAS, type NercArea, type NercRisk } from "../data/nerc-reserve-margins";
import { STATE_GRID } from "../data/state-grid";
import { MIN_TRACKED_MW } from "./real-gauges";
import { marginTextForAreas, riskForAreas, riskTextForAreas } from "./reserve-margins";

type Ring = number[][];

/** Ray casting: is [lng, lat] inside this closed ring? */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outline and not inside one of its holes. */
function inPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (rings.length === 0 || !inRing(lng, lat, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) if (inRing(lng, lat, rings[i])) return false;
  return true;
}

/** Is [lng, lat] inside a GeoJSON Polygon or MultiPolygon? Anything else is not an area. */
export function pointInGeometry(lng: number, lat: number, geometry: unknown): boolean {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || !Array.isArray(g.coordinates)) return false;
  if (g.type === "Polygon") return inPolygon(lng, lat, g.coordinates as Ring[]);
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][]).some((rings) => inPolygon(lng, lat, rings));
  return false;
}

export interface RegionShape {
  id: GridRegionId;
  /** GeoJSON Polygon or MultiPolygon, [lng, lat]. */
  geometry: { type: string; coordinates: unknown };
  /** [west, south, east, north]. */
  bbox: [number, number, number, number];
}

function polygonsOf(geometry: { type: string; coordinates: unknown }): Ring[][] {
  if (geometry.type === "Polygon") return [geometry.coordinates as Ring[]];
  if (geometry.type === "MultiPolygon") return geometry.coordinates as Ring[][];
  return [];
}

/** The regions file (already converted from TopoJSON to features) as shapes with their boxes. */
export function regionShapes(collection: { features: Array<{ id?: string | number; geometry: unknown }> }): RegionShape[] {
  const out: RegionShape[] = [];
  for (const f of collection.features) {
    const id = String(f.id) as GridRegionId;
    if (!(GRID_REGION_IDS as readonly string[]).includes(id)) continue;
    const geometry = f.geometry as { type: string; coordinates: unknown };
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const rings of polygonsOf(geometry)) {
      for (const [lng, lat] of rings[0] ?? []) {
        if (lng < west) west = lng;
        if (lng > east) east = lng;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
    }
    out.push({ id, geometry, bbox: [west, south, east, north] });
  }
  return out;
}

/** The region whose drawn boundary holds this point, or null (Alaska, Hawaii, Canada, the sea). */
export function regionAt(shapes: RegionShape[], lat: number, lng: number): GridRegionId | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  for (const s of shapes) {
    const [west, south, east, north] = s.bbox;
    if (lng < west || lng > east || lat < south || lat > north) continue;
    if (pointInGeometry(lng, lat, s.geometry)) return s.id;
  }
  return null;
}

/** Leaflet bounds for a region: [[south, west], [north, east]]. */
export function regionBounds(shape: RegionShape): [[number, number], [number, number]] {
  const [west, south, east, north] = shape.bbox;
  return [
    [south, west],
    [north, east],
  ];
}

export interface RegionStats {
  campuses: {
    /** Every tracked campus in the region. */
    count: number;
    /** The ones of 400 MW and up: the campuses the site's tracked-power gauge counts. */
    count400: number;
    /** Megawatts at those, operational or under construction. Announced campuses are not steel. */
    builtMw400: number;
  };
  /** Mapped sites: a count only. A site has no megawatts. */
  sites: number;
  clusters: { count: number; plannedMw: number };
  plants: { count: number; mw: number; byFuel: Record<string, number> };
}

interface Point {
  lat: number;
  lng: number;
}

const finite = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** What sits inside each region's boundary as drawn. Points in no region are left out. */
export function regionStats(
  shapes: RegionShape[],
  layers: {
    campuses?: Array<Point & { powerMW: number; status: string }>;
    sites?: Point[];
    clusters?: Array<Point & { plannedPowerMW: number }>;
    plants?: Array<Point & { mw: number; fuel: string }>;
  },
): Record<GridRegionId, RegionStats> {
  const out = {} as Record<GridRegionId, RegionStats>;
  for (const id of GRID_REGION_IDS) {
    out[id] = {
      campuses: { count: 0, count400: 0, builtMw400: 0 },
      sites: 0,
      clusters: { count: 0, plannedMw: 0 },
      plants: { count: 0, mw: 0, byFuel: {} },
    };
  }
  for (const c of layers.campuses ?? []) {
    const id = regionAt(shapes, c.lat, c.lng);
    if (!id) continue;
    const s = out[id].campuses;
    s.count += 1;
    if (finite(c.powerMW) >= MIN_TRACKED_MW) {
      s.count400 += 1;
      if (c.status !== "announced") s.builtMw400 += c.powerMW;
    }
  }
  for (const p of layers.sites ?? []) {
    const id = regionAt(shapes, p.lat, p.lng);
    if (id) out[id].sites += 1;
  }
  for (const c of layers.clusters ?? []) {
    const id = regionAt(shapes, c.lat, c.lng);
    if (!id) continue;
    out[id].clusters.count += 1;
    out[id].clusters.plannedMw += finite(c.plannedPowerMW);
  }
  for (const p of layers.plants ?? []) {
    const id = regionAt(shapes, p.lat, p.lng);
    if (!id) continue;
    const s = out[id].plants;
    s.count += 1;
    s.mw = Math.round((s.mw + finite(p.mw)) * 10) / 10;
    s.byFuel[p.fuel] = (s.byFuel[p.fuel] ?? 0) + 1;
  }
  return out;
}

/** The NERC assessment areas whose readings cover a region. */
export function regionNercAreas(id: GridRegionId): NercArea[] {
  return gridRegion(id).nercAreas.map((k) => NERC_AREAS[k]).filter((a): a is NercArea => Boolean(a));
}

/** The region's NERC risk level, or "mixed" when its areas differ. */
export function regionRiskLevel(id: GridRegionId): NercRisk | "mixed" {
  return riskForAreas(regionNercAreas(id)) ?? "mixed";
}

/** "Elevated", "Normal in all 4 areas", or the areas that differ by name. */
export function regionRiskText(id: GridRegionId): string {
  return riskTextForAreas(regionNercAreas(id));
}

/** "29.7%" for one area; a span across areas for several. */
export function regionMarginText(id: GridRegionId): string {
  return marginTextForAreas(regionNercAreas(id));
}

/** The region a page address names: its own id, or the page a retired NERC-style slug moved to. */
export function regionIdForSlug(slug: string | undefined | null): GridRegionId | null {
  if (!slug) return null;
  if ((GRID_REGION_IDS as readonly string[]).includes(slug)) return slug as GridRegionId;
  return REGION_SLUG_ALIASES[slug] ?? null;
}

const DEAL_ISO: Record<string, GridRegionId> = {
  PJM: "pjm",
  ERCOT: "ercot",
  MISO: "miso",
  SPP: "spp",
  CAISO: "caiso",
  NYISO: "nyiso",
  "ISO-NE": "isone",
  SERC: "southeast",
  WECC: "west",
  "Non-ISO West": "west",
};

/**
 * The region a power agreement row belongs to, from its `iso` field. A row
 * that spans several operators or names none ("Multi", "Undisclosed", "TBD")
 * belongs to no region and is never guessed into one.
 */
export function dealRegion(iso: string | null | undefined): GridRegionId | null {
  return DEAL_ISO[(iso ?? "").trim()] ?? null;
}

const STATE_REGION: Record<string, GridRegionId> = { PJM: "pjm", MISO: "miso", SPP: "spp", ERCOT: "ercot", SERC: "southeast" };

/**
 * The region that runs most of a state, from the site's per-state table
 * (data/state-grid.ts). California is CAISO, New York NYISO, the rest of the
 * old Northeast bucket ISO-NE and the rest of the old Western bucket West.
 * Null for Alaska, Hawaii and anything that is not a state.
 */
export function regionForState(code: string): GridRegionId | null {
  const old = STATE_GRID[code]?.region;
  if (!old) return null;
  if (old === "WECC") return code === "CA" ? "caiso" : "west";
  if (old === "NPCC") return code === "NY" ? "nyiso" : "isone";
  return STATE_REGION[old] ?? null;
}

export interface DealLike {
  id: string;
  capacityMW: number | null;
  firmness: string;
  iso: string | null;
  aggregate?: boolean;
  includes?: string[];
}

/**
 * A region's signed power agreements: how many, and their megawatts where a
 * capacity is disclosed. Same care as the Deals page (server/deals.ts): an
 * aggregate row is not an agreement, and a row nested inside another (a plant
 * inside its framework) is not counted twice.
 */
export function regionDeals(rows: DealLike[] | undefined, id: GridRegionId): { count: number; mw: number; undisclosed: number } {
  const signed = (rows ?? []).filter((r) => r.firmness === "signed" && !r.aggregate && dealRegion(r.iso) === id);
  const nested = new Set(signed.flatMap((r) => r.includes ?? []));
  const unique = signed.filter((r) => !nested.has(r.id));
  let mw = 0;
  let undisclosed = 0;
  for (const r of unique) {
    if (typeof r.capacityMW === "number" && Number.isFinite(r.capacityMW) && r.capacityMW > 0) mw += r.capacityMW;
    else undisclosed += 1;
  }
  return { count: unique.length, mw, undisclosed };
}
