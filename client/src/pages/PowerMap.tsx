/**
 * The Grid map: every layer drawn together, each with its own toggle.
 *
 *   regions   the nine grid regions, hoverable and clickable (the education layer)
 *   plants    power plants by fuel, EIA-860M (canvas)
 *   sites     mapped data center sites, location only, PNNL IM3 atlas (canvas)
 *   clusters  the Compute Frontier records, as rings
 *   campuses  GridTilt's tracked campuses, the glow markers, on top
 *
 * Layer state, the stress coloring and the selected region round-trip in the
 * address bar (lib/map-layers.ts). Megawatts are said only for tracked
 * campuses, by the site's standing definition (400 MW and up, operational or
 * under construction); mapped sites are counted and never summed.
 *
 * The dense layers load after first paint and draw on one shared canvas, so
 * the map opens as fast as it did with thirty markers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Calendar, ChevronDown, Compass, Info, Network, SlidersHorizontal, X, Zap } from "lucide-react";
import { BasemapTiles } from "@/components/basemap-tiles";
import { BiggestDataCenters } from "@/components/BiggestDataCenters";
import { BuildoutTimeline } from "@/components/BuildoutTimeline";
import { CompanyBuildout } from "@/components/CompanyBuildout";
import { ErrorState, RegistryDate } from "@/components/Freshness";
import { CampusLabels, CampusMarkers, ClusterLabels, ClusterMarkers, type DataCenter } from "@/components/map/campus-markers";
import { GridTourCard } from "@/components/map/grid-tour";
import { LayersControl, MapLegend } from "@/components/map/map-controls";
import { PointsLayer, type MapPlant, type MapSite, type PointInfo } from "@/components/map/points-layer";
import { RISK_COLOR, RegionLayer } from "@/components/map/region-layer";
import { RegionPanel } from "@/components/map/region-panel";
import { PowerSourceMix } from "@/components/PowerSourceMix";
import { SectionHeading } from "@/components/section-heading";
import { SourceFooter } from "@/components/SourceFooter";
import { StateBuildout } from "@/components/StateBuildout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GRID_REGIONS, gridRegion, type GridRegionId } from "@/data/grid-regions";
import { NERC_LTRA } from "@/data/nerc-reserve-margins";
import { PLANT_FUEL_LABEL, fuelColor } from "@/lib/fuel-colors";
import { aiSharePct, fmtGW, fmtPeriodET, useGridLive, type GridLiveConfigured } from "@/lib/grid-live";
import {
  regionOf,
  regionOfCampus,
  regionBounds,
  regionMarginText,
  regionNercAreas,
  regionRiskLevel,
  regionRiskText,
  regionStats,
} from "@/lib/grid-regions";
import { buildTourSteps, tourFacts } from "@/lib/grid-tour";
import { isFarOut, layerSummary, mapViewQuery, parseMapView, toggleLayer, trackedHeadline, type MapLayer, type MapView } from "@/lib/map-layers";
import { formatClusterMW, hasCoords, isEstimated, knownChip, type ClusterPoint } from "@/lib/power-map-clusters";
import { MIN_TRACKED_MW } from "@/lib/real-gauges";
import { useRegionShapesQuery } from "@/lib/region-data";
import { withSectionParams } from "@/lib/sections";
import { BORDER, BRAND, FONT, INK, STATUS_COLORS, SURFACE } from "@/lib/tokens";

/** Token hex + alpha -> rgba() string, so composed tints stay on token values. */
function alpha(hex: string, a: number): string {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
}

// External company brand colors stay literal (migration map exception).
const companyColors: Record<string, string> = {
  Microsoft: "#0078d4",
  Google: "#4285f4",
  Amazon: "#ff9900",
  Meta: "#1877f2",
  Apple: "#555555",
  xAI: "#f0a500",
  OpenAI: "#10a37f",
  Oracle: "#c74634",
  CoreWeave: "#7c3aed",
  Nebius: "#00b4d8",
};

const STATUS_LABEL: Record<DataCenter["status"], string> = {
  operational: "Operational",
  construction: "Under Construction",
  announced: "Announced",
};

/** What /api/map/sites and /api/map/plants answer (server/dc-sites.ts, server/power-plants.ts). */
interface SitesPayload {
  source: { name: string; version: string; published: string; url: string };
  attribution: string;
  counts: { sites: number; leftOutAsTracked: number };
  sites: MapSite[];
}
interface PlantsPayload {
  source: { name: string; url: string; released: string };
  dataMonth: string;
  floorMw: number;
  plants: MapPlant[];
}

/**
 * Campus size filter. "all" is the default: every tracked campus draws. The
 * 400 MW floor the map used to apply is now a choice ("min400"). The older
 * bucket keys still work so shared filter links keep their meaning.
 */
function passesCapacity(powerMW: number, capacity: string): boolean {
  if (capacity === "min400") return powerMW >= MIN_TRACKED_MW;
  if (capacity === "small") return powerMW >= MIN_TRACKED_MW && powerMW < 600;
  if (capacity === "medium") return powerMW >= 600 && powerMW < 1000;
  if (capacity === "large") return powerMW >= 1000;
  return true;
}

const CAPACITY_OPTIONS = [
  { key: "all", label: "All sizes" },
  { key: "min400", label: "400 MW+" },
  { key: "large", label: "1 GW+" },
];
const CAPACITY_LABELS: Record<string, string> = { min400: "400 MW and up", small: "400-600 MW", medium: "600-1000 MW", large: "1 GW and up" };

function readUrl(): { companies: string[]; capacity: string; view: MapView } {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      companies: params.get("companies")?.split(",").filter(Boolean) ?? [],
      capacity: params.get("capacity") ?? "all",
      view: parseMapView(window.location.search),
    };
  } catch {
    return { companies: [], capacity: "all", view: parseMapView("") };
  }
}

// The address bar carries the map's state, so a view can be shared; the
// section's chip stays in front (withSectionParams).
function writeUrl(companies: string[], capacity: string, view: MapView) {
  try {
    const params = new URLSearchParams(mapViewQuery(view));
    if (companies.length) params.set("companies", companies.join(","));
    if (capacity !== "all") params.set("capacity", capacity);
    window.history.replaceState(null, "", `${window.location.pathname}${withSectionParams(window.location.search, params.toString())}`);
  } catch {}
}

/** Contiguous US. */
const CONUS_BOUNDS: [[number, number], [number, number]] = [[24.4, -124.8], [49.4, -66.9]];

/**
 * Room the lower 48 are fitted into. On a desktop the top is kept clear of
 * the overlay card, so the Pacific Northwest never sits under it; a phone
 * has no card on the map and uses the whole frame.
 */
function homePadding(phone: boolean): { topLeft: [number, number]; bottomRight: [number, number] } {
  return phone ? { topLeft: [8, 104], bottomRight: [8, 44] } : { topLeft: [16, 84], bottomRight: [16, 12] };
}

/**
 * Marks the map as far out (lib/map-layers isFarOut), so the campus and
 * cluster markers can draw smaller there. The canvas layers scale themselves.
 */
function FarOutClass() {
  const map = useMap();
  useEffect(() => {
    const apply = () => map.getContainer().classList.toggle("gt-far-out", isFarOut(map.getZoom()));
    apply();
    map.on("zoomend", apply);
    return () => {
      map.off("zoomend", apply);
    };
  }, [map]);
  return null;
}

/**
 * The map opens fitted to the lower 48. A fixed center and zoom left the
 * country small in a wide frame and cut both coasts off on a phone.
 */
function FitContiguousUs() {
  const map = useMap();
  useEffect(() => {
    const pad = homePadding(window.matchMedia("(max-width: 639px)").matches);
    map.fitBounds(CONUS_BOUNDS, { paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight, animate: false });
  }, [map]);
  return null;
}

function useBelowSm(): boolean {
  const [below, setBelow] = useState<boolean>(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const onChange = () => setBelow(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return below;
}

interface FlyTarget {
  key: string;
  bounds: [[number, number], [number, number]];
  topLeft: [number, number];
  bottomRight: [number, number];
}

/** Moves the map when the target changes: a region selected, a tour stop. Still under reduced motion. */
function FlyTo({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  const key = target?.key ?? null;
  useEffect(() => {
    if (!target) return;
    const opts = { paddingTopLeft: target.topLeft, paddingBottomRight: target.bottomRight };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) map.fitBounds(target.bounds, { ...opts, animate: false });
    else map.flyToBounds(target.bounds, { ...opts, duration: 0.9 });
    // The key names the target; the object itself is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Credits a layer in the map's attribution line while it is drawn (ODbL requires the OpenStreetMap credit). */
function LayerAttribution({ text }: { text: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!text) return;
    map.attributionControl?.addAttribution(text);
    return () => {
      map.attributionControl?.removeAttribution(text);
    };
  }, [map, text]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({ click: onMapClick });
  return null;
}

type Hover = { kind: "region"; id: GridRegionId; x: number; y: number } | PointInfo;

/** A mapped site or a plant: what the source says about it, and nothing more. */
function PointBody({ info, sites, plants }: { info: PointInfo; sites?: SitesPayload; plants?: PlantsPayload }) {
  if (info.kind === "site") {
    const s = info.item;
    return (
      <>
        <p className="text-[13px] font-semibold leading-tight text-white">{s.name ?? s.operator ?? "Unnamed site"}</p>
        {s.operator && s.operator !== s.name && <p className="mt-0.5 text-[11px] text-white/70">{s.operator}</p>}
        <p className="mt-1.5 text-[11px] text-white/50">
          Mapped as a data center in OpenStreetMap, {s.state}. Location only, size not published.
          {s.n ? ` ${s.n} mapped buildings.` : ""}
        </p>
        <p className="mt-1 text-10 text-white/35">
          {sites ? `IM3 atlas ${sites.source.version} (PNNL), ` : ""}© OpenStreetMap contributors
        </p>
      </>
    );
  }
  const p = info.item;
  return (
    <>
      <p className="text-[13px] font-semibold leading-tight text-white">{p.name}</p>
      {p.operator && p.operator !== p.name && <p className="mt-0.5 text-[11px] text-white/70">{p.operator}</p>}
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/60">
        <span className="h-1.5 w-1.5 rotate-45" style={{ backgroundColor: fuelColor(p.fuel) }} />
        {PLANT_FUEL_LABEL[p.fuel] ?? p.fuel} plant, {p.state}
      </p>
      <p className="mt-0.5 font-mono text-[13px] font-bold tabular-nums text-brand-2">
        {Math.round(p.mw).toLocaleString("en-US")} MW <span className="font-sans text-10 font-normal text-white/40">nameplate</span>
      </p>
      <p className="mt-1 text-10 text-white/35">
        EIA-860M{plants ? `, ${plants.dataMonth}` : ""}
        {p.ba ? ` · balancing authority ${p.ba}` : ""}
      </p>
    </>
  );
}

function cardPosition(x: number, y: number, width: number, cardWidth: number, lift: number) {
  return { left: Math.min(Math.max(x + 14, 8), Math.max(8, width - cardWidth - 8)), top: Math.max(y - lift, 8) };
}

/**
 * The hover card for regions, sites and plants. It holds its own state and
 * is fed through `register`, so moving the mouse across the map re-renders
 * this small card and not the whole page.
 */
function HoverCard({
  register,
  width,
  live,
  sites,
  plants,
}: {
  register: (set: (h: Hover | null) => void) => void;
  width: number;
  live: GridLiveConfigured | null;
  sites?: SitesPayload;
  plants?: PlantsPayload;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  useEffect(() => register(setHover), [register]);
  if (!hover) return null;

  if (hover.kind === "region") {
    const region = gridRegion(hover.id);
    const demand = live?.demand[region.liveKey] ?? null;
    const risk = regionRiskLevel(hover.id);
    return (
      <div className="pointer-events-none absolute z-[1001] w-[220px]" style={cardPosition(hover.x, hover.y, width, 220, 70)} data-testid="region-hover">
        <div className="rounded-lg border border-subtle bg-surface-raised/95 px-3 py-2 shadow-xl backdrop-blur-md">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-white">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: region.color }} />
            {region.name}
          </p>
          <p className="mt-1 text-[11px] text-white/60">
            {demand ? (
              <>
                <span className="font-mono text-white/90">{fmtGW(demand.latestMw)} GW</span> of demand, {fmtPeriodET(demand.latestPeriodUtc)}
              </>
            ) : (
              "Live demand not available"
            )}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/60">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: RISK_COLOR[risk] }} />
            NERC risk: {regionRiskText(hover.id)}
          </p>
          <p className="mt-1 text-10 text-white/35">Click for the region</p>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute z-[1001] w-[230px]" style={cardPosition(hover.x, hover.y, width, 230, 96)} data-testid="point-hover">
      <div className="rounded-lg border border-subtle bg-surface-raised/95 px-3 py-2 shadow-xl backdrop-blur-md">
        <PointBody info={hover} sites={sites} plants={plants} />
      </div>
    </div>
  );
}

export default function PowerMap() {
  const initial = useMemo(() => readUrl(), []);
  const belowSm = useBelowSm();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapWidth, setMapWidth] = useState(1200);
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setMapWidth(el.clientWidth));
    ro.observe(el);
    setMapWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ── State ────────────────────────────────────────────────────────────────
  const [view, setView] = useState<MapView>(initial.view);
  const [filterCompanies, setFilterCompanies] = useState<string[]>(initial.companies);
  const [filterCapacity, setFilterCapacity] = useState<string>(initial.capacity);
  const [selected, setSelected] = useState<DataCenter | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [tooltipDC, setTooltipDC] = useState<DataCenter | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<ClusterPoint | null>(null);
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [tooltipCluster, setTooltipCluster] = useState<ClusterPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<PointInfo | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<GridRegionId | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [fly, setFly] = useState<FlyTarget | null>(null);
  const flySeq = useRef(0);
  // The dense layers wait for first paint, so the map opens as fast as before.
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setPainted(true), 200);
    return () => window.clearTimeout(t);
  }, []);

  // The sheet could only be dismissed by tapping its backdrop, so anyone on a
  // keyboard was stuck in it. Escape is the expected way out of a modal.
  useEffect(() => {
    if (!mobileFiltersOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileFiltersOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileFiltersOpen]);

  // ── Data ─────────────────────────────────────────────────────────────────
  const {
    data: fetchedCampuses,
    isLoading: dcLoading,
    isError: dcError,
    refetch: refetchCampuses,
  } = useQuery<DataCenter[]>({ queryKey: ["/api/datacenters"] });
  const campuses = useMemo(() => fetchedCampuses ?? [], [fetchedCampuses]);

  // A layer loads when it is drawn. An open region panel or the tour counts
  // every layer, drawn or not, so either one loads the rest.
  const needAll = view.region !== null || tour !== null;
  // The Compute Frontier record set; the query key is the one that page uses.
  const {
    data: fetchedClusters,
    isError: clError,
    refetch: refetchClusters,
  } = useQuery<ClusterPoint[]>({ queryKey: ["/api/clusters"], enabled: painted && (view.layers.includes("clusters") || needAll) });
  const clusters = useMemo(() => (fetchedClusters ?? []).filter(hasCoords), [fetchedClusters]);

  const sitesQuery = useQuery<SitesPayload>({ queryKey: ["/api/map/sites"], enabled: painted && (view.layers.includes("sites") || needAll) });
  const plantsQuery = useQuery<PlantsPayload>({ queryKey: ["/api/map/plants"], enabled: painted && (view.layers.includes("plants") || needAll) });
  const sites = sitesQuery.data?.sites ?? null;
  const plants = plantsQuery.data?.plants ?? null;
  const shapesQuery = useRegionShapesQuery();
  const shapes = shapesQuery.data ?? null;
  const { live: gridLive, isLoading: gridLiveLoading } = useGridLive();
  const { data: queue } = useQuery<{ headline?: { queueOverallGW?: number; queueOverallAsOf?: string } }>({ queryKey: ["/api/queue"], enabled: tour !== null });

  // One canvas for regions, plants and sites: thousands of marks stay smooth,
  // and a click falls through to the region wherever no point is under it.
  const renderer = useMemo(() => L.canvas({ padding: 0.3, tolerance: 4 }), []);

  // ── Regions: who is where ────────────────────────────────────────────────
  const campusRegion = useMemo(() => {
    const m = new Map<number, GridRegionId | null>();
    if (shapes) for (const d of campuses) m.set(d.id, regionOfCampus(shapes, d));
    return m;
  }, [shapes, campuses]);

  const stats = useMemo(
    () =>
      shapes
        ? regionStats(shapes, {
            // A layer that has not loaded is passed as null, so its count reads as unknown and not as zero.
            campuses: fetchedCampuses ?? null,
            sites,
            clusters: fetchedClusters ? clusters.map((c) => ({ lat: c.location.lat, lng: c.location.lng, state: c.location.state, plannedPowerMW: c.plannedPowerMW })) : null,
            plants,
          })
        : null,
    [shapes, fetchedCampuses, sites, fetchedClusters, clusters, plants],
  );

  // ── The tour, and what it overrides while it plays ───────────────────────
  // The stops read what the page has loaded, so a figure that arrives while
  // the tour is open (the queue total, the site counts) appears in its stop.
  const queueGw = queue?.headline?.queueOverallGW;
  const queueAsOf = queue?.headline?.queueOverallAsOf;
  const sitesVersion = sitesQuery.data?.source.version ?? null;
  const tourSteps = useMemo(
    () =>
      buildTourSteps(
        tourFacts({
          siteCount: sites ? sites.length : null,
          sitesVersion,
          campusCount: fetchedCampuses ? fetchedCampuses.length : null,
          siteCounts: sites && stats ? stats : null,
          queue: typeof queueGw === "number" && queueAsOf ? { gw: queueGw, asOf: queueAsOf } : null,
        }),
      ),
    [sites, sitesVersion, fetchedCampuses, stats, queueGw, queueAsOf],
  );
  const step = tour !== null ? tourSteps[tour] ?? null : null;
  const layers: readonly MapLayer[] = step ? step.layers : view.layers;
  const stress = step ? step.stress : view.stress;
  const activeRegion = step ? null : view.region;
  const on = (l: MapLayer) => layers.includes(l);

  // ── What draws ───────────────────────────────────────────────────────────
  const touring = step !== null;
  const campusList = useMemo(
    () =>
      // The tour's captions count every campus, so the filters wait until it ends.
      touring ? campuses : campuses.filter((d) => (filterCompanies.length === 0 || filterCompanies.includes(d.company)) && passesCapacity(d.powerMW, filterCapacity)),
    [campuses, filterCompanies, filterCapacity, touring],
  );
  const campusesOn = layers.includes("campuses");
  // A cluster that a review has tied to a tracked campus is that campus: one
  // mark, not two. Only the reviewed link counts; nothing is matched by guess.
  const clusterList = useMemo(() => {
    if (!campusesOn) return clusters;
    const linked = new Set(campusList.map((d) => d.clusterId).filter(Boolean));
    return clusters.filter((c) => !linked.has(c.id));
  }, [clusters, campusList, campusesOn]);

  const siteFocus = useMemo(
    () => (activeRegion && shapes && sites ? new Set(sites.filter((s) => regionOf(shapes, s) === activeRegion).map((s) => s.id)) : null),
    [activeRegion, shapes, sites],
  );
  const plantFocus = useMemo(
    () => (activeRegion && shapes && plants ? new Set(plants.filter((p) => regionOf(shapes, p) === activeRegion).map((p) => p.id)) : null),
    [activeRegion, shapes, plants],
  );
  const dimmedCampuses = useMemo(
    () => (activeRegion && shapes ? new Set(campusList.filter((d) => campusRegion.get(d.id) !== activeRegion).map((d) => d.id)) : null),
    [activeRegion, shapes, campusList, campusRegion],
  );
  const dimmedClusters = useMemo(
    () =>
      activeRegion && shapes ? new Set(clusterList.filter((c) => regionOf(shapes, c.location) !== activeRegion).map((c) => c.id)) : null,
    [activeRegion, shapes, clusterList],
  );

  // ── The overlay's numbers follow what is visible ─────────────────────────
  const scopeCampuses = useMemo(
    () => (activeRegion && shapes ? campusList.filter((d) => campusRegion.get(d.id) === activeRegion) : campusList),
    [activeRegion, shapes, campusList, campusRegion],
  );
  const headline = trackedHeadline(scopeCampuses);
  // Energy for the same campuses as the GW beside it. The old overlay also
  // added announced campuses here, so the two figures described different sets.
  const builtTracked = scopeCampuses.filter((d) => d.powerMW >= MIN_TRACKED_MW && d.status !== "announced");
  const totalTWh = fmtGW(builtTracked.reduce((s, d) => s + d.annualMWh, 0) / 1000); // MWh to TWh, rounded like the GW beside it
  const statusCount = (s: DataCenter["status"]) => scopeCampuses.filter((d) => d.status === s).length;
  // Records, not marks: a cluster drawn as its campus is still one cluster
  // record, so this count matches the Layers control, the region panel and
  // Compute. With a region selected the three layer counts are the panel's.
  const inRegion = activeRegion && stats ? stats[activeRegion] : null;
  // A selected region's numbers need the shapes. Until they arrive nothing national is shown under its name.
  const regionPending = activeRegion !== null && !shapes;
  const summaryCounts = {
    sites: inRegion ? inRegion.sites ?? undefined : sites ? sites.length : undefined,
    campuses: dcLoading || dcError ? undefined : scopeCampuses.length,
    clusters: inRegion ? inRegion.clusters?.count : fetchedClusters ? clusters.length : undefined,
    plants: inRegion ? inRegion.plants?.count : plants ? plants.length : undefined,
  };
  // With an operator or size filter on, the campus count says how many of the region's (or the country's) it is showing.
  const campusTotal = activeRegion && shapes ? campuses.filter((d) => campusRegion.get(d.id) === activeRegion).length : campuses.length;
  const summary = layerSummary(summaryCounts, layers, { campusTotal });
  const failed = { sites: sitesQuery.isError, campuses: dcError, clusters: clError, plants: plantsQuery.isError };
  /** A layer that is switched on and has neither arrived nor failed. */
  const pending = (["sites", "campuses", "clusters", "plants"] as const).some((l) => layers.includes(l) && summaryCounts[l] === undefined && !failed[l]);
  const activeRegionMeta = activeRegion ? gridRegion(activeRegion) : null;
  // The two lists under the map follow the selected region: the campuses inside it, whatever the filters say.
  const regionScope = useMemo(() => {
    if (!activeRegion || !shapes) return null;
    const r = gridRegion(activeRegion);
    return {
      name: r.kind === "no-market" ? `the ${r.name}` : r.name,
      ids: new Set(campuses.filter((d) => campusRegion.get(d.id) === activeRegion).map((d) => d.id)),
    };
  }, [activeRegion, shapes, campuses, campusRegion]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const hoverSetter = useRef<(h: Hover | null) => void>(() => {});
  const registerHover = useCallback((set: (h: Hover | null) => void) => {
    hoverSetter.current = set;
  }, []);

  const clearCards = useCallback(() => {
    setSelected(null);
    setTooltipDC(null);
    setHoveredId(null);
    setSelectedCluster(null);
    setTooltipCluster(null);
    setHoveredClusterId(null);
    setTooltipPos(null);
    setPicked(null);
    hoverSetter.current(null);
  }, []);

  // What the map's handlers read at the moment of an event. They are bound once, so they read refs.
  const now = useRef({ view, companies: filterCompanies, capacity: filterCapacity, pinned: false, touring: false });
  now.current = { view, companies: filterCompanies, capacity: filterCapacity, pinned: Boolean(selected || selectedCluster || picked), touring };

  function applyView(next: MapView) {
    setView(next);
    writeUrl(filterCompanies, filterCapacity, next);
  }
  function onToggleLayer(layer: MapLayer) {
    clearCards();
    applyView({ ...view, layers: toggleLayer(view.layers, layer) });
  }
  const selectRegion = useCallback((id: GridRegionId | null) => {
    setPicked(null);
    hoverSetter.current(null);
    const cur = now.current;
    if (cur.view.region === id) return;
    const next = { ...cur.view, region: id };
    setView(next);
    writeUrl(cur.companies, cur.capacity, next);
  }, []);
  /**
   * A click on a region. Regions cover the whole lower 48, so this is also
   * the "click away": with a card pinned, the click only puts it away. During
   * the tour a click does nothing, since the tour is driving the map.
   */
  const onRegionClick = useCallback(
    (id: GridRegionId) => {
      if (now.current.touring) return;
      const hadCard = now.current.pinned;
      clearCards();
      if (!hadCard) selectRegion(id);
    },
    [clearCards, selectRegion],
  );
  /** From the region panel: this region's campuses (or sites, plants, clusters) alone on the map. */
  function showOnly(layer: MapLayer) {
    clearCards();
    applyView({ ...view, layers: layer === "regions" ? ["regions"] : [layer, "regions"] });
  }

  function setCompanies(next: string[]) {
    setFilterCompanies(next);
    writeUrl(next, filterCapacity, view);
  }
  function toggleCompany(c: string) {
    setCompanies(filterCompanies.includes(c) ? filterCompanies.filter((x) => x !== c) : [...filterCompanies, c]);
  }
  function setCapacity(cap: string) {
    setFilterCapacity(cap);
    writeUrl(filterCompanies, cap, view);
  }
  function clearAllFilters() {
    setFilterCompanies([]);
    setFilterCapacity("all");
    writeUrl([], "all", view);
    setMobileFiltersOpen(false);
  }

  // Leaving a region for a dot inside it fires "out" and then "over" on the
  // dot. The region stays lit across that gap, or it would flicker every time
  // the mouse crossed a dot.
  const unhover = useRef<number | undefined>(undefined);
  const dropHover = useCallback(() => {
    window.clearTimeout(unhover.current);
    unhover.current = window.setTimeout(() => setHoveredRegion(null), 90);
  }, []);
  useEffect(() => () => window.clearTimeout(unhover.current), []);
  const onRegionHover = useCallback(
    (id: GridRegionId | null, at?: { x: number; y: number }) => {
      if (now.current.touring) return;
      if (!id) {
        hoverSetter.current(null);
        dropHover();
        return;
      }
      window.clearTimeout(unhover.current);
      setHoveredRegion((cur) => (cur === id ? cur : id));
      hoverSetter.current(at ? { kind: "region", id, ...at } : null);
    },
    [dropHover],
  );
  const onPointHover = useCallback(
    (info: PointInfo | null) => {
      hoverSetter.current(info);
      if (info) window.clearTimeout(unhover.current);
      else dropHover();
    },
    [dropHover],
  );
  const onPointPick = useCallback((info: PointInfo) => {
    hoverSetter.current(null);
    setSelected(null);
    setSelectedCluster(null);
    setTooltipPos(null);
    setPicked(info);
  }, []);

  function startTour() {
    clearCards();
    window.clearTimeout(unhover.current);
    setHoveredRegion(null);
    setFiltersExpanded(false);
    setTour(0);
  }
  /** Back out to the whole country. */
  const goHome = useCallback(() => {
    const home = homePadding(window.matchMedia("(max-width: 639px)").matches);
    flySeq.current += 1;
    setFly({ key: `home-${flySeq.current}`, bounds: CONUS_BOUNDS, topLeft: home.topLeft, bottomRight: home.bottomRight });
  }, []);
  /** Closing a region (the panel's X, the "whole map" chip, its table row) returns to the country. */
  const closeRegion = useCallback(() => {
    selectRegion(null);
    goHome();
  }, [selectRegion, goHome]);
  const hasRegion = view.region !== null;
  const endTour = useCallback(() => {
    setTour(null);
    // With a region still selected the map returns to it (the effect below); otherwise to the country.
    if (!hasRegion) goHome();
  }, [hasRegion, goHome]);
  // ── Where the map goes ───────────────────────────────────────────────────
  // The map follows the tour stop, or else the selected region. Clearing a
  // region with a click on open map changes nothing here, so the view stays
  // where the reader left it; closing it returns to the country (closeRegion).
  const stepId = step?.id ?? null;
  const stepFocus = step?.focus ?? null;
  useEffect(() => {
    const shapeOf = (id: GridRegionId) => shapes?.find((s) => s.id === id) ?? null;
    let target: Omit<FlyTarget, "key"> | null = null;
    if (stepFocus) {
      // The tour card sits at the bottom of the map on a desktop and at the top on a phone: keep the stop clear of it.
      const shape = stepFocus === "all" ? null : shapeOf(stepFocus);
      target = {
        bounds: shape ? regionBounds(shape) : CONUS_BOUNDS,
        topLeft: belowSm ? [12, 236] : [16, 16],
        bottomRight: belowSm ? [12, 20] : [16, 190],
      };
    } else if (activeRegion) {
      // The panel covers the right side on a desktop and the lower part on a phone.
      const shape = shapeOf(activeRegion);
      if (!shape) return;
      const height = mapContainerRef.current?.clientHeight ?? 600;
      target = {
        bounds: regionBounds(shape),
        topLeft: belowSm ? [16, 60] : [24, 96],
        bottomRight: belowSm ? [16, Math.round(height * 0.68) + 8] : [372 + 28, 24],
      };
    }
    if (!target) return;
    flySeq.current += 1;
    setFly({ key: `to-${flySeq.current}`, ...target });
  }, [stepId, stepFocus, activeRegion, shapes, belowSm]);

  // ── Derived for the controls and the rows under the map ─────────────────
  const activeFilterCount = filterCompanies.length + (filterCapacity !== "all" ? 1 : 0);
  const anyFilterActive = activeFilterCount > 0;
  const allCompanies = useMemo(() => Array.from(new Set(campuses.map((d) => d.company))).sort(), [campuses]);
  const companyCounts = useMemo(() => {
    const m: Record<string, number> = {};
    campuses.forEach((d) => {
      m[d.company] = (m[d.company] ?? 0) + 1;
    });
    return m;
  }, [campuses]);
  const announced = campuses.filter((d) => d.status === "announced");
  const displayDC = selected || tooltipDC;
  const displayCluster = selectedCluster || tooltipCluster;
  const clusterChip = displayCluster ? knownChip(displayCluster.chipType) : null;
  const panelOpen = Boolean(activeRegion) && !step;
  const plantFuels = useMemo(() => Array.from(new Set((plants ?? []).map((p) => p.fuel))), [plants]);
  const campusRegionMeta = (d: DataCenter) => {
    const id = campusRegion.get(d.id);
    return id ? gridRegion(id) : null;
  };

  // A layer that failed says so and offers a retry: with no automatic retry, one dropped request would otherwise stick.
  const layerErrors = [
    { label: "Grid regions", failed: shapesQuery.isError && (on("regions") || view.region !== null), retry: () => void shapesQuery.refetch() },
    { label: "Data center sites", failed: sitesQuery.isError && (on("sites") || needAll), retry: () => void sitesQuery.refetch() },
    { label: "AI clusters", failed: clError && (on("clusters") || needAll), retry: () => void refetchClusters() },
    { label: "Power plants", failed: plantsQuery.isError && (on("plants") || needAll), retry: () => void plantsQuery.refetch() },
  ].filter((e) => e.failed);

  const overlayStats = (
    <>
      <p className="text-11 leading-relaxed text-white/60" data-testid="layer-summary">
        {regionPending
          ? "loading…"
          : summary.length > 0
            ? `${summary.join(" · ")}${pending ? " · loading…" : ""}`
            : pending
              ? "loading…"
              : layers.length === 0
                ? "Every layer is off. Turn one on under Layers."
                : on("regions") && layers.length === 1
                  ? "Grid regions only. Click a region to open it."
                  : "Nothing to count here."}
      </p>
      {on("campuses") && !dcLoading && !dcError && !regionPending && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-11">
          <span
            className="font-bold text-brand-2"
            title={`Operational plus under construction at the ${headline.built400} tracked campuses of 400 MW and up. Announced (+${headline.announcedGw} GW) and smaller campuses are drawn but not added.`}
            data-testid="tracked-gw"
          >
            {headline.gw} GW tracked
          </span>
          {anyFilterActive && !touring && (
            <span className="font-sans text-10 text-white/40" title="The operator and size filters are on, so these figures cover the campuses shown.">
              filtered
            </span>
          )}
          <span className="text-white/20">|</span>
          <span
            className="text-white/50"
            title="The same campuses at full rating all year: nameplate megawatts times 8,760 hours. Not metered use."
            data-testid="tracked-twh"
          >
            {totalTWh} TWh/yr
          </span>
          <span className="text-white/20">|</span>
          <span className="flex items-center gap-1.5">
            {(["operational", "construction", "announced"] as const).map((s) => (
              <span key={s} className="flex items-center gap-1" title={STATUS_LABEL[s]}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
                <span className="text-white/60">{statusCount(s)}</span>
              </span>
            ))}
          </span>
        </div>
      )}
    </>
  );

  const tourButton = (
    <button
      onClick={startTour}
      className="flex items-center gap-2 rounded-md border border-brand/40 bg-surface-raised/90 px-3 py-1.5 text-xs font-medium text-brand shadow-lg backdrop-blur-md transition-colors hover:border-brand hover:bg-brand/10"
      data-testid="tour-start"
    >
      <Compass className="h-3.5 w-3.5" aria-hidden />
      How the grid works
    </button>
  );

  const filterChips = (size: "sm" | "lg") => {
    const chip = size === "sm" ? "px-2 py-1 text-10" : "px-3 py-1.5 text-xs";
    return (
      <div className={size === "sm" ? "space-y-3" : "space-y-5"}>
        <div>
          <p className="mb-2 text-[11px] text-white/40">Operator</p>
          <div className={`flex flex-wrap ${size === "sm" ? "gap-1.5" : "gap-2"}`}>
            {allCompanies.map((c) => {
              const active = filterCompanies.includes(c);
              return (
                <button
                  key={c}
                  data-testid={size === "sm" ? `filter-company-${c.toLowerCase().replace(/\s+/g, "-")}` : undefined}
                  onClick={() => toggleCompany(c)}
                  className={`flex items-center gap-1.5 rounded font-medium transition-all ${chip} ${
                    active ? "border border-brand/40 bg-brand/20 text-brand" : "border border-subtle bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/80"
                  }`}
                >
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: companyColors[c] ?? INK.faint }} />
                  {c}
                  <span className="text-9 opacity-50">({companyCounts[c] ?? 0})</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[11px] text-white/40">Campus size</p>
          <div className={`flex flex-wrap ${size === "sm" ? "gap-1.5" : "gap-2"}`}>
            {CAPACITY_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                data-testid={size === "sm" ? `filter-capacity-${key}` : undefined}
                onClick={() => setCapacity(key)}
                className={`rounded font-medium transition-all ${chip} ${
                  filterCapacity === key ? "border border-brand/40 bg-brand/20 text-brand" : "border border-subtle bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <style>{`
        .leaflet-pin-icon { background: none !important; border: none !important; }
        .leaflet-container { background: ${SURFACE.base} !important; font-family: inherit; }
        .leaflet-control-zoom-in { border-radius: 6px 6px 0 0 !important; border-bottom: none !important; }
        .leaflet-control-zoom-out { border-radius: 0 0 6px 6px !important; }
        .pin-wrapper { transition: opacity 0.2s ease-out, transform 0.2s ease-out, filter 0.2s ease-out; }
        .pin-wrapper:hover, .leaflet-pin-icon.pin-hovered .pin-wrapper { transform: scale(1.3); filter: brightness(1.3); }
        .leaflet-pin-icon.pin-selected .pin-wrapper svg circle:last-of-type { stroke: ${INK.primary}; stroke-width: 2; }
        .leaflet-pin-icon.pin-dim .pin-wrapper { opacity: 0.2; }
        .gt-far-out .leaflet-pin-icon .pin-wrapper { transform: scale(0.5); }
        .gt-far-out .leaflet-pin-icon .pin-wrapper:hover, .gt-far-out .leaflet-pin-icon.pin-hovered .pin-wrapper { transform: scale(0.7); }
        .leaflet-label-icon, .region-label { background: none !important; border: none !important; }
        .map-label {
          font-family: ${FONT.sans}; font-size: 10px; color: ${INK.primary}; background: rgba(0,0,0,0.7);
          padding: 2px 5px; border-radius: 3px; white-space: nowrap; pointer-events: none; line-height: 1.3;
        }
        .region-label span {
          display: block; text-align: center; font-family: ${FONT.sans}; font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: rgba(255,255,255,0.86); white-space: nowrap; pointer-events: none;
          text-shadow: 0 0 2px rgba(0,0,0,1), 0 0 5px rgba(0,0,0,0.95), 0 1px 8px rgba(0,0,0,0.9);
        }
        .region-label-lg span { font-size: 15px; letter-spacing: 0.2em; color: #fff; }
        .leaflet-control-zoom { border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important; margin-bottom: 16px !important; margin-right: 16px !important; }
        .leaflet-control-zoom a {
          background: ${SURFACE.raised} !important; color: ${INK.secondary} !important; border: 1px solid ${BORDER.subtle} !important;
          width: 28px !important; height: 28px !important; line-height: 28px !important; font-size: 14px !important;
        }
        .leaflet-control-zoom a:hover { background: ${SURFACE.overlay} !important; color: ${BRAND.primary} !important; }
        .leaflet-control-attribution { background: rgba(0,0,0,0.45) !important; color: ${INK.faint} !important; font-size: 9px !important; }
        .leaflet-control-attribution a { color: ${INK.faint} !important; }
        .rto-table-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
        .rto-table-scroll::-webkit-scrollbar { height: 6px; }
        .rto-table-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 3px; }
        .rto-table-scroll::-webkit-scrollbar-track { background: transparent; }
        .upcoming-scroll {
          scrollbar-width: none; -ms-overflow-style: none;
          mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 28px), transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 28px), transparent);
        }
        .upcoming-scroll::-webkit-scrollbar { display: none; }
        @media (prefers-reduced-motion: no-preference) {
          @keyframes pin-pulse-glow { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.15); opacity: 0.15; } }
          .pin-pulse svg circle:first-child { animation: pin-pulse-glow 3s ease-in-out infinite; transform-origin: center; }
          @keyframes gt-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
          .power-map-tooltip, .gt-fade-in { animation: gt-fade 180ms ease-out; }
          @keyframes gt-panel-in { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
          @keyframes gt-sheet-in { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: none; } }
          .gt-panel-in { animation: gt-sheet-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1); }
          @media (min-width: 640px) { .gt-panel-in { animation-name: gt-panel-in; } }
          @keyframes gt-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
          .gt-grow { animation: gt-grow 700ms cubic-bezier(0.2, 0.8, 0.2, 1); transform-origin: left; }
          @keyframes gt-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
          .gt-grow-rows { animation: gt-reveal 800ms ease-out; }
        }
      `}</style>

      {/* The Map chip already names this view, so the heading is kept for the
          document outline only: the map starts right under the chip row. */}
      <SectionHeading className="sr-only" testId="power-header">
        US data center map
      </SectionHeading>

      {belowSm && !step && (
        /* Phones: the numbers sit in one slim strip above the map, where the
           overlay card would cover too much of it. The Map chip names the
           view, so the strip starts with the figures. */
        <div className="border-b border-border px-4 py-2" data-testid="map-mobile-card">
          {activeRegionMeta && (
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: activeRegionMeta.color }} />
              <span className="text-[13px] font-semibold text-foreground">{activeRegionMeta.name}</span>
              <button onClick={closeRegion} className="ml-auto flex items-center gap-1 rounded border border-brand/40 px-1.5 py-0.5 text-10 text-brand">
                whole map <X className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
          {dcError ? <ErrorState label="Campus data failed to load." onRetry={() => refetchCampuses()} className="py-3" /> : overlayStats}
          <RegistryDate dataset="datacenters" className="mt-1 block" />
        </div>
      )}

      <div
        className="relative shrink-0"
        style={{ height: belowSm ? "clamp(420px, 58vh, 780px)" : "clamp(520px, 72vh, 780px)" }}
        ref={mapContainerRef}
        data-testid="map-frame"
      >
        <div
          className={`pointer-events-auto absolute left-3 top-3 z-[1000] max-w-[min(520px,calc(100%-330px))] ${step ? "hidden" : "hidden sm:block"}`}
          data-testid="stats-overlay"
        >
          <div className="rounded-lg border border-subtle bg-surface-raised/90 px-4 py-3 shadow-xl backdrop-blur-md">
            <div className="mb-1.5 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-brand" />
              <span className="text-xs font-semibold tracking-tight text-white/90">{activeRegionMeta ? activeRegionMeta.name : "Power Map"}</span>
              <UITooltip>
                <TooltipTrigger asChild>
                  <button className="text-white/40 transition-colors hover:text-brand" aria-label="What this map counts" data-testid="threshold-banner">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className="z-[1200] max-w-xs p-3">
                  <p className="mb-1.5 text-[11px] font-semibold text-brand">What is counted, and what is not</p>
                  <p className="text-11 leading-snug text-white/70">
                    Tracked campuses and AI clusters are GridTilt's own records, with megawatts and sources. Data center sites are locations from PNNL's atlas of
                    OpenStreetMap: their size is not published, so they are counted and never added to a megawatt figure. Power plants are EIA-860M
                    {plantsQuery.data ? `, ${plantsQuery.data.floorMw} MW and up plus all nuclear` : ""}. For the compute layer see{" "}
                    <Link href="/compute" className="text-brand hover:text-brand-2">Compute</Link>.
                  </p>
                </TooltipContent>
              </UITooltip>
              <RegistryDate dataset="datacenters" />
              {activeRegionMeta && (
                <button onClick={closeRegion} className="ml-1 flex items-center gap-1 rounded border border-brand/40 px-1.5 py-0.5 text-10 text-brand" data-testid="region-clear">
                  whole map <X className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            {dcError ? <span className="text-11 text-white/50">Campus data failed to load.</span> : overlayStats}
          </div>
        </div>

        <div
          className={`pointer-events-auto absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2 transition-[right] duration-200 ${panelOpen ? "sm:right-[392px]" : ""}`}
          data-testid="map-controls"
        >
          {!step && (
            <LayersControl
              layers={layers}
              stress={stress}
              counts={{
                campuses: dcLoading || dcError ? undefined : campuses.length,
                sites: sitesQuery.data?.sites.length,
                clusters: fetchedClusters ? clusters.length : undefined,
                plants: plantsQuery.data?.plants.length,
                regions: shapes?.length,
              }}
              loading={{
                sites: view.layers.includes("sites") && !sitesQuery.data && !sitesQuery.isError,
                plants: view.layers.includes("plants") && !plantsQuery.data && !plantsQuery.isError,
                clusters: view.layers.includes("clusters") && !fetchedClusters && !clError,
              }}
              onToggle={onToggleLayer}
              onStress={(v) => applyView({ ...view, stress: v })}
            />
          )}

          {/* Operator and size are campus fields, so the filter follows the campus layer. */}
          {on("campuses") && !step && !(belowSm && panelOpen) && (
            <button
              onClick={() => (window.innerWidth < 768 ? setMobileFiltersOpen(true) : setFiltersExpanded(!filtersExpanded))}
              className="flex items-center gap-2 rounded-md border border-subtle bg-surface-raised/90 px-3 py-1.5 text-xs text-white/60 shadow-lg backdrop-blur-md transition-colors hover:text-white/90"
              data-testid="filter-bar-toggle"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>Filters</span>
              {anyFilterActive && <span className="rounded-full bg-brand px-1.5 py-0.5 text-10 font-bold leading-none text-black">{activeFilterCount}</span>}
              {!dcLoading && !dcError && <span className="ml-1 text-10 text-white/40">{anyFilterActive ? `${campusList.length}/${campuses.length}` : campuses.length}</span>}
              <ChevronDown className={`h-3 w-3 transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
            </button>
          )}

          {!step && !belowSm && tourButton}
        </div>
        {/* Phone: the top-left corner is free (the figures sit above the map), so the tour starts there. */}
        {!step && belowSm && !panelOpen && <div className="pointer-events-auto absolute left-3 top-3 z-[1000]">{tourButton}</div>}

        {filtersExpanded && on("campuses") && !step && (
          <div className={`pointer-events-auto absolute top-[88px] z-[1000] ${panelOpen ? "right-3 sm:right-[392px]" : "right-3"}`} data-testid="filter-panel">
            <div className="max-h-[60vh] w-[320px] overflow-y-auto rounded-lg border border-subtle bg-surface-raised/95 p-4 shadow-2xl backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-white/80">Filter campuses</span>
                {anyFilterActive && (
                  <button onClick={clearAllFilters} className="text-10 text-white/40 underline underline-offset-2 hover:text-white/70" data-testid="filter-clear-all">
                    Clear all
                  </button>
                )}
              </div>
              {anyFilterActive && (
                <div className="mb-3 flex flex-wrap gap-1.5 border-b border-subtle pb-3">
                  {filterCompanies.map((c) => (
                    <Badge key={c} className="cursor-pointer gap-1 border-brand/30 bg-brand/15 text-10 text-brand hover:bg-brand/25" onClick={() => toggleCompany(c)}>
                      {c}
                      <X className="h-2.5 w-2.5" />
                    </Badge>
                  ))}
                  {filterCapacity !== "all" && (
                    <Badge className="cursor-pointer gap-1 border-brand/30 bg-brand/15 text-10 text-brand hover:bg-brand/25" onClick={() => setCapacity("all")}>
                      {CAPACITY_LABELS[filterCapacity] ?? filterCapacity}
                      <X className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                </div>
              )}
              {filterChips("sm")}
            </div>
          </div>
        )}

        {(!step || step.stress) && (
          <div className="absolute bottom-12 left-3 z-[1000] max-w-[270px] sm:bottom-3">
            <MapLegend layers={layers} stress={stress} plantFuels={plantFuels} defaultOpen={!belowSm} key={belowSm ? "phone" : "desk"} />
          </div>
        )}

        <MapContainer
          center={[39.5, -98.5]}
          zoom={4}
          minZoom={3}
          maxZoom={12}
          zoomSnap={0.25}
          zoomControl={false}
          attributionControl={true}
          style={{ width: "100%", height: "100%", background: SURFACE.base }}
          className="rounded-none"
        >
          <BasemapTiles maxZoom={19} />
          <FitContiguousUs />
          <FarOutClass />
          {on("regions") && shapes && (
            <RegionLayer
              shapes={shapes}
              renderer={renderer}
              stress={stress}
              selected={activeRegion}
              hovered={hoveredRegion}
              spotlight={step ? step.spotlight : null}
              groups={step?.groups ?? null}
              onHover={onRegionHover}
              onSelect={onRegionClick}
            />
          )}
          <PointsLayer
            sites={on("sites") ? sites : null}
            plants={on("plants") ? plants : null}
            renderer={renderer}
            siteFocus={siteFocus}
            plantFocus={plantFocus}
            onHover={onPointHover}
            onPick={onPointPick}
          />
          {on("clusters") && (
            <>
              <ClusterMarkers
                items={clusterList}
                dimmed={dimmedClusters}
                hoveredId={hoveredClusterId}
                setHoveredId={setHoveredClusterId}
                selected={selectedCluster}
                setSelected={(c) => {
                  setSelected(null);
                  setPicked(null);
                  setSelectedCluster(c);
                }}
                setTooltip={setTooltipCluster}
                setTooltipPos={setTooltipPos}
              />
              <ClusterLabels items={clusterList} />
            </>
          )}
          {on("campuses") && (
            <>
              <CampusMarkers
                items={campusList}
                dimmed={dimmedCampuses}
                hoveredId={hoveredId}
                setHoveredId={setHoveredId}
                selected={selected}
                setSelected={(d) => {
                  setSelectedCluster(null);
                  setPicked(null);
                  setSelected(d);
                }}
                setTooltip={setTooltipDC}
                setTooltipPos={setTooltipPos}
              />
              <CampusLabels items={campusList} />
            </>
          )}
          <LayerAttribution text={on("sites") && sitesQuery.data ? "Sites: IM3 Data Center Atlas (PNNL), &copy; OpenStreetMap contributors" : null} />
          <LayerAttribution text={on("plants") && plantsQuery.data ? "Plants: EIA-860M" : null} />
          <LayerAttribution text={on("regions") && shapes ? "Regions: HIFLD (ORNL, 2020), approximate" : null} />
          <MapClickHandler
            onMapClick={() => {
              clearCards();
              if (view.region && !step) selectRegion(null);
            }}
          />
          <FlyTo target={fly} />
          <ZoomControl position="bottomright" />
        </MapContainer>

        {on("campuses") && dcError && (
          <div className="pointer-events-none absolute inset-0 z-[1010] flex items-center justify-center">
            <div className="pointer-events-auto rounded-lg border border-subtle bg-surface-raised/95 px-8 shadow-2xl backdrop-blur-md">
              <ErrorState label="Campus data failed to load." onRetry={() => refetchCampuses()} />
            </div>
          </div>
        )}
        {layerErrors.length > 0 && !dcError && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-[1010] flex justify-center" data-testid="layer-errors">
            <div className="pointer-events-auto rounded-lg border border-subtle bg-surface-raised/95 px-6 shadow-2xl backdrop-blur-md">
              <ErrorState
                label={`${layerErrors.map((e) => e.label).join(", ")} failed to load.`}
                onRetry={() => layerErrors.forEach((e) => e.retry())}
                className="py-3"
              />
            </div>
          </div>
        )}

        <HoverCard register={registerHover} width={mapWidth} live={gridLive} sites={sitesQuery.data} plants={plantsQuery.data} />

        {picked && (
          <div className="power-map-tooltip absolute z-[1002] w-[240px]" style={cardPosition(picked.x, picked.y, mapWidth, 240, 100)} data-testid="point-card">
            <div className="rounded-lg border bg-surface-raised px-3.5 py-2.5 shadow-2xl" style={{ borderColor: alpha(BRAND.primary, 0.3) }}>
              <button onClick={() => setPicked(null)} className="float-right -mr-1.5 -mt-1 rounded p-1 text-white/40 hover:text-white" aria-label="Close">
                <X className="h-3 w-3" />
              </button>
              <PointBody info={picked} sites={sitesQuery.data} plants={plantsQuery.data} />
            </div>
          </div>
        )}

        {displayDC && tooltipPos && (
          <div className="power-map-tooltip pointer-events-none absolute z-[1001]" style={cardPosition(tooltipPos.x, tooltipPos.y, mapWidth, 280, 180)}>
            <div
              className="min-w-[260px] max-w-[280px] overflow-hidden rounded-lg border text-xs shadow-2xl"
              style={{ background: SURFACE.raised, borderColor: alpha(BRAND.primary, 0.3), boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
              data-testid="pin-detail-tooltip"
            >
              <div className="border-b px-4 pb-2 pt-3" style={{ borderColor: BORDER.subtle }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold leading-tight text-white">{displayDC.name}</p>
                  <span
                    className="whitespace-nowrap rounded-full px-2 py-0.5 text-10 font-medium"
                    style={{ backgroundColor: alpha(STATUS_COLORS[displayDC.status], 0.15), color: STATUS_COLORS[displayDC.status] }}
                  >
                    {STATUS_LABEL[displayDC.status]}
                  </span>
                </div>
              </div>
              <div className="space-y-2 px-4 py-3">
                <Row label="Operator">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: companyColors[displayDC.company] ?? INK.faint }} />
                    {displayDC.company}
                  </span>
                </Row>
                <Row label="Location">
                  {displayDC.city}, {displayDC.state}
                </Row>
                <Row label="Capacity">
                  <span className="font-mono text-13 font-bold tabular-nums text-brand-2">{displayDC.powerMW} MW</span>
                </Row>
                <Row label="Grid region">{campusRegionMeta(displayDC)?.name ?? "not in a mapped region"}</Row>
                {selected && (
                  <>
                    <Row label="Annual power">
                      <span className="font-mono tabular-nums">{(displayDC.annualMWh / 1_000_000).toFixed(2)} TWh</span>
                    </Row>
                    <Row label="Online">{displayDC.openDate}</Row>
                  </>
                )}
                <div className="mt-1 space-y-1 pt-1.5" style={{ borderTop: `1px solid ${BORDER.subtle}` }}>
                  {displayDC.clusterId && (
                    <Link
                      href={`/compute-frontier/${displayDC.clusterId}`}
                      className="pointer-events-auto block text-11 text-brand transition-colors hover:text-brand-2"
                      data-testid="link-facility-record"
                    >
                      Reviewed record and sources &rarr;
                    </Link>
                  )}
                  <a href="/markets?tab=equities" className="pointer-events-auto text-11 text-brand transition-colors hover:text-brand-2" data-testid="link-view-in-stack">
                    View in Equities &rarr;
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {!displayDC && displayCluster && tooltipPos && (
          <div className="power-map-tooltip pointer-events-none absolute z-[1001]" style={cardPosition(tooltipPos.x, tooltipPos.y, mapWidth, 280, 180)}>
            <div
              className="min-w-[260px] max-w-[280px] overflow-hidden rounded-lg border text-xs shadow-2xl"
              style={{ background: SURFACE.raised, borderColor: alpha(BRAND.primary, 0.3), boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
              data-testid="cluster-detail-tooltip"
            >
              <div className="border-b px-4 pb-2 pt-3" style={{ borderColor: BORDER.subtle }}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold leading-tight text-white">{displayCluster.name}</p>
                  <span
                    className="whitespace-nowrap rounded-full px-2 py-0.5 text-10 font-medium"
                    style={{ backgroundColor: alpha(STATUS_COLORS[displayCluster.status], 0.15), color: STATUS_COLORS[displayCluster.status] }}
                  >
                    {STATUS_LABEL[displayCluster.status]}
                  </span>
                </div>
                <p className="mt-0.5 text-10 text-white/40">AI cluster record</p>
              </div>
              <div className="space-y-2 px-4 py-3">
                <Row label="Operator">{displayCluster.operator}</Row>
                {(displayCluster.location.city || displayCluster.location.state) && (
                  <Row label="Location">{[displayCluster.location.city, displayCluster.location.state].filter(Boolean).join(", ")}</Row>
                )}
                <Row label="Planned">
                  <span className="font-mono text-13 font-bold tabular-nums text-brand-2">
                    {formatClusterMW(displayCluster.plannedPowerMW)}
                    {isEstimated(displayCluster, "plannedPowerMW") && <span className="ml-1 text-10 font-normal text-white/40">est.</span>}
                  </span>
                </Row>
                {displayCluster.ratedPowerMW > 0 && (
                  <Row label="Rated">
                    <span className="font-mono tabular-nums">
                      {formatClusterMW(displayCluster.ratedPowerMW)}
                      {isEstimated(displayCluster, "ratedPowerMW") && <span className="ml-1 text-10 text-white/40">est.</span>}
                    </span>
                  </Row>
                )}
                {(displayCluster.gpuCount ?? 0) > 0 && (
                  <Row label="GPUs">
                    <span className="font-mono tabular-nums">
                      {(displayCluster.gpuCount ?? 0).toLocaleString()}
                      {clusterChip ? ` ${clusterChip}` : ""}
                      {isEstimated(displayCluster, "gpuCount") && <span className="ml-1 text-10 text-white/40">est.</span>}
                    </span>
                  </Row>
                )}
                {selectedCluster && displayCluster.energySource && <Row label="Power">{displayCluster.energySource}</Row>}
                {selectedCluster && displayCluster.onlineDate && <Row label="Online">{displayCluster.onlineDate}</Row>}
                <div className="mt-1 pt-1.5" style={{ borderTop: `1px solid ${BORDER.subtle}` }}>
                  <Link
                    href={`/compute-frontier/${displayCluster.id}`}
                    className="pointer-events-auto block text-11 text-brand transition-colors hover:text-brand-2"
                    data-testid="link-cluster-record"
                  >
                    Record and sources &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {panelOpen && activeRegion && (
          <RegionPanel
            id={activeRegion}
            stats={stats ? stats[activeRegion] : null}
            sources={{ sitesVersion: sitesQuery.data?.source.version, plantsMonth: plantsQuery.data?.dataMonth, plantsFloorMw: plantsQuery.data?.floorMw }}
            onClose={closeRegion}
            onShowLayer={showOnly}
          />
        )}

        {step && tour !== null && <GridTourCard steps={tourSteps} index={tour} onIndex={setTour} onClose={endTour} />}
      </div>

      {/* Read from payloads the page already fetches. Two columns on desktop
          so the stack reads in about one screen; the source mix spans both. */}
      <div className="lg:grid lg:grid-cols-2" data-testid="map-explainers">
        <BiggestDataCenters scope={regionScope} />
        <CompanyBuildout scope={regionScope} />
        <StateBuildout />
        <BuildoutTimeline />
        <PowerSourceMix />
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-6" data-testid="upcoming-projects-section">
        <div className="mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold text-foreground">Upcoming Projects</h2>
          <span className="text-10 text-muted-foreground/50">Announced campuses not yet built</span>
          {announced.length > 0 && (
            <button onClick={() => setShowAllUpcoming((v) => !v)} className="ml-auto text-10 text-brand transition-colors hover:text-brand-2" data-testid="upcoming-show-all">
              {showAllUpcoming ? "Collapse" : `Show all ${announced.length}`}
            </button>
          )}
        </div>
        {dcLoading && (
          <div className="flex gap-3 overflow-hidden" aria-hidden="true">
            {Array(4)
              .fill(null)
              .map((_, i) => (
                <Skeleton key={i} className="h-[104px] w-52 flex-shrink-0 rounded-md" />
              ))}
          </div>
        )}
        {dcError && <p className="py-2 text-xs text-muted-foreground">Unavailable: campus data failed to load.</p>}
        <div className={showAllUpcoming ? "flex flex-wrap gap-3" : "upcoming-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"}>
          {announced.map((dc) => {
            const region = campusRegionMeta(dc);
            const cColor = companyColors[dc.company] ?? INK.faint;
            return (
              <button
                key={dc.id}
                onClick={() => {
                  setSelectedCluster(null);
                  setSelected(dc);
                  setTooltipPos(null);
                }}
                data-testid={`upcoming-card-${dc.id}`}
                className="w-52 flex-shrink-0 snap-start rounded-md border border-dashed border-border/70 bg-muted/10 p-3 text-left transition-colors hover:border-border hover:bg-muted/20"
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cColor }} />
                  <span className="text-10 font-semibold" style={{ color: cColor }}>
                    {dc.company}
                  </span>
                </div>
                <p className="mb-2 text-xs font-semibold leading-tight text-foreground">{dc.name}</p>
                <div className="flex items-center justify-between font-mono text-10 text-muted-foreground">
                  <span className="font-semibold text-brand-2">{dc.powerMW} MW</span>
                  <span>{dc.openDate}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  {region && (
                    <>
                      <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: region.color, opacity: 0.8 }} />
                      <span className="text-9 text-muted-foreground/70">{region.name}</span>
                    </>
                  )}
                  <span className="ml-auto text-9 text-muted-foreground/50">
                    {dc.city}, {dc.state}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border px-4 py-4 sm:px-6" data-testid="grid-stress-table">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold text-foreground">Load and stress by grid region</h2>
          <span className="text-10 text-muted-foreground/50">
            Reserve margins and risk:{" "}
            <a href={NERC_LTRA.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
              {NERC_LTRA.short}
            </a>
            , summer 2026
          </span>
          <span className="ml-auto hidden text-10 text-muted-foreground/50 sm:inline">Click a row to open the region on the map</span>
        </div>
        <div className="rto-table-scroll overflow-x-auto">
          <table className="w-full min-w-[780px] font-mono text-xs">
            <thead>
              <tr className="border-b border-border/60 font-sans">
                <th className="pb-2 pr-6 text-left font-normal text-muted-foreground/60">Region</th>
                <th className="pb-2 pr-6 text-right font-normal text-muted-foreground/60" title="Operational plus under construction at tracked campuses of 400 MW and up">
                  Tracked AI load
                </th>
                <th className="pb-2 pr-6 text-right font-normal text-muted-foreground/60">Demand now (EIA)</th>
                <th className="pb-2 pr-6 text-right font-normal text-muted-foreground/60">AI load / demand</th>
                <th className="pb-2 pr-6 text-right font-normal text-muted-foreground/60">Reserve margin (reference)</th>
                <th className="pb-2 text-left font-normal text-muted-foreground/60">NERC risk, 2026</th>
              </tr>
            </thead>
            <tbody>
              {GRID_REGIONS.map((r) => {
                const areas = regionNercAreas(r.id);
                const loadMW = stats?.[r.id].campuses?.builtMw400 ?? null;
                const demand = gridLive?.demand[r.liveKey] ?? null;
                const share = demand && loadMW !== null ? aiSharePct(loadMW, demand.latestMw) : null;
                const sColor = RISK_COLOR[regionRiskLevel(r.id)];
                const active = view.region === r.id;
                return (
                  <tr
                    key={r.id}
                    data-testid={`rto-row-${r.id}`}
                    onClick={() => {
                      if (active) closeRegion();
                      else {
                        selectRegion(r.id);
                        mapContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }
                    }}
                    className={`cursor-pointer border-b border-border/30 transition-colors ${active ? "bg-brand/10" : "hover:bg-muted/10"}`}
                  >
                    <td className="py-2 pr-6">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: r.color, opacity: 0.9 }} />
                        {/* A real button, so the keyboard can open a region: the regions on the map are a canvas. */}
                        <button
                          type="button"
                          className="font-semibold text-foreground underline-offset-2 hover:underline focus-visible:underline"
                          aria-pressed={active}
                          aria-label={`${active ? "Close" : "Open"} ${r.name} on the map`}
                          data-testid={`rto-open-${r.id}`}
                        >
                          {r.name}
                        </button>
                        {r.kind === "no-market" && <span className="font-sans text-9 text-muted-foreground/60">no market operator</span>}
                        {active && <span className="font-sans text-9 text-brand">on map</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-6 text-right text-foreground">
                      {dcError || shapesQuery.isError ? (
                        "n/a"
                      ) : dcLoading || loadMW === null ? (
                        <Skeleton className="ml-auto inline-block h-3 w-16" aria-hidden="true" />
                      ) : (
                        `${loadMW.toLocaleString()} MW`
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-6 text-right text-foreground" data-testid={`rto-demand-${r.id}`}>
                      {gridLiveLoading ? (
                        <Skeleton className="ml-auto inline-block h-3 w-16" aria-hidden="true" />
                      ) : demand ? (
                        <span title={`${demand.note} Latest hour ${fmtPeriodET(demand.latestPeriodUtc)}; 7-day peak ${fmtGW(demand.peakMw)} GW.`}>
                          {fmtGW(demand.latestMw)} GW
                          {demand.composed && <span className="font-sans text-9 text-muted-foreground/60"> sum</span>}
                          <span className="block font-sans text-9 text-muted-foreground/60">peak {fmtGW(demand.peakMw)} GW, 7d</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">n/a</span>
                      )}
                    </td>
                    <td className="py-2 pr-6 text-right text-foreground">
                      {gridLiveLoading || dcLoading ? (
                        <Skeleton className="ml-auto inline-block h-3 w-10" aria-hidden="true" />
                      ) : share !== null && !dcError ? (
                        <span title="Tracked nameplate MW divided by this hour's demand: what the campuses would draw at full rating, not metered load.">{share.toFixed(1)}%</span>
                      ) : (
                        <span className="text-muted-foreground/50">n/a</span>
                      )}
                    </td>
                    <td className="py-2 pr-6 text-right text-foreground">
                      {/* One area: its margin and reference. A region NERC assesses in several areas shows the span, never one number. */}
                      {areas.length === 1 ? (
                        <>
                          {areas[0].margin.toFixed(1)}% <span className="text-muted-foreground/60">({areas[0].reference}%)</span>
                        </>
                      ) : (
                        <span className="font-sans text-muted-foreground">{regionMarginText(r.id)}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <Badge className="whitespace-nowrap border-transparent font-sans text-10" style={{ backgroundColor: alpha(sColor, 0.15), color: sColor }}>
                        {regionRiskText(r.id)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <SourceFooter
          className="mt-2"
          source="EIA Hourly Electric Grid Monitor"
          href={gridLive?.sourceUrl ?? "https://www.eia.gov/electricity/gridmonitor/"}
          asOf={gridLive?.latestPeriodUtc ? fmtPeriodET(gridLive.latestPeriodUtc) : null}
          cadence="demand is the latest reported hour; Southeast and West are sums of EIA regions and utilities; a campus counts in the region it sits in as drawn, or the one its utility belongs to where that was checked"
          stale={gridLive?.stale ?? false}
          testid="grid-stress-source"
        />
      </div>

      {mobileFiltersOpen &&
        createPortal(
          <div className="fixed inset-0 z-[60] lg:hidden" data-testid="filter-sheet">
            {/* Tap-outside-to-close for a thumb. Escape covers the keyboard, so
                this is decoration to a screen reader rather than a control. */}
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFiltersOpen(false)} aria-hidden="true" />
            <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-subtle bg-surface-raised p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-white/60" />
                  <span className="text-sm font-semibold text-white">Filter campuses</span>
                  {anyFilterActive && (
                    <span className="font-mono text-10 text-brand">
                      {campusList.length} of {campuses.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {anyFilterActive && (
                    <button onClick={clearAllFilters} className="rounded border border-strong px-2 py-1 text-xs text-white/40">
                      Clear all
                    </button>
                  )}
                  <button onClick={() => setMobileFiltersOpen(false)} className="rounded p-1.5 hover:bg-white/10" aria-label="Close filters">
                    <X className="h-4 w-4 text-white/60" />
                  </button>
                </div>
              </div>
              {filterChips("lg")}
              <button onClick={() => setMobileFiltersOpen(false)} className="mt-5 w-full rounded-md bg-brand py-2.5 text-sm font-semibold text-black">
                Apply Filters
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** One labelled line of a campus or cluster card. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-white/40">{label}</span>
      <span className="text-right text-xs text-white">{children}</span>
    </div>
  );
}
