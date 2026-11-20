/**
 * Pure helpers for the grid regions: which region a point is in, the box the
 * map flies to, what is inside each region, and the NERC reading behind its
 * stress. No DOM and no Leaflet, so they are unit-tested.
 *
 * "Inside a region" means inside its boundary as drawn (the shapes are
 * approximate; see BOUNDARY_NOTE in data/grid-regions.ts), so the counts in a
 * region's panel match the dots the reader sees inside the shape.
 */
import { CAMPUS_REGION_REVIEWED } from "../data/campus-regions";
import { GRID_REGION_IDS, REGION_AUTHORITIES, REGION_SLUG_ALIASES, gridRegion, type GridRegionId } from "../data/grid-regions";
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

/**
 * What sits inside one region. A layer that has not loaded is null, never
 * zero: an unknown count must not read as "none".
 */
export interface RegionStats {
  campuses: {
    /** Every tracked campus in the region. */
    count: number;
    /** The ones of 400 MW and up, announced ones included. */
    count400: number;
    /** The ones the megawatts cover: 400 MW and up, operational or under construction. */
    built400: number;
    /** Megawatts at those, operational or under construction. Announced campuses are not steel. */
    builtMw400: number;
  } | null;
  /** Mapped sites: a count only. A site has no megawatts. */
  sites: number | null;
  clusters: { count: number; plannedMw: number } | null;
  plants: { count: number; mw: number; byFuel: Record<string, number> } | null;
}

/** A record regionStats places: its position, plus its state and balancing authority where it has them. */
type Point = Placeable;

const finite = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** What belongs to each region (regionOf). A record in no region is left out. */
export function regionStats(
  shapes: RegionShape[],
  layers: {
    campuses?: Array<Point & { id?: number; powerMW: number; status: string }> | null;
    sites?: Point[] | null;
    clusters?: Array<Point & { plannedPowerMW: number }> | null;
    plants?: Array<Point & { mw: number; fuel: string }> | null;
  },
): Record<GridRegionId, RegionStats> {
  const out = {} as Record<GridRegionId, RegionStats>;
  for (const id of GRID_REGION_IDS) {
    out[id] = {
      campuses: layers.campuses ? { count: 0, count400: 0, built400: 0, builtMw400: 0 } : null,
      sites: layers.sites ? 0 : null,
      clusters: layers.clusters ? { count: 0, plannedMw: 0 } : null,
      plants: layers.plants ? { count: 0, mw: 0, byFuel: {} } : null,
    };
  }
  for (const c of layers.campuses ?? []) {
    const id = regionOfCampus(shapes, c);
    const s = id ? out[id].campuses : null;
    if (!s) continue;
    s.count += 1;
    if (finite(c.powerMW) >= MIN_TRACKED_MW) {
      s.count400 += 1;
      if (c.status !== "announced") {
        s.built400 += 1;
        s.builtMw400 += c.powerMW;
      }
    }
  }
  for (const p of layers.sites ?? []) {
    const id = regionOf(shapes, p);
    if (id) out[id].sites = (out[id].sites ?? 0) + 1;
  }
  for (const c of layers.clusters ?? []) {
    const id = regionOf(shapes, c);
    const s = id ? out[id].clusters : null;
    if (!s) continue;
    s.count += 1;
    s.plannedMw += finite(c.plannedPowerMW);
  }
  for (const p of layers.plants ?? []) {
    const id = regionOf(shapes, p);
    const s = id ? out[id].plants : null;
    if (!s) continue;
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
  const s = slug.toLowerCase();
  if ((GRID_REGION_IDS as readonly string[]).includes(s)) return s as GridRegionId;
  return REGION_SLUG_ALIASES[s] ?? null;
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
export function regionDeals(rows: DealLike[] | undefined, id: GridRegionId): { count: number; mw: number; undisclosed: number } | null {
  // Not loaded is unknown, never zero.
  if (!rows) return null;
  const signed = rows.filter((r) => r.firmness === "signed" && !r.aggregate && dealRegion(r.iso) === id);
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

const RAD = Math.PI / 180;

/** Albers equal-area conic for the lower 48 (standard parallels 29.5 and 45.5), as plain arithmetic. */
const ALBERS = (() => {
  const phi1 = 29.5 * RAD;
  const phi2 = 45.5 * RAD;
  const n = (Math.sin(phi1) + Math.sin(phi2)) / 2;
  const c = Math.pow(Math.cos(phi1), 2) + 2 * n * Math.sin(phi1);
  return { n, c, rho0: Math.sqrt(c - 2 * n * Math.sin(37.5 * RAD)) / n, lam0: -96 * RAD };
})();

/** [x east, y north], in the projection's own units. */
function albers(lng: number, lat: number): [number, number] {
  const rho = Math.sqrt(ALBERS.c - 2 * ALBERS.n * Math.sin(lat * RAD)) / ALBERS.n;
  const theta = ALBERS.n * (lng * RAD - ALBERS.lam0);
  return [rho * Math.sin(theta), ALBERS.rho0 - rho * Math.cos(theta)];
}

export interface RegionLocator {
  /** SVG path data per region, in the box's pixels. */
  paths: Array<{ id: GridRegionId; d: string }>;
  /** Where a point falls in the same box: [x, y]. */
  point: (lat: number, lng: number) => [number, number];
}

/**
 * The regions drawn small, for a page with no map on it: one SVG outline per
 * region fitted into a width by height box, and the function that places a
 * point the same way. No map library loads for it.
 */
export function regionLocator(shapes: RegionShape[], width: number, height: number, pad = 4): RegionLocator {
  const projected = shapes.map((s) => ({
    id: s.id,
    polygons: polygonsOf(s.geometry).map((rings) => rings.map((ring) => ring.map((p) => albers(p[0], p[1])))),
  }));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  projected.forEach((s) =>
    s.polygons.forEach((rings) =>
      rings.forEach((ring) =>
        ring.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }),
      ),
    ),
  );
  if (!Number.isFinite(minX)) return { paths: [], point: () => [0, 0] };

  const scale = Math.min((width - 2 * pad) / (maxX - minX), (height - 2 * pad) / (maxY - minY));
  const left = (width - (maxX - minX) * scale) / 2;
  const top = (height - (maxY - minY) * scale) / 2;
  const place = (x: number, y: number): [number, number] => [left + (x - minX) * scale, top + (maxY - y) * scale];

  const paths = projected.map((s) => {
    let d = "";
    s.polygons.forEach((rings) =>
      rings.forEach((ring) => {
        // Drop points that land within half a pixel of the last one kept: the outline is drawn small.
        const kept: Array<[number, number]> = [];
        ring.forEach(([x, y]) => {
          const p = place(x, y);
          const last = kept[kept.length - 1];
          if (!last || Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) >= 0.5) kept.push(p);
        });
        if (kept.length < 3) return;
        d += `M${kept.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")}Z`;
      }),
    );
    return { id: s.id, d };
  });
  return {
    paths,
    point: (lat, lng) => {
      const [x, y] = albers(lng, lat);
      return place(x, y);
    },
  };
}

/** A record to place: where it is, its state where known, and (power plants) the balancing authority it reports. */
export interface Placeable {
  lat: number;
  lng: number;
  state?: string | null;
  ba?: string | null;
}

const AUTHORITY_REGION: Record<string, GridRegionId> = (() => {
  const out: Record<string, GridRegionId> = {};
  GRID_REGION_IDS.forEach((id) => REGION_AUTHORITIES[id].forEach((code) => (out[code] = id)));
  return out;
})();

/**
 * The region a record belongs to. Every count and every megawatt by region
 * goes through this, so the map, the panel, the table and the region page
 * place a record the same way. In order:
 *
 * 1. A power plant whose balancing authority is an operator's own belongs to
 *    that operator, wherever its dot falls (footprints interleave: 68 plants
 *    of an operator, 50 GW, are drawn inside another region's lines). One
 *    that reports a utility with no market operator belongs to the Southeast
 *    or the West, not to the operator drawn around it (37 plants, 38 GW). An
 *    authority from the other side of the country than the plant is not
 *    believed.
 * 2. Otherwise the region whose drawn boundary holds the point.
 * 3. Otherwise, for a point just off a clipped coast, lakeshore or river (21
 *    plants were, four of them nuclear), the region that runs most of its
 *    state.
 *
 * Null for Alaska, Hawaii and a point with neither a shape nor a state.
 */
export function regionOf(shapes: RegionShape[], p: Placeable): GridRegionId | null {
  const drawn = regionAt(shapes, p.lat, p.lng);
  const here = drawn ?? (p.state ? regionForState(p.state) : null);
  const named = p.ba ? AUTHORITY_REGION[p.ba] : undefined;
  if (!named) return here;
  if (gridRegion(named).kind === "market") return named;
  const western = (id: GridRegionId) => gridRegion(id).interconnection === "Western";
  return !here || western(here) === (named === "west") ? named : here;
}

/**
 * The region a tracked campus belongs to: the one a person recorded after
 * reading who serves it (data/campus-regions.ts), or else regionOf. Megawatts
 * by region follow this, so a campus the approximate lines put in a
 * neighbor's footprint is still counted where its utility belongs.
 */
export function regionOfCampus(shapes: RegionShape[], campus: Placeable & { id?: number }): GridRegionId | null {
  const reviewed = typeof campus.id === "number" ? CAMPUS_REGION_REVIEWED[campus.id] : undefined;
  return reviewed ? reviewed.region : regionOf(shapes, campus);
}
