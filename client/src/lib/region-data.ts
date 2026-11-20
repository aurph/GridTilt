/**
 * What a region page needs that the map also loads: the region shapes, and
 * what sits inside each. The page and the map's panel count the same things
 * from the same files, so the two can never disagree.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { feature } from "topojson-client";
import type { GridRegionId } from "../data/grid-regions";
import { regionShapes, regionStats, type RegionShape, type RegionStats } from "./grid-regions";
import { hasCoords, type ClusterPoint } from "./power-map-clusters";

/** The nine regions' shapes, with the query's state for a page that shows a failed load. */
export function useRegionShapesQuery() {
  return useQuery<RegionShape[]>({
    queryKey: ["/geo/grid-regions.json"],
    queryFn: async () => {
      const res = await fetch("/geo/grid-regions.json?v=1");
      if (!res.ok) throw new Error(`grid regions ${res.status}`);
      const topology = await res.json();
      // feature() is generic over topojson's own Topology type; declaring the
      // nested shape of this file buys nothing, since the result goes straight
      // to regionShapes, which reads only ids and geometries.
      return regionShapes(feature(topology, topology.objects.regions) as never);
    },
  });
}

/** The nine regions' shapes: one small file, fetched once and cached. */
export function useRegionShapes(): RegionShape[] | null {
  return useRegionShapesQuery().data ?? null;
}

/** A tracked campus, as /api/datacenters answers (the fields a region page reads). */
export interface RegionCampus {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  powerMW: number;
  status: "operational" | "construction" | "announced";
  openDate: string;
  /** Set when a reviewed cluster record is this facility. */
  clusterId?: string;
}

interface SitesPayload {
  source: { version: string };
  sites: Array<{ id: string; lat: number; lng: number; state: string }>;
}

interface PlantsPayload {
  dataMonth: string;
  floorMw: number;
  plants: Array<{ id: number; lat: number; lng: number; mw: number; fuel: string; state: string; ba: string | null }>;
}

export interface RegionData {
  shapes: RegionShape[] | null;
  /** Null until the shapes have loaded; inside it, a layer still loading is null. */
  stats: Record<GridRegionId, RegionStats> | null;
  campuses: RegionCampus[] | undefined;
  sites: SitesPayload["sites"] | null;
  sources: { sitesVersion?: string; plantsMonth?: string; plantsFloorMw?: number };
  campusesLoading: boolean;
  campusesError: boolean;
  refetchCampuses: () => void;
}

export function useRegionData(): RegionData {
  const shapes = useRegionShapes();
  const campusQuery = useQuery<RegionCampus[]>({ queryKey: ["/api/datacenters"] });
  const { data: clusters } = useQuery<ClusterPoint[]>({ queryKey: ["/api/clusters"] });
  const { data: sites } = useQuery<SitesPayload>({ queryKey: ["/api/map/sites"] });
  const { data: plants } = useQuery<PlantsPayload>({ queryKey: ["/api/map/plants"] });
  const campuses = campusQuery.data;

  const stats = useMemo(
    () =>
      shapes
        ? regionStats(shapes, {
            campuses: campuses ?? null,
            sites: sites?.sites ?? null,
            clusters: clusters
              ? clusters.filter(hasCoords).map((c) => ({ lat: c.location.lat, lng: c.location.lng, state: c.location.state, plannedPowerMW: c.plannedPowerMW }))
              : null,
            plants: plants?.plants ?? null,
          })
        : null,
    [shapes, campuses, sites, clusters, plants],
  );

  return {
    shapes,
    stats,
    campuses,
    sites: sites?.sites ?? null,
    sources: { sitesVersion: sites?.source.version, plantsMonth: plants?.dataMonth, plantsFloorMw: plants?.floorMw },
    campusesLoading: campusQuery.isLoading,
    campusesError: campusQuery.isError,
    refetchCampuses: () => {
      void campusQuery.refetch();
    },
  };
}
