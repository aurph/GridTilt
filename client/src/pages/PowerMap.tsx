import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import { X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { BORDER, BRAND, FONT, INK, SEMANTIC, SERIES, SURFACE } from "@/lib/tokens";
import { PageShell, PageTitle, Provenance, RuleSection } from "@/components/editorial";
import { ToolTabs, useToolTabs } from "@/components/ToolTabs";
import PowerDeals from "@/pages/power-deals";
import Queue from "@/pages/Queue";

/** Token hex + alpha -> rgba() string, so composed tints stay on token values. */
function alpha(hex: string, a: number): string {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
}

interface DataCenter {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  powerMW: number;
  status: "operational" | "construction" | "announced";
  annualMWh: number;
  gridOperator: string;
  openDate: string;
}

const MIN_TRACKED_MW = 400;

const DATA_CENTERS_FALLBACK: DataCenter[] = [];

// Honor the threshold advertised in the plate caption: only track
// hyperscale-class sites. Smaller historical facilities are filtered out
// everywhere.
function filterTracked(list: DataCenter[]): DataCenter[] {
  return list.filter((d) => d.powerMW >= MIN_TRACKED_MW);
}

import { RTO_CONFIG, type RTOConfig } from "@/data/rto-config";

/**
 * ONE stress ramp for the whole page: region fills (stress view), the map
 * legend, marker colors in stress view, and the table's signal text all read
 * from this SEMANTIC mapping. Nothing else may color a stress level.
 */
const STRESS_COLOR: Record<RTOConfig["aiSignal"], string> = {
  Critical: SEMANTIC.negativeDeep,
  Elevated: SEMANTIC.warning,
  Moderate: SEMANTIC.positiveDeep,
  Low:      SEMANTIC.positive,
};

function gridOpToRTO(op: string): string {
  const o = op.toLowerCase();
  if (o.includes("pjm") || o.includes("ppl") || o.includes("aep")) return "PJM";
  if (o.includes("miso") || o.includes("nipsco") || o.includes("kcp")) return "MISO";
  if (o.includes("ercot")) return "ERCOT";
  if (o.includes("tva") || o.includes("southern") || o.includes("duke") || o.includes("serc") ||
      o.includes("dominion") || o.includes("entergy") || o.includes("santee")) return "SERC";
  if (o.includes("spp") || o.includes("seci")) return "SPP";
  if (o.includes("bpa") || o.includes("wecc") || o.includes("nv energy") || o.includes("rocky") ||
      o.includes("aps") || o.includes("srp") || o.includes("westconnect") || o.includes("caiso") ||
      o.includes("pacificorp") || o.includes("idaho power") || o.includes("el paso")) return "WECC";
  if (o.includes("npcc") || o.includes("iso-ne") || o.includes("nyiso")) return "NPCC";
  return "WECC";
}

// External company brand colors stay literal (migration map exception).
const companyColors: Record<string, string> = {
  Microsoft: "#0078d4",
  Google:    "#4285f4",
  Amazon:    "#ff9900",
  Meta:      "#1877f2",
  Apple:     "#555555",
  xAI:       "#f0a500",
  OpenAI:    "#10a37f",
  Oracle:    "#c74634",
  CoreWeave: "#7c3aed",
  Nebius:    "#00b4d8",
};

/**
 * Marker palette for the paper basemap (map-only; table status reads
 * typographically instead): operational = brand orange fill, construction =
 * warm-ink ring, announced = ochre fill.
 */
const MARKER_COLORS: Record<DataCenter["status"], string> = {
  operational:  BRAND.primary,   // #F07800
  construction: "#F5A25A",   // #5C544A, drawn as a ring
  announced:    "#BDBAB4", // neutral: not yet real
};

/** Status as typography, not a pill: weight and ink step carry the state. */
const STATUS_TEXT: Record<DataCenter["status"], { label: string; className: string }> = {
  operational:  { label: "Operational",        className: "font-semibold text-ink" },
  construction: { label: "Under construction", className: "text-ink-secondary" },
  announced:    { label: "Announced",          className: "text-ink-muted" },
};

function parseFiltersFromURL(): { companies: string[]; rtos: string[]; capacity: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      companies: params.get("companies")?.split(",").filter(Boolean) ?? [],
      rtos:      params.get("rtos")?.split(",").filter(Boolean) ?? [],
      capacity:  params.get("capacity") ?? "all",
    };
  } catch {
    return { companies: [], rtos: [], capacity: "all" };
  }
}

function pushFiltersToURL(companies: string[], rtos: string[], capacity: string) {
  try {
    const params = new URLSearchParams();
    if (companies.length) params.set("companies", companies.join(","));
    if (rtos.length) params.set("rtos", rtos.join(","));
    if (capacity !== "all") params.set("capacity", capacity);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  } catch {}
}

type ViewMode = "dc" | "stress";

// Escape user-controlled strings before interpolating into raw Leaflet
// divIcon HTML. Datacenter names arrive via the admin form / ingester
// pipeline, so an unescaped name is a stored-XSS vector (SEC-5).
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Power tool tabs (consolidation): one subject, three views - where the AI
// load sits (map), who contracted the power (deals), what's still waiting
// on the grid (queue). ?tab= round-trips so each view stays shareable.
const POWER_TABS = [
  { id: "map", label: "Map" },
  { id: "deals", label: "Deals" },
  { id: "queue", label: "Queue" },
];

/**
 * True below Tailwind's `sm` breakpoint (640px). The Leaflet map is
 * desktop-only; below this the page renders an honest placeholder card
 * instead of a broken squeeze, and the map never mounts.
 */
function useBelowSm(): boolean {
  const [below, setBelow] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const onChange = () => setBelow(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return below;
}

/**
 * Continuous sqrt scale: marker AREA ~ facility MW. Dataset floor (400 MW)
 * maps to 6px radius; the current max (1.5 GW) lands near 11.6px.
 */
function pinRadius(powerMW: number): number {
  return Math.min(13, Math.max(5, 6 * Math.sqrt(powerMW / MIN_TRACKED_MW)));
}

function stressColorForRTO(dc: DataCenter): string {
  const cfg = RTO_CONFIG[gridOpToRTO(dc.gridOperator)];
  return cfg ? STRESS_COLOR[cfg.aiSignal] : SEMANTIC.positiveDeep;
}

/**
 * Capacity buckets match the tracked dataset (400 MW floor, 1.5 GW max):
 * 400-600 / 600-1000 / >= 1 GW. Keys keep the legacy small/medium/large
 * values so shared filter URLs and data-testids stay stable.
 */
function passesCapacity(powerMW: number, capacity: string): boolean {
  if (capacity === "small"  && powerMW >= 600) return false;
  if (capacity === "medium" && (powerMW < 600 || powerMW >= 1000)) return false;
  if (capacity === "large"  && powerMW < 1000) return false;
  return true;
}

/** Single filter predicate shared by markers, labels, and counts. */
function dcPassesFilters(
  dc: DataCenter,
  filterCompanies: string[],
  filterRTOs: string[],
  filterCapacity: string,
  rtoFocus: string | null,
): boolean {
  if (filterCompanies.length > 0 && !filterCompanies.includes(dc.company)) return false;
  if (filterRTOs.length > 0 && !filterRTOs.includes(gridOpToRTO(dc.gridOperator))) return false;
  if (rtoFocus && gridOpToRTO(dc.gridOperator) !== rtoFocus) return false;
  if (!passesCapacity(dc.powerMW, filterCapacity)) return false;
  return true;
}

/**
 * Paper markers: flat circles, no glow, no pulse. Operational fills orange,
 * announced fills ochre, construction draws as a warm-ink ring; stress view
 * fills with the stress ramp. A thin paper stroke separates fills from the
 * basemap.
 */
function createPinIcon(dc: DataCenter, viewMode: ViewMode): L.DivIcon {
  const r = pinRadius(dc.powerMW);
  const color = viewMode === "stress" ? stressColorForRTO(dc) : MARKER_COLORS[dc.status];
  const ring = viewMode === "dc" && dc.status === "construction";
  const size = Math.ceil((r + 4) * 2);
  const center = size / 2;

  const circle = ring
    ? `<circle cx="${center}" cy="${center}" r="${r}" fill="${SURFACE.base}" fill-opacity="0.55" stroke="${color}" stroke-width="2" />`
    : `<circle cx="${center}" cy="${center}" r="${r}" fill="${color}" stroke="${SURFACE.overlay}" stroke-width="1" />`;

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${circle}</svg>`;

  return L.divIcon({
    html: `<div class="pin-wrapper">${svg}</div>`,
    className: "leaflet-pin-icon",
    iconSize: [size, size],
    iconAnchor: [center, center],
  });
}

const STATE_TO_RTO: Record<string, string> = {
  Maine: "NPCC", Vermont: "NPCC", "New Hampshire": "NPCC",
  Massachusetts: "NPCC", Connecticut: "NPCC", "Rhode Island": "NPCC", "New York": "NPCC",
  "New Jersey": "PJM", Delaware: "PJM", Maryland: "PJM",
  Pennsylvania: "PJM", Ohio: "PJM", "West Virginia": "PJM", Virginia: "PJM", Kentucky: "PJM",
  Michigan: "MISO", Indiana: "MISO", Illinois: "MISO", Wisconsin: "MISO",
  Minnesota: "MISO", Iowa: "MISO", Missouri: "MISO",
  Arkansas: "MISO", Louisiana: "MISO", Mississippi: "MISO",
  "North Dakota": "MISO", "South Dakota": "MISO", Montana: "MISO",
  Texas: "ERCOT",
  Tennessee: "SERC", "North Carolina": "SERC", "South Carolina": "SERC",
  Georgia: "SERC", Alabama: "SERC", Florida: "SERC",
  Nebraska: "SPP", Kansas: "SPP", Oklahoma: "SPP",
  Washington: "WECC", Oregon: "WECC", California: "WECC",
  Nevada: "WECC", Idaho: "WECC", Utah: "WECC", Colorado: "WECC",
  Arizona: "WECC", "New Mexico": "WECC", Wyoming: "WECC",
  Alaska: "WECC", Hawaii: "WECC",
};

/**
 * RTO IDENTITY hue (dc view fills, filter chips, upcoming cards, table row
 * chips): SERIES slots in fixed order. One truth for "which color is PJM".
 */
const RTO_MUTED_COLORS: Record<string, string> = {
  PJM: SERIES[0],   // series slot 1
  MISO: SERIES[1],  // series slot 2
  ERCOT: SERIES[2], // series slot 3
  WECC: SERIES[3],  // series slot 4
  SERC: SERIES[4],  // series slot 5
  SPP: SERIES[5],   // series slot 6
  NPCC: SERIES[6],  // series slot 7
};

// Self-hosted copy of us-atlas states-10m (client/public/geo/). The CDN
// original is blocked by our CSP (connect-src 'self'), which silently
// stripped the state outlines from the map.
// ?v= busts the static-asset cache if this file is ever replaced (the
// public/ path is not content-hashed by the build).
const GEO_URL = "/geo/us-states-10m.json?v=1";

function RTORegions({ viewMode }: { viewMode: ViewMode }) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGeo() {
      try {
        const topoResp = await fetch(GEO_URL);
        const topo = await topoResp.json();
        if (cancelled) return;

        const topojsonModule = await import("topojson-client");
        const geoData = topojsonModule.feature(topo, topo.objects.states) as any;

        const stateNames: Record<string, string> = {};
        if (topo.objects.states.geometries) {
          topo.objects.states.geometries.forEach((g: any) => {
            if (g.properties?.name) stateNames[g.id] = g.properties.name;
          });
        }

        if (layerRef.current) {
          map.removeLayer(layerRef.current);
        }

        const isDC = viewMode === "dc";

        layerRef.current = L.geoJSON(geoData, {
          style: (feature) => {
            const stateId = feature?.id as string;
            const stateName = stateNames[stateId] || feature?.properties?.name || "";
            const rto = STATE_TO_RTO[stateName];
            if (!rto) {
              return { fillColor: INK.primary, fillOpacity: 0.02, color: BORDER.subtle, weight: 0.5 };
            }
            const cfg = RTO_CONFIG[rto];
            const fillColor = isDC
              ? (RTO_MUTED_COLORS[rto] || INK.muted)
              : (cfg ? STRESS_COLOR[cfg.aiSignal] : SEMANTIC.positiveDeep);
            const fillOpacity = isDC ? 0.08 : 0.22;
            return {
              fillColor,
              fillOpacity,
              color: BORDER.strong,
              weight: 1,
            };
          },
          onEachFeature: (_feature, layer) => {
            layer.on({
              mouseover: (e) => {
                const l = e.target;
                l.setStyle({ fillOpacity: isDC ? 0.18 : 0.32 });
              },
              mouseout: (e) => {
                const l = e.target;
                l.setStyle({ fillOpacity: isDC ? 0.08 : 0.22 });
              },
            });
          },
          interactive: true,
        }).addTo(map);

        layerRef.current.bringToBack();
      } catch (err) {
        console.error("Failed to load GeoJSON:", err);
      }
    }

    loadGeo();

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, viewMode]);

  return null;
}

function FacilityLabels({ viewMode, filterCompanies, filterRTOs, filterCapacity, rtoFocus, dataCenters }: {
  viewMode: ViewMode;
  filterCompanies: string[];
  filterRTOs: string[];
  filterCapacity: string;
  rtoFocus: string | null;
  dataCenters: DataCenter[];
}) {
  const map = useMap();
  const labelsRef = useRef<L.LayerGroup | null>(null);

  const passesFilter = useCallback((dc: DataCenter): boolean => {
    return dcPassesFilters(dc, filterCompanies, filterRTOs, filterCapacity, rtoFocus);
  }, [filterCompanies, filterRTOs, filterCapacity, rtoFocus]);

  useEffect(() => {
    function updateLabels() {
      if (labelsRef.current) {
        labelsRef.current.clearLayers();
      } else {
        labelsRef.current = L.layerGroup().addTo(map);
      }

      const zoom = map.getZoom();
      if (zoom < 6 || viewMode !== "dc") return;

      const minMW = zoom >= 8 ? 0 : 500;

      dataCenters.forEach((dc) => {
        if (!passesFilter(dc)) return;
        if (dc.powerMW < minMW) return;

        const truncName = dc.name.length > 20 ? dc.name.slice(0, 18) + ".." : dc.name;
        const label = L.marker([dc.lat, dc.lng], {
          icon: L.divIcon({
            html: `<div class="map-label">${escapeHtml(truncName)}</div>`,
            className: "leaflet-label-icon",
            iconSize: [120, 16],
            iconAnchor: [-8, 20],
          }),
          interactive: false,
          zIndexOffset: -10,
        });

        label.addTo(labelsRef.current!);
      });
    }

    updateLabels();
    map.on("zoomend", updateLabels);

    return () => {
      map.off("zoomend", updateLabels);
      if (labelsRef.current) {
        labelsRef.current.clearLayers();
      }
    };
  }, [map, viewMode, passesFilter, dataCenters]);

  return null;
}

function FacilityMarkers({
  viewMode,
  filterCompanies,
  filterRTOs,
  filterCapacity,
  rtoFocus,
  hoveredId,
  setHoveredId,
  selected,
  setSelected,
  setTooltipDC,
  setTooltipPos,
  dataCenters,
}: {
  viewMode: ViewMode;
  filterCompanies: string[];
  filterRTOs: string[];
  filterCapacity: string;
  rtoFocus: string | null;
  hoveredId: number | null;
  setHoveredId: (id: number | null) => void;
  selected: DataCenter | null;
  setSelected: (dc: DataCenter | null) => void;
  setTooltipDC: (dc: DataCenter | null) => void;
  setTooltipPos: (pos: { x: number; y: number } | null) => void;
  dataCenters: DataCenter[];
}) {
  const map = useMap();
  const markersRef = useRef<Record<number, L.Marker>>({});
  const clusterRef = useRef<L.LayerGroup | null>(null);

  const passesFilter = useCallback((dc: DataCenter): boolean => {
    return dcPassesFilters(dc, filterCompanies, filterRTOs, filterCapacity, rtoFocus);
  }, [filterCompanies, filterRTOs, filterCapacity, rtoFocus]);

  // Build the cluster layer + markers. NOTE: hoveredId/selected are
  // deliberately NOT deps here - hover/selection restyle imperatively below,
  // so mouseover no longer tears down and rebuilds every layer (audit perf fix).
  useEffect(() => {
    // No clustering: 33 facilities read better as individual sized pins
    // than as abstract count bubbles. Every node stays inspectable.
    if (!clusterRef.current) {
      clusterRef.current = L.layerGroup();
      map.addLayer(clusterRef.current);
    }

    const group = clusterRef.current;
    group.clearLayers();

    const markers: Record<number, L.Marker> = {};

    dataCenters.forEach((dc) => {
      if (!passesFilter(dc)) return;

      const marker = L.marker([dc.lat, dc.lng], {
        icon: createPinIcon(dc, viewMode),
        zIndexOffset: dc.status === "operational" ? 100 : dc.status === "construction" ? 50 : 0,
      });

      marker.on("mouseover", (e) => {
        setHoveredId(dc.id);
        setTooltipDC(dc);
        const point = map.latLngToContainerPoint(e.latlng);
        setTooltipPos({ x: point.x, y: point.y });
      });

      marker.on("mouseout", () => {
        setHoveredId(null);
        setTooltipDC(null);
        setTooltipPos(null);
      });

      marker.on("click", (e) => {
        setSelected(dc);
        setHoveredId(null);
        setTooltipDC(null);
        const point = map.latLngToContainerPoint(e.latlng);
        setTooltipPos({ x: point.x, y: point.y });
      });

      markers[dc.id] = marker;
    });

    Object.values(markers).forEach((m) => group.addLayer(m));
    markersRef.current = markers;

    return () => {
      group.clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, passesFilter, viewMode, dataCenters]);

  // Remove the cluster layer on unmount.
  useEffect(() => {
    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
      }
    };
  }, [map]);

  // Imperative hover restyle: pop the hovered marker without rebuilding layers.
  const prevHoveredRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevHoveredRef.current;
    if (prev !== null && prev !== hoveredId) {
      const m = markersRef.current[prev];
      if (m) {
        m.getElement()?.classList.remove("pin-hovered");
        const dc = dataCenters.find((d) => d.id === prev);
        m.setZIndexOffset(dc?.status === "operational" ? 100 : dc?.status === "construction" ? 50 : 0);
      }
    }
    if (hoveredId !== null) {
      const m = markersRef.current[hoveredId];
      if (m) {
        m.getElement()?.classList.add("pin-hovered");
        m.setZIndexOffset(1000);
      }
    }
    prevHoveredRef.current = hoveredId;
  }, [hoveredId, dataCenters]);

  // Imperative selection ring.
  const prevSelectedRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevSelectedRef.current;
    if (prev !== null && prev !== selected?.id) {
      markersRef.current[prev]?.getElement()?.classList.remove("pin-selected");
    }
    if (selected) {
      markersRef.current[selected.id]?.getElement()?.classList.add("pin-selected");
    }
    prevSelectedRef.current = selected?.id ?? null;
  }, [selected]);

  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({
    click: () => {
      onMapClick();
    },
  });
  return null;
}

/** Legend/overlay status swatch: dot for fills, ring for construction. */
function StatusSwatch({ status }: { status: DataCenter["status"] }) {
  if (status === "construction") {
    return (
      <span
        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
        style={{ border: `1.5px solid ${MARKER_COLORS.construction}` }}
      />
    );
  }
  return (
    <span
      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: MARKER_COLORS[status] }}
    />
  );
}

export default function PowerMap() {
  const initialFilters = useMemo(() => parseFiltersFromURL(), []);

  const {
    data: fetchedDataCenters,
    isLoading: dcLoading,
    isError: dcError,
    refetch: refetchDataCenters,
    dataUpdatedAt,
  } = useQuery<DataCenter[]>({
    queryKey: ["/api/datacenters"],
  });
  const belowSm = useBelowSm();
  const dataCenters = useMemo(
    () => filterTracked(fetchedDataCenters ?? DATA_CENTERS_FALLBACK),
    [fetchedDataCenters],
  );

  const [selected, setSelected]           = useState<DataCenter | null>(null);
  const [viewMode, setViewMode]           = useState<ViewMode>("dc");
  const [hoveredId, setHoveredId]         = useState<number | null>(null);
  const [tooltipDC, setTooltipDC]         = useState<DataCenter | null>(null);
  const [tooltipPos, setTooltipPos]       = useState<{ x: number; y: number } | null>(null);
  const [filterCompanies, setFilterCompanies] = useState<string[]>(initialFilters.companies);
  const [filterRTOs, setFilterRTOs]       = useState<string[]>(initialFilters.rtos);
  const [filterCapacity, setFilterCapacity]   = useState<string>(initialFilters.capacity);
  const [rtoFocus, setRtoFocus]           = useState<string | null>(null);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useToolTabs(POWER_TABS, "map");

  function toggleCompany(c: string) {
    const next = filterCompanies.includes(c)
      ? filterCompanies.filter((x) => x !== c)
      : [...filterCompanies, c];
    setFilterCompanies(next);
    pushFiltersToURL(next, filterRTOs, filterCapacity);
  }

  function toggleRTO(rto: string) {
    const next = filterRTOs.includes(rto)
      ? filterRTOs.filter((x) => x !== rto)
      : [...filterRTOs, rto];
    setFilterRTOs(next);
    pushFiltersToURL(filterCompanies, next, filterCapacity);
  }

  function setCapacity(cap: string) {
    setFilterCapacity(cap);
    pushFiltersToURL(filterCompanies, filterRTOs, cap);
  }

  function clearAllFilters() {
    setFilterCompanies([]);
    setFilterRTOs([]);
    setFilterCapacity("all");
    pushFiltersToURL([], [], "all");
    setMobileFiltersOpen(false);
  }

  function removeCompanyFilter(c: string) {
    const next = filterCompanies.filter((x) => x !== c);
    setFilterCompanies(next);
    pushFiltersToURL(next, filterRTOs, filterCapacity);
  }

  function removeRTOFilter(rto: string) {
    const next = filterRTOs.filter((x) => x !== rto);
    setFilterRTOs(next);
    pushFiltersToURL(filterCompanies, next, filterCapacity);
  }

  function removeCapacityFilter() {
    setFilterCapacity("all");
    pushFiltersToURL(filterCompanies, filterRTOs, "all");
  }

  function toggleRtoFocus(rto: string) {
    setRtoFocus((f) => (f === rto ? null : rto));
  }

  const activeFilterCount = filterCompanies.length + filterRTOs.length + (filterCapacity !== "all" ? 1 : 0);
  const anyFilterActive = activeFilterCount > 0;

  const filteredCount = useMemo(() => {
    return dataCenters.filter((dc) =>
      dcPassesFilters(dc, filterCompanies, filterRTOs, filterCapacity, rtoFocus)
    ).length;
  }, [filterCompanies, filterRTOs, filterCapacity, rtoFocus, dataCenters]);

  const allCompanies = useMemo(
    () => Array.from(new Set(dataCenters.map((d) => d.company))).sort(),
    [dataCenters]
  );

  const companyCounts = useMemo(() => {
    const m: Record<string, number> = {};
    dataCenters.forEach((dc) => { m[dc.company] = (m[dc.company] ?? 0) + 1; });
    return m;
  }, [dataCenters]);

  const rtoCounts = useMemo(() => {
    const m: Record<string, number> = {};
    dataCenters.forEach((dc) => {
      const rto = gridOpToRTO(dc.gridOperator);
      m[rto] = (m[rto] ?? 0) + 1;
    });
    return m;
  }, [dataCenters]);

  const announced = dataCenters.filter((d) => d.status === "announced");

  // Headline matches the overview's Tracked AI Power gauge: operational +
  // construction only. Announced projects are press releases, not steel -
  // they render on the map but stay out of the GW headline.
  const totalMW  = dataCenters.reduce((s, d) => s + (d.status === "announced" ? 0 : d.powerMW), 0);
  const announcedMW = dataCenters.reduce((s, d) => s + (d.status === "announced" ? d.powerMW : 0), 0);
  const totalTWh = (dataCenters.reduce((s, d) => s + d.annualMWh, 0) / 1_000_000).toFixed(1);
  const opCount  = dataCenters.filter((d) => d.status === "operational").length;
  const conCount = dataCenters.filter((d) => d.status === "construction").length;
  const annCount = dataCenters.filter((d) => d.status === "announced").length;

  const rtoLoadMW = useMemo(() => {
    const m: Record<string, number> = {};
    dataCenters.forEach((dc) => {
      const rto = gridOpToRTO(dc.gridOperator);
      m[rto] = (m[rto] ?? 0) + dc.powerMW;
    });
    return m;
  }, [dataCenters]);

  const ALL_RTOS = ["PJM", "MISO", "ERCOT", "WECC", "SERC", "SPP", "NPCC"] as const;

  const capacityLabels: Record<string, string> = {
    small: "400-600 MW",
    medium: "600-1000 MW",
    large: "1 GW+",
  };

  const displayDC = selected || tooltipDC;
  const showTooltip = displayDC && tooltipPos;

  const legendSizes = [
    { mw: 500, label: "500 MW" },
    { mw: 1000, label: "1 GW" },
    { mw: 1500, label: "1.5 GW" },
  ];

  const chipBase = "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[12px] transition-colors";
  const chipOn = "border-rule-strong bg-brand/10 font-medium text-brand-ink";
  const chipOff = "border-rule text-ink-secondary hover:bg-paper-shade hover:text-ink";

  return (
    <PageShell wide>
      <style>{`
        .leaflet-pin-icon {
          background: none !important;
          border: none !important;
        }
        .leaflet-container {
          background: ${SURFACE.base} !important;
          font-family: inherit;
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 1px 4px rgba(28, 23, 18, 0.18) !important;
          margin-bottom: 16px !important;
          margin-right: 16px !important;
        }
        .leaflet-control-zoom a {
          background: ${SURFACE.overlay} !important;
          color: ${INK.secondary} !important;
          border: 1px solid ${BORDER.subtle} !important;
          width: 28px !important;
          height: 28px !important;
          line-height: 28px !important;
          font-size: 14px !important;
        }
        .leaflet-control-zoom-in {
          border-radius: 2px 2px 0 0 !important;
          border-bottom: none !important;
        }
        .leaflet-control-zoom-out {
          border-radius: 0 0 2px 2px !important;
        }
        .leaflet-control-zoom a:hover {
          background: ${SURFACE.raised} !important;
          color: ${INK.primary} !important;
        }
        .leaflet-control-attribution {
          background: rgba(246, 242, 234, 0.8) !important;
          color: ${INK.muted} !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a {
          color: ${INK.muted} !important;
        }
        .pin-wrapper {
          transition: transform 0.15s ease-out;
        }
        .pin-wrapper:hover,
        .leaflet-pin-icon.pin-hovered .pin-wrapper {
          transform: scale(1.25);
        }
        .leaflet-pin-icon.pin-selected .pin-wrapper svg circle {
          stroke: ${INK.primary};
          stroke-width: 2;
        }
        /* Cluster badge on paper. MarkerCluster.Default.css (the library's
           blue blobs) is not imported; iconCreateFunction emits .gt-cluster,
           so this block is the entire cluster style. */
        .gt-cluster-wrap {
          background: none !important;
          border: none !important;
        }
        .gt-cluster {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: ${SURFACE.raised};
          border: 1.5px solid ${BRAND.primary};
          color: ${INK.primary};
          font-family: ${FONT.sans};
          font-size: 12px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          box-shadow: 0 0 0 3px ${alpha(BRAND.primary, 0.15)}, 0 1px 4px rgba(28, 23, 18, 0.18);
        }
        .power-map-tooltip {
          animation: tooltip-fade-in 150ms ease-out;
        }
        @keyframes tooltip-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .leaflet-label-icon {
          background: none !important;
          border: none !important;
        }
        .map-label {
          font-family: ${FONT.sans};
          font-size: 11px;
          color: ${INK.primary};
          background: rgba(246, 242, 234, 0.85);
          border: 1px solid ${BORDER.subtle};
          padding: 1px 5px;
          border-radius: 2px;
          white-space: nowrap;
          pointer-events: none;
          line-height: 1.3;
        }
        .upcoming-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
          mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 28px), transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 20px, black calc(100% - 28px), transparent);
        }
        .upcoming-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <PageTitle
        title="Power"
        testId="power-header"
      />

      <ToolTabs tabs={POWER_TABS} active={tab} onChange={setTab} />

      {tab === "deals" && (
        <div className="mt-6">
          <PowerDeals embedded />
        </div>
      )}
      {tab === "queue" && (
        <div className="mt-6">
          <Queue embedded />
        </div>
      )}

      {tab === "map" && (<>
      {belowSm ? (
        /* The Leaflet map is desktop-only. On phones this honest plate takes
           its place; the headline numbers, upcoming projects, and grid
           operator table below stay fully usable. */
        <div className="mt-6" data-testid="map-mobile-card">
          <div className="rounded-sm border border-rule bg-surface-raised p-4">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-[15px] font-semibold text-ink">Power map</span>
              <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} className="ml-auto" />
            </div>
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-secondary">
              The map needs a desktop screen. Everything else on this page works here:
              the numbers below, upcoming projects, and the grid operator table.
            </p>
            {dcError ? (
              <ErrorState label="Facility data failed to load." onRetry={() => refetchDataCenters()} className="py-4" />
            ) : dcLoading ? (
              <Skeleton className="h-5 w-56" aria-hidden="true" />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-secondary">
                <span
                  className="font-semibold text-ink tnum"
                  title={`operational + construction; announced (+${(announcedMW / 1000).toFixed(1)} GW) excluded`}
                >
                  {(totalMW / 1000).toFixed(1)} GW
                </span>
                <span className="tnum">{dataCenters.length} facilities</span>
                <span className="tnum">{totalTWh} TWh/yr</span>
                <span className="flex items-center gap-2.5">
                  <span className="flex items-center gap-1"><StatusSwatch status="operational" /><span className="tnum">{opCount}</span></span>
                  <span className="flex items-center gap-1"><StatusSwatch status="construction" /><span className="tnum">{conCount}</span></span>
                  <span className="flex items-center gap-1"><StatusSwatch status="announced" /><span className="tnum">{annCount}</span></span>
                </span>
              </div>
            )}
          </div>
          <Provenance
            source="GridTilt facility registry"
            extra={dataUpdatedAt ? <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} /> : undefined}
          />
        </div>
      ) : (
      <>
        {/* The map as a captioned plate: hairline border, caption row,
            provenance line. `isolate` keeps Leaflet's internal z-indexes
            from painting over the sticky masthead. */}
        <figure className="isolate mt-6 border border-rule">
          <div
            className="relative h-[62vh] max-h-[680px] min-h-[520px]"
            ref={mapContainerRef}
          >
          <div className="absolute top-3 left-3 z-[1000] pointer-events-auto" data-testid="stats-overlay">
            <div className="rounded-sm border border-rule bg-surface-overlay/95 px-4 py-2.5 shadow-md">
              <div className="flex items-baseline gap-2.5">
                <span
                  className="text-[17px] font-semibold text-ink tnum"
                  title={`operational + construction; announced (+${(announcedMW / 1000).toFixed(1)} GW) excluded`}
                >
                  {dcLoading ? "…" : dcError ? "—" : `${(totalMW / 1000).toFixed(1)} GW`}
                </span>
                <span className="text-[12px] text-ink-muted tnum">
                  {dcLoading ? "loading" : dcError ? "load failed" : `${dataCenters.length} facilities · ${totalTWh} TWh/yr`}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[12px] text-ink-secondary">
                <span className="flex items-center gap-1.5"><StatusSwatch status="operational" /><span className="tnum">{opCount}</span> operational</span>
                <span className="flex items-center gap-1.5"><StatusSwatch status="construction" /><span className="tnum">{conCount}</span> building</span>
                <span className="flex items-center gap-1.5"><StatusSwatch status="announced" /><span className="tnum">{annCount}</span> announced</span>
              </div>
              <div className="mt-1">
                <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
              </div>
            </div>
          </div>

          <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2 pointer-events-auto">
            <div className="flex overflow-hidden rounded-sm border border-rule text-[12.5px] shadow-sm">
              <button
                className={`px-3 py-1.5 transition-colors ${viewMode === "dc" ? "bg-paper-deep font-semibold text-ink" : "bg-surface-overlay/95 text-ink-secondary hover:text-ink"}`}
                onClick={() => setViewMode("dc")}
                data-testid="toggle-dc-locations"
              >
                Facilities
              </button>
              <button
                className={`border-l border-rule px-3 py-1.5 transition-colors ${viewMode === "stress" ? "bg-paper-deep font-semibold text-ink" : "bg-surface-overlay/95 text-ink-secondary hover:text-ink"}`}
                onClick={() => setViewMode("stress")}
                data-testid="toggle-grid-stress"
              >
                Grid stress
              </button>
            </div>

            <button
              onClick={() => {
                const isMobile = window.innerWidth < 768;
                if (isMobile) {
                  setMobileFiltersOpen(true);
                } else {
                  setFiltersExpanded(!filtersExpanded);
                }
              }}
              className="flex items-center gap-2 rounded-sm border border-rule bg-surface-overlay/95 px-3 py-1.5 text-[12.5px] text-ink-secondary shadow-sm transition-colors hover:text-ink"
              data-testid="filter-bar-toggle"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>Filters</span>
              {anyFilterActive && (
                <span className="rounded-full bg-brand px-1.5 text-[12px] font-semibold leading-[17px] text-ink tnum">
                  {activeFilterCount}
                </span>
              )}
              <span className="text-[12px] text-ink-muted tnum">
                {anyFilterActive || rtoFocus ? `${filteredCount}/${dataCenters.length}` : `${dataCenters.length}`}
              </span>
              <ChevronDown className={`h-3 w-3 transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
            </button>

            {rtoFocus && (
              <button
                onClick={() => setRtoFocus(null)}
                className="flex items-center gap-1.5 rounded-sm border border-rule-strong bg-brand/10 px-2.5 py-1 text-[12px] font-medium text-brand-ink shadow-sm"
                data-testid="map-rto-focus-chip"
              >
                <span>{rtoFocus} facilities only</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {filtersExpanded && (
            <div className="absolute top-[92px] right-3 z-[1000] pointer-events-auto" data-testid="filter-panel">
              <div className="max-h-[60vh] w-[320px] overflow-y-auto rounded-sm border border-rule bg-surface-overlay/95 p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink">Filter facilities</span>
                  {anyFilterActive && (
                    <button
                      onClick={clearAllFilters}
                      className="text-[12px] text-ink-muted underline underline-offset-2 hover:text-ink"
                      data-testid="filter-clear-all"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {anyFilterActive && (
                  <div className="mb-3 flex flex-wrap gap-1.5 border-b border-rule pb-3">
                    {filterCompanies.map((c) => (
                      <button key={c} className={`${chipBase} ${chipOn}`} onClick={() => removeCompanyFilter(c)}>
                        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: companyColors[c] ?? INK.faint }} />
                        {c}
                        <X className="h-2.5 w-2.5" />
                      </button>
                    ))}
                    {filterRTOs.map((rto) => (
                      <button key={rto} className={`${chipBase} ${chipOn}`} onClick={() => removeRTOFilter(rto)}>
                        {rto}
                        <X className="h-2.5 w-2.5" />
                      </button>
                    ))}
                    {filterCapacity !== "all" && (
                      <button className={`${chipBase} ${chipOn}`} onClick={removeCapacityFilter}>
                        {capacityLabels[filterCapacity]}
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-ink-muted">Operator</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allCompanies.map((c) => {
                        const active = filterCompanies.includes(c);
                        const color = companyColors[c] ?? INK.faint;
                        return (
                          <button
                            key={c}
                            data-testid={`filter-company-${c.toLowerCase().replace(/\s+/g, "-")}`}
                            onClick={() => toggleCompany(c)}
                            className={`${chipBase} ${active ? chipOn : chipOff}`}
                          >
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
                            {c}
                            <span className="text-ink-muted tnum">({companyCounts[c] ?? 0})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[12px] font-medium text-ink-muted">Grid region</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_RTOS.map((rto) => {
                        const active = filterRTOs.includes(rto);
                        const color = RTO_MUTED_COLORS[rto] ?? INK.faint;
                        return (
                          <button
                            key={rto}
                            data-testid={`filter-rto-${rto.toLowerCase()}`}
                            onClick={() => toggleRTO(rto)}
                            className={`${chipBase} ${active ? chipOn : chipOff}`}
                          >
                            <span className="h-1.5 w-1.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: color, opacity: 0.85 }} />
                            {rto}
                            <span className="text-ink-muted tnum">({rtoCounts[rto] ?? 0})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[12px] font-medium text-ink-muted">Capacity</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: "all",    label: "All" },
                        { key: "small",  label: "400-600 MW" },
                        { key: "medium", label: "600-1000" },
                        { key: "large",  label: "1 GW+" },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          data-testid={`filter-capacity-${key}`}
                          onClick={() => setCapacity(key)}
                          className={`${chipBase} ${filterCapacity === key ? chipOn : chipOff}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-3 z-[1000] pointer-events-none" data-testid="map-legend">
            <div className="rounded-sm border border-rule bg-surface-overlay/95 px-3 py-2.5 shadow-sm">
              {viewMode === "dc" ? (
                <div className="flex items-start gap-5">
                  <div>
                    <p className="mb-1.5 text-[11.5px] text-ink-muted">Size = capacity</p>
                    <div className="flex items-end gap-2.5">
                      {legendSizes.map(({ mw, label }) => {
                        const d = Math.round(pinRadius(mw) * 2);
                        return (
                          <div key={mw} className="flex flex-col items-center gap-1">
                            <span
                              className="rounded-full border"
                              style={{
                                width: d,
                                height: d,
                                borderColor: INK.secondary,
                                backgroundColor: alpha(INK.secondary, 0.12),
                              }}
                            />
                            <span className="whitespace-nowrap text-[11.5px] text-ink-secondary">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[11.5px] text-ink-muted">Color = status</p>
                    <div className="space-y-1 text-[12px] text-ink-secondary">
                      <div className="flex items-center gap-1.5"><StatusSwatch status="operational" />Operational</div>
                      <div className="flex items-center gap-1.5"><StatusSwatch status="construction" />Construction</div>
                      <div className="flex items-center gap-1.5"><StatusSwatch status="announced" />Announced</div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-1.5 text-[11.5px] text-ink-muted">Grid stress</p>
                  <div className="space-y-1 text-[12px] text-ink-secondary">
                    {([
                      ["Critical", "<16%"],
                      ["Elevated", "16-18%"],
                      ["Moderate", "18-25%"],
                      ["Low", ">25%"],
                    ] as const).map(([sig, range]) => (
                      <div key={sig} className="flex items-center gap-1.5">
                        <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: alpha(STRESS_COLOR[sig], 0.6) }} />
                        {sig} ({range})
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <MapContainer
            center={[39.5, -98.5]}
            zoom={4}
            minZoom={3}
            maxZoom={12}
            zoomControl={false}
            attributionControl={true}
            style={{ width: "100%", height: "100%", background: SURFACE.base }}
            className="rounded-none"
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains="abcd"
              maxZoom={19}
            />
            <RTORegions viewMode={viewMode} />
            <FacilityMarkers
              viewMode={viewMode}
              filterCompanies={filterCompanies}
              filterRTOs={filterRTOs}
              filterCapacity={filterCapacity}
              rtoFocus={rtoFocus}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              selected={selected}
              setSelected={setSelected}
              setTooltipDC={setTooltipDC}
              setTooltipPos={setTooltipPos}
              dataCenters={dataCenters}
            />
            <FacilityLabels
              viewMode={viewMode}
              filterCompanies={filterCompanies}
              filterRTOs={filterRTOs}
              filterCapacity={filterCapacity}
              rtoFocus={rtoFocus}
              dataCenters={dataCenters}
            />
            <MapClickHandler onMapClick={() => { setSelected(null); setTooltipDC(null); setTooltipPos(null); }} />
            <ZoomControl position="bottomright" />
          </MapContainer>

          {dcError && (
            <div className="absolute inset-0 z-[1010] flex items-center justify-center pointer-events-none">
              <div className="pointer-events-auto rounded-sm border border-rule bg-surface-overlay/95 px-8 shadow-lg">
                <ErrorState label="Facility data failed to load - the map has no sites to show." onRetry={() => refetchDataCenters()} />
              </div>
            </div>
          )}

          {showTooltip && (
            <div
              className="absolute z-[1001] pointer-events-none power-map-tooltip"
              style={{
                left: Math.min(Math.max((tooltipPos?.x ?? 0) + 16, 8), (mapContainerRef.current?.clientWidth ?? 600) - 296),
                top: Math.max((tooltipPos?.y ?? 0) - 180, 8),
              }}
            >
              <div
                className="min-w-[260px] max-w-[280px] overflow-hidden rounded-sm border border-rule bg-surface-overlay shadow-lg"
                data-testid="pin-detail-tooltip"
              >
                <div className="border-b border-rule px-4 pt-3 pb-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[13.5px] font-semibold leading-tight text-ink">{displayDC.name}</p>
                    <span className={`whitespace-nowrap text-[12px] ${STATUS_TEXT[displayDC.status].className}`}>
                      {STATUS_TEXT[displayDC.status].label}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5 px-4 py-3 text-[12.5px]">
                  <div className="flex items-baseline justify-between">
                    <span className="text-ink-muted">Operator</span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: companyColors[displayDC.company] ?? INK.faint }} />
                      <span className="text-ink">{displayDC.company}</span>
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-ink-muted">Location</span>
                    <span className="text-ink">{displayDC.city}, {displayDC.state}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-ink-muted">Capacity</span>
                    <span className="font-semibold text-ink tnum">{displayDC.powerMW} MW</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-ink-muted">Grid region</span>
                    <span className="text-ink">{gridOpToRTO(displayDC.gridOperator)}</span>
                  </div>
                  {selected && (
                    <>
                      <div className="flex items-baseline justify-between">
                        <span className="text-ink-muted">Annual power</span>
                        <span className="text-ink tnum">{(displayDC.annualMWh / 1_000_000).toFixed(2)} TWh</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-ink-muted">Online</span>
                        <span className="text-ink tnum">{displayDC.openDate}</span>
                      </div>
                    </>
                  )}
                  <div className="mt-1 border-t border-rule pt-2">
                    <a
                      href="/stack"
                      className="pointer-events-auto text-[12.5px] font-semibold text-brand-ink transition-colors hover:text-ink"
                      data-testid="link-view-in-stack"
                    >
                      View in The Stack &rarr;
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>

          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-rule bg-surface-raised px-4 py-2.5">
            <span className="max-w-[76ch] text-[12.5px] leading-snug text-ink-secondary" data-testid="threshold-banner">
              Hyperscale AI campuses of 400 MW and up; thousands of smaller sites are out of scope.
              Marker size tracks capacity. For the compute layer see{" "}
              <Link href="/compute-frontier" className="text-brand-ink underline decoration-rule-strong underline-offset-2 hover:text-ink">
                Compute Frontier
              </Link>.
            </span>
            <span className="text-[12.5px] text-ink-muted tnum">
              {dcLoading ? "loading" : dcError ? "load failed" : `${dataCenters.length} facilities`}
            </span>
          </figcaption>
        </figure>
        <Provenance
          source="GridTilt facility registry"
          extra={dataUpdatedAt ? <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} /> : undefined}
        />
      </>
      )}

      <RuleSection
        head="Upcoming projects"
        aside={
          <>
            <span>Announced facilities not yet built</span>
            {announced.length > 0 && (
              <button
                onClick={() => setShowAllUpcoming((v) => !v)}
                className="text-[12.5px] font-semibold text-brand-ink transition-colors hover:text-ink"
                data-testid="upcoming-show-all"
              >
                {showAllUpcoming ? "Collapse" : `Show all ${announced.length}`}
              </button>
            )}
          </>
        }
        testId="upcoming-projects-section"
      >
        {dcLoading && (
          <div className="flex gap-3 overflow-hidden" aria-hidden="true">
            {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-[104px] w-56 flex-shrink-0 rounded-sm" />)}
          </div>
        )}
        {dcError && (
          <p className="py-2 text-[13px] text-ink-muted">Unavailable - facility data failed to load. Retry from the map above.</p>
        )}
        <div
          className={
            showAllUpcoming
              ? "flex flex-wrap gap-3"
              : "flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory upcoming-scroll"
          }
        >
          {announced.map((dc) => {
            const rto = gridOpToRTO(dc.gridOperator);
            const rtoColor = RTO_MUTED_COLORS[rto];
            const cColor = companyColors[dc.company] ?? INK.faint;
            return (
              <button
                key={dc.id}
                onClick={() => { setSelected(dc); setTooltipPos(null); }}
                data-testid={`upcoming-card-${dc.id}`}
                className="w-56 flex-shrink-0 snap-start rounded-sm border border-dashed border-rule p-3 text-left transition-colors hover:border-rule-strong hover:bg-paper-shade"
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cColor }} />
                  <span className="text-[12px] font-medium text-ink-secondary">{dc.company}</span>
                </div>
                <p className="mb-1.5 text-[13px] font-semibold leading-tight text-ink">{dc.name}</p>
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="font-semibold text-ink tnum">{dc.powerMW} MW</span>
                  <span className="text-ink-muted tnum">{dc.openDate}</span>
                </div>
                {rtoColor && (
                  <div className="mt-1.5 flex items-center gap-1 text-[12px] text-ink-muted">
                    <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: rtoColor, opacity: 0.85 }} />
                    <span>{rto}</span>
                    <span className="ml-auto">{dc.city}, {dc.state}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </RuleSection>

      <RuleSection
        head="Grid operator load"
        aside={
          rtoFocus ? (
            <button
              onClick={() => setRtoFocus(null)}
              className="flex items-center gap-1 text-[12.5px] font-semibold text-brand-ink transition-colors hover:text-ink"
              data-testid="rto-focus-clear"
            >
              Map: {rtoFocus} only
              <X className="h-2.5 w-2.5" />
            </button>
          ) : (
            <span className="hidden sm:inline">Click a row to filter the map</span>
          )
        }
        testId="grid-stress-table"
      >
        <div className="overflow-x-auto">
          <table className="print-table min-w-[560px]">
            <thead>
              <tr>
                <th>Region</th>
                <th className="num">Tracked AI load</th>
                <th className="num">Reserve margin</th>
                <th>AI load signal</th>
              </tr>
            </thead>
            <tbody>
              {(["ERCOT", "MISO", "PJM", "SERC", "WECC", "SPP", "NPCC"] as const).map((rto) => {
                const cfg = RTO_CONFIG[rto];
                const loadMW = rtoLoadMW[rto] ?? 0;
                const sColor = STRESS_COLOR[cfg.aiSignal];
                const active = rtoFocus === rto;
                return (
                  <tr
                    key={rto}
                    data-testid={`rto-row-${rto.toLowerCase()}`}
                    onClick={() => toggleRtoFocus(rto)}
                    className={`row-link ${active ? "bg-brand/5" : ""}`}
                  >
                    <td className="shrink">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: RTO_MUTED_COLORS[rto], opacity: 0.9 }} />
                        <span className="font-semibold text-ink">{rto}</span>
                        {active && <span className="text-[12px] font-normal text-brand-ink">on map</span>}
                      </span>
                    </td>
                    <td className="num text-ink">
                      {dcLoading ? <Skeleton className="ml-auto inline-block h-3 w-16" aria-hidden="true" /> : dcError ? "—" : `${loadMW.toLocaleString()} MW`}
                    </td>
                    <td className="num">
                      <span className="inline-flex items-center gap-2">
                        <span className="font-semibold tnum" style={{ color: sColor }}>{cfg.reserveMargin}%</span>
                        <span className="inline-block h-1.5 w-16 flex-shrink-0 overflow-hidden rounded-full bg-paper-deep">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (cfg.reserveMargin / 30) * 100)}%`,
                              backgroundColor: sColor,
                            }}
                          />
                        </span>
                      </span>
                    </td>
                    <td className="font-medium" style={{ color: sColor }}>{cfg.aiSignal}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Provenance
          source="NERC Long-Term Reliability Assessment 2025"
          extra="reserve margins are 2026 projections; tracked AI load sums the GridTilt facility registry per region"
        />
      </RuleSection>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/25" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-md border-t border-rule bg-surface-overlay p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold text-ink">Filters</span>
                {anyFilterActive && (
                  <span className="text-[12px] text-brand-ink tnum">{filteredCount} of {dataCenters.length}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {anyFilterActive && (
                  <button
                    onClick={clearAllFilters}
                    className="rounded-sm border border-rule px-2 py-1 text-[12px] text-ink-secondary hover:text-ink"
                  >
                    Clear all
                  </button>
                )}
                <button onClick={() => setMobileFiltersOpen(false)} className="rounded-sm p-1.5 hover:bg-paper-shade" aria-label="Close filters">
                  <X className="h-4 w-4 text-ink-secondary" />
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="mb-2 text-[12px] font-medium text-ink-muted">Operator</p>
                <div className="flex flex-wrap gap-2">
                  {allCompanies.map((c) => {
                    const active = filterCompanies.includes(c);
                    const color = companyColors[c] ?? INK.faint;
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCompany(c)}
                        className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[12.5px] transition-colors ${active ? chipOn : chipOff}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {c} ({companyCounts[c] ?? 0})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[12px] font-medium text-ink-muted">Grid region</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_RTOS.map((rto) => {
                    const active = filterRTOs.includes(rto);
                    const color = RTO_MUTED_COLORS[rto] ?? INK.faint;
                    return (
                      <button
                        key={rto}
                        onClick={() => toggleRTO(rto)}
                        className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-[12.5px] transition-colors ${active ? chipOn : chipOff}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.85 }} />
                        {rto} ({rtoCounts[rto] ?? 0})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[12px] font-medium text-ink-muted">Capacity</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all",    label: "All sizes" },
                    { key: "small",  label: "400-600 MW" },
                    { key: "medium", label: "600-1000 MW" },
                    { key: "large",  label: "1 GW+" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCapacity(key)}
                      className={`rounded-sm border px-3 py-1.5 text-[12.5px] transition-colors ${filterCapacity === key ? chipOn : chipOff}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-5 w-full rounded-sm bg-brand py-2.5 text-[13.5px] font-semibold text-ink"
            >
              Apply filters
            </button>
          </div>
        </div>
      )}
      </>)}
    </PageShell>
  );
}
