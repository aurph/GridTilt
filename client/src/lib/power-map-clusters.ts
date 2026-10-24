/**
 * Power Map "AI Clusters" view: the pure helpers behind the markers, the
 * overlay numbers and the filters, so they are unit-tested (this repo has no
 * DOM tests). Rows come from /api/clusters, the same records the Compute
 * Frontier page draws; this module stays clusters-only on purpose. Facility
 * helpers live in PowerMap.tsx and real-gauges.ts.
 */

export type ClusterStatus = "operational" | "construction" | "announced";

export const CLUSTER_STATUSES: readonly ClusterStatus[] = ["operational", "construction", "announced"];

/** The subset of a /api/clusters row the map reads. */
export interface ClusterPoint {
  id: string;
  name: string;
  operator: string;
  status: ClusterStatus;
  location: { city?: string; state?: string; lat: number; lng: number };
  gridRegion?: string | null;
  gpuCount: number | null;
  chipType?: string | null;
  ratedPowerMW: number;
  plannedPowerMW: number;
  energySource?: string | null;
  onlineDate?: string | null;
  linkedDeal?: string | null;
  /** Names of the fields that are estimates rather than disclosed figures. */
  estimated?: unknown;
  reviewed?: string | null;
}

export const POWER_MAP_VIEWS = ["dc", "clusters", "stress"] as const;
export type PowerMapView = (typeof POWER_MAP_VIEWS)[number];

/** `?view=` round-trip. Anything unknown is the default facility view. */
export function parseView(raw: string | null | undefined): PowerMapView {
  return (POWER_MAP_VIEWS as readonly string[]).includes(raw ?? "") ? (raw as PowerMapView) : "dc";
}

/** The seven NERC/RTO buckets the Power Map's region layer and table use. */
export const CLUSTER_RTOS = ["PJM", "MISO", "ERCOT", "WECC", "SERC", "SPP", "NPCC"] as const;

/**
 * A cluster's gridRegion -> the map's RTO bucket. CAISO sits inside WECC and
 * the New England and New York ISOs inside NPCC. Unknown or blank regions map
 * to null, so an RTO focus never claims a cluster it cannot place.
 */
export function clusterRTO(gridRegion: string | null | undefined): string | null {
  const g = (gridRegion ?? "").trim().toUpperCase();
  if (!g) return null;
  if (g.startsWith("CAISO") || g.startsWith("WECC")) return "WECC";
  if (g.startsWith("ISO-NE") || g.startsWith("ISONE") || g.startsWith("NYISO") || g.startsWith("NPCC")) return "NPCC";
  for (const rto of CLUSTER_RTOS) {
    if (g.startsWith(rto)) return rto;
  }
  return null;
}

/**
 * Marker radius in px. Area tracks planned MW on a sqrt scale: 0 MW is the
 * 4 px floor, 1 GW is 7 px, 5 GW is about 10.7 px, and nothing passes 13 px
 * (the facility view's ceiling), so the two views read on the same scale.
 */
export function clusterPinRadius(plannedMW: number): number {
  if (!Number.isFinite(plannedMW) || plannedMW <= 0) return 4;
  return Math.min(13, 4 + 3 * Math.sqrt(plannedMW / 1000));
}

/** Rows without a usable coordinate pair cannot be drawn. */
export function hasCoords(c: Pick<ClusterPoint, "location">): boolean {
  const loc = c.location;
  return !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180;
}

/**
 * One predicate for markers, labels and counts. Empty `statuses` means every
 * status. An RTO focus (from the Grid Operator table) keeps only clusters the
 * map can place in that region.
 */
export function clusterPassesFilters(
  c: Pick<ClusterPoint, "status" | "gridRegion">,
  statuses: readonly ClusterStatus[],
  rtoFocus: string | null,
): boolean {
  if (statuses.length > 0 && !statuses.includes(c.status)) return false;
  if (rtoFocus && clusterRTO(c.gridRegion) !== rtoFocus) return false;
  return true;
}

export interface ClusterStats {
  count: number;
  /** Sum of planned MW across the rows (most rows carry an estimate here). */
  plannedMW: number;
  /** Rated MW at operational clusters only: what is energized today. */
  operationalMW: number;
  byStatus: Record<ClusterStatus, number>;
  gpus: number;
  withGpuData: number;
}

function finitePositive(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/** Overlay numbers for whatever subset of rows is on the map. */
export function clusterStats(rows: readonly Pick<ClusterPoint, "status" | "plannedPowerMW" | "ratedPowerMW" | "gpuCount">[]): ClusterStats {
  const stats: ClusterStats = {
    count: 0,
    plannedMW: 0,
    operationalMW: 0,
    byStatus: { operational: 0, construction: 0, announced: 0 },
    gpus: 0,
    withGpuData: 0,
  };
  for (const r of rows) {
    stats.count += 1;
    stats.plannedMW += finitePositive(r.plannedPowerMW);
    if (r.status === "operational") stats.operationalMW += finitePositive(r.ratedPowerMW);
    if (r.status in stats.byStatus) stats.byStatus[r.status] += 1;
    const gpus = finitePositive(r.gpuCount);
    if (gpus > 0) {
      stats.gpus += gpus;
      stats.withGpuData += 1;
    }
  }
  return stats;
}

/** True when the row marks `field` as an estimate (clusters.json `estimated: [...]`). */
export function isEstimated(c: Pick<ClusterPoint, "estimated">, field: string): boolean {
  return Array.isArray(c.estimated) && c.estimated.includes(field);
}

/**
 * Label density by zoom, matching the facility view's rule: nothing zoomed
 * out, the gigawatt-class sites from zoom 6, every site from zoom 8.
 */
export function clusterLabelMinMW(zoom: number): number | null {
  if (!Number.isFinite(zoom) || zoom < 6) return null;
  return zoom >= 8 ? 0 : 1000;
}

/** "618 MW" below a gigawatt, "1.2 GW" from there, always with the unit. */
export function formatClusterMW(mw: number): string {
  const n = finitePositive(mw);
  if (n >= 1000) return `${(n / 1000).toFixed(1)} GW`;
  return `${Math.round(n).toLocaleString("en-US")} MW`;
}

/** Chip names that carry no information are hidden from the detail card. */
export function knownChip(chipType: string | null | undefined): string | null {
  const t = (chipType ?? "").trim();
  if (!t) return null;
  if (/^(undisclosed|unknown|unspecified|n\/a|tbd)$/i.test(t)) return null;
  return t;
}
