import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import { BiggestDataCenters } from "@/components/BiggestDataCenters";
import { StateBuildout } from "@/components/StateBuildout";
import { CompanyBuildout } from "@/components/CompanyBuildout";
import { BuildoutTimeline } from "@/components/BuildoutTimeline";
import { PowerSourceMix } from "@/components/PowerSourceMix";
import { MIN_TRACKED_MW, filterTrackedFacilities } from "@/lib/real-gauges";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  X, Zap, Calendar, Network, SlidersHorizontal, ChevronDown, Info, MonitorSmartphone,
} from "lucide-react";
import {
  BRAND, BORDER, FONT, INK, SEMANTIC, SERIES, STATUS_COLORS, SURFACE,
} from "@/lib/tokens";
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

const DATA_CENTERS_FALLBACK: DataCenter[] = [];

// Honor the threshold advertised in the banner: only track hyperscale-class
// sites. Smaller historical facilities are filtered out everywhere. The
// threshold and the filter come from real-gauges rather than being restated
// here, so this page and the headline gauges cannot drift apart.
const filterTracked = filterTrackedFacilities<DataCenter>;

import { RTO_CONFIG, type RTOConfig } from "@/data/rto-config";

/**
 * ONE stress ramp for the whole page: region fills (stress view), the map
 * legend, marker colors in stress view, and the table badges all read from
 * this SEMANTIC mapping. Nothing else may color a stress level.
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

function getStatusBadge(status: DataCenter["status"]) {
  const map = {
    operational:  { label: "Operational",        class: "bg-brand/15 text-brand" },
    construction: { label: "Under Construction",  class: "bg-brand-2/15 text-brand-2" },
    announced:    { label: "Announced",           class: "bg-ink-muted/15 text-ink-muted" },
  };
  return map[status];
}

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

// Power tool tabs (consolidation): one subject, three views — where the AI
// load sits (map), who contracted the power (deals), what's still waiting
// on the grid (queue). ?tab= round-trips so each view stays shareable.
const POWER_TABS = [
  { id: "map", label: "Map" },
  { id: "deals", label: "Deals" },
  { id: "queue", label: "Queue" },
];

const POWER_SUBTITLES: Record<string, string> = {
  map: "US Datacenter Map",
  deals: "AI Power Deals",
  queue: "Interconnection Backlog",
};

/**
 * True below Tailwind's `sm` breakpoint (640px).
 *
 * The map used to be gated off entirely down here, on the assumption it would
 * be a broken squeeze. It is not: at 390px the container still gets its 520px
 * minimum, Leaflet handles touch pan and pinch natively, and the bubbles stay
 * readable. What actually collided was the wide stats overlay running under the
 * view toggle, so that overlay is hidden below sm and its numbers are carried by
 * the summary card above the map instead.
 *
 * The flag now decides whether to show that summary card, not whether the map
 * mounts. The map mounts everywhere.
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

/** Facility status is state -> STATUS_COLORS. Same mapping as legend + badges. */
function pinColor(status: DataCenter["status"]): string {
  return STATUS_COLORS[status];
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

function createGlowIcon(dc: DataCenter, viewMode: ViewMode): L.DivIcon {
  const r = pinRadius(dc.powerMW);
  const color = viewMode === "stress" ? stressColorForRTO(dc) : pinColor(dc.status);
  const size = Math.ceil((r + 12) * 2);
  const center = size / 2;

  const baseOpacity = dc.status === "announced" && viewMode === "dc" ? 0.75 : 1;
  const glowOpacity = viewMode === "stress" ? 0.45 : 0.3;
  const animClass = viewMode === "dc" && dc.status === "operational" ? "pin-pulse" : "";

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${center}" cy="${center}" r="${r + 8}" fill="${color}" opacity="${glowOpacity}" class="${animClass}-glow" />
    <circle cx="${center}" cy="${center}" r="${r}" fill="${color}" opacity="${baseOpacity}" />
  </svg>`;

  return L.divIcon({
    html: `<div class="pin-wrapper ${animClass}">${svg}</div>`,
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
  const groupRef = useRef<L.LayerGroup | null>(null);

  const passesFilter = useCallback((dc: DataCenter): boolean => {
    return dcPassesFilters(dc, filterCompanies, filterRTOs, filterCapacity, rtoFocus);
  }, [filterCompanies, filterRTOs, filterCapacity, rtoFocus]);

  // Build the marker layer: every facility is its own marker at every zoom
  // (no clustering - same approach as the Compute Frontier map). NOTE:
  // hoveredId/selected are deliberately NOT deps here - hover/selection
  // restyle imperatively below, so mouseover no longer tears down and
  // rebuilds every layer (audit perf fix).
  useEffect(() => {
    if (!groupRef.current) {
      groupRef.current = L.layerGroup().addTo(map);
    }

    const group = groupRef.current;
    group.clearLayers();

    const markers: Record<number, L.Marker> = {};

    dataCenters.forEach((dc) => {
      if (!passesFilter(dc)) return;

      const marker = L.marker([dc.lat, dc.lng], {
        icon: createGlowIcon(dc, viewMode),
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
      marker.addTo(group);
    });

    markersRef.current = markers;

    return () => {
      group.clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, passesFilter, viewMode, dataCenters]);

  // Remove the marker layer on unmount.
  useEffect(() => {
    return () => {
      if (groupRef.current) {
        map.removeLayer(groupRef.current);
        groupRef.current = null;
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

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <style>{`
        .leaflet-pin-icon {
          background: none !important;
          border: none !important;
        }
        .leaflet-container {
          background: ${SURFACE.base} !important;
          font-family: inherit;
        }
        .leaflet-control-zoom-in {
          border-radius: 6px 6px 0 0 !important;
          border-bottom: none !important;
        }
        .leaflet-control-zoom-out {
          border-radius: 0 0 6px 6px !important;
        }
        .leaflet-control-attribution a {
          color: ${INK.faint} !important;
        }
        .pin-wrapper {
          transition: opacity 0.2s ease-out, transform 0.2s ease-out, filter 0.2s ease-out;
        }
        .pin-wrapper:hover,
        .leaflet-pin-icon.pin-hovered .pin-wrapper {
          transform: scale(1.3);
          filter: brightness(1.3);
        }
        .leaflet-pin-icon.pin-selected .pin-wrapper svg circle:last-of-type {
          stroke: ${INK.primary};
          stroke-width: 2;
        }
        @media (prefers-reduced-motion: no-preference) {
          @keyframes pin-pulse-glow {
            0%, 100% { transform: scale(1); opacity: 0.3; }
            50% { transform: scale(1.15); opacity: 0.15; }
          }
          .pin-pulse svg circle:first-child {
            animation: pin-pulse-glow 3s ease-in-out infinite;
            transform-origin: center;
          }
        }
        .rto-table-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.18) transparent;
        }
        .rto-table-scroll::-webkit-scrollbar {
          height: 6px;
        }
        .rto-table-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.18);
          border-radius: 3px;
        }
        .rto-table-scroll::-webkit-scrollbar-track {
          background: transparent;
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
          font-size: 10px;
          color: ${INK.primary};
          background: rgba(0,0,0,0.7);
          padding: 2px 5px;
          border-radius: 3px;
          white-space: nowrap;
          pointer-events: none;
          line-height: 1.3;
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
          margin-bottom: 16px !important;
          margin-right: 16px !important;
        }
        .leaflet-control-zoom a {
          background: ${SURFACE.raised} !important;
          color: ${INK.secondary} !important;
          border: 1px solid ${BORDER.subtle} !important;
          width: 28px !important;
          height: 28px !important;
          line-height: 28px !important;
          font-size: 14px !important;
        }
        .leaflet-control-zoom a:hover {
          background: ${SURFACE.overlay} !important;
          color: ${BRAND.primary} !important;
        }
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.4) !important;
          color: ${INK.faint} !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: ${INK.faint} !important;
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

      {/* Power tool header: title + view tabs. Sits above the map's own
          control cluster (DC Locations / Grid Stress) so tabs stay put when
          the map view is swapped out for Deals or Queue. */}
      <div
        className="border-b border-border px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3"
        data-testid="power-header"
      >
        <h1 className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
          Power <span className="text-muted-foreground/50 font-normal">/ {POWER_SUBTITLES[tab]}</span>
        </h1>
        <ToolTabs tabs={POWER_TABS} active={tab} onChange={setTab} />
      </div>

      {tab === "deals" && (
        <div className="flex-1 p-4 sm:p-6">
          <PowerDeals embedded />
        </div>
      )}
      {tab === "queue" && (
        <div className="flex-1 p-4 sm:p-6">
          <Queue embedded />
        </div>
      )}

      {tab === "map" && (<>
      {belowSm && (
        /* The Leaflet map is desktop-only. On phones this honest card takes
           its place; the headline numbers, upcoming projects, and operator
           table below stay fully usable. */
        <div className="border-b border-border px-4 py-5" data-testid="map-mobile-card">
          <div className="rounded-lg border border-subtle bg-surface-raised p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Zap className="h-4 w-4 text-brand" />
              <span className="text-sm font-semibold text-foreground">Power Map</span>
              <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} className="ml-auto" />
            </div>
            <div className="flex items-start gap-2 mb-3">
              <MonitorSmartphone className="h-3.5 w-3.5 text-muted-foreground/60 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pinch to zoom the map, or tap a site for its detail.
              </p>
            </div>
            {dcError ? (
              <ErrorState label="Facility data failed to load." onRetry={() => refetchDataCenters()} className="py-4" />
            ) : dcLoading ? (
              <Skeleton className="h-5 w-56" aria-hidden="true" />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-11 font-mono">
                {/* Numeric stats stay one non-breaking group with their "|"
                    separators; the dot legend is its own flex item with no
                    leading pipe, so wrapping never strands a trailing "|". */}
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <span className="text-muted-foreground">{dataCenters.length} facilities</span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="text-brand-2 font-bold" title={`operational + construction; announced (+${(announcedMW / 1000).toFixed(1)} GW) excluded`}>{(totalMW / 1000).toFixed(1)} GW</span>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="text-muted-foreground">{totalTWh} TWh/yr</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.operational }} /><span className="text-muted-foreground">{opCount}</span></span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.construction }} /><span className="text-muted-foreground">{conCount}</span></span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.announced }} /><span className="text-muted-foreground">{annCount}</span></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div
          className="flex-1 relative"
          style={{ minHeight: 520 }}
          ref={mapContainerRef}
        >
          <div className="absolute top-3 left-3 z-[1000] hidden sm:block pointer-events-auto" data-testid="stats-overlay">
            <div className="bg-surface-raised/90 backdrop-blur-md border border-subtle rounded-lg px-4 py-3 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-brand" />
                <span className="text-xs font-semibold text-white/90 tracking-tight">Power Map</span>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="text-white/40 hover:text-brand transition-colors"
                      aria-label="What this map tracks"
                      data-testid="threshold-banner"
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start" className="max-w-xs z-[1200] p-3">
                    <p className="text-[11px] font-semibold text-brand mb-1.5">&ge; 400 MW only</p>
                    <p className="text-11 leading-snug text-white/70">
                      We track hyperscale AI campuses. Smaller sites exist by the thousands. Sources like <span className="text-white/90 font-medium">DC Map</span> and <span className="text-white/90 font-medium">Data Center Knowledge</span> cover them better. For the compute layer (GPUs, chips, secured power) see <Link href="/compute-frontier" className="text-brand hover:text-brand-2">Compute Frontier</Link>.
                    </p>
                  </TooltipContent>
                </UITooltip>
                <span className="text-10 font-mono text-white/40">
                  {dcLoading ? "loading…" : dcError ? "load failed" : `${dataCenters.length} facilities`}
                </span>
                <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
              </div>
              <div className="flex items-center gap-3 text-11 font-mono">
                <span className="text-brand-2 font-bold" title={`operational + construction; announced (+${(announcedMW / 1000).toFixed(1)} GW) excluded`}>{(totalMW / 1000).toFixed(1)} GW</span>
                <span className="text-white/20">|</span>
                <span className="text-white/50">{totalTWh} TWh/yr</span>
                <span className="text-white/20">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.operational }} /><span className="text-white/60">{opCount}</span></span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.construction }} /><span className="text-white/60">{conCount}</span></span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: STATUS_COLORS.announced }} /><span className="text-white/60">{annCount}</span></span>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2 pointer-events-auto">
            <div className="flex rounded-md overflow-hidden border border-subtle text-xs shadow-lg">
              <button
                className={`px-3 py-1.5 transition-all duration-500 ${viewMode === "dc" ? "bg-brand text-black font-semibold" : "bg-surface-raised/90 text-white/60 hover:text-white/90 backdrop-blur-md"}`}
                onClick={() => setViewMode("dc")}
                data-testid="toggle-dc-locations"
              >
                DC Locations
              </button>
              <button
                className={`px-3 py-1.5 transition-all duration-500 ${viewMode === "stress" ? "bg-brand text-black font-semibold" : "bg-surface-raised/90 text-white/60 hover:text-white/90 backdrop-blur-md"}`}
                onClick={() => setViewMode("stress")}
                data-testid="toggle-grid-stress"
              >
                Grid Stress
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
              className="flex items-center gap-2 bg-surface-raised/90 backdrop-blur-md border border-subtle rounded-md px-3 py-1.5 text-xs text-white/60 hover:text-white/90 transition-colors shadow-lg"
              data-testid="filter-bar-toggle"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>Filters</span>
              {anyFilterActive && (
                <span className="bg-brand text-black text-10 font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {activeFilterCount}
                </span>
              )}
              <span className="text-10 text-white/40 ml-1">{anyFilterActive || rtoFocus ? `${filteredCount}/${dataCenters.length}` : `${dataCenters.length}`}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
            </button>

            {rtoFocus && (
              <button
                onClick={() => setRtoFocus(null)}
                className="flex items-center gap-1.5 bg-surface-raised/90 backdrop-blur-md border rounded-md px-2.5 py-1 text-10 shadow-lg"
                style={{ borderColor: alpha(BRAND.primary, 0.4), color: BRAND.primary }}
                data-testid="map-rto-focus-chip"
              >
                <span>{rtoFocus} facilities only</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {filtersExpanded && (
            <div className="absolute top-[88px] right-3 z-[1000] pointer-events-auto" data-testid="filter-panel">
              <div className="bg-surface-raised/95 backdrop-blur-md border border-subtle rounded-lg p-4 shadow-2xl w-[320px] max-h-[60vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white/80">Filter Facilities</span>
                  {anyFilterActive && (
                    <button onClick={clearAllFilters} className="text-10 text-white/40 hover:text-white/70 underline underline-offset-2" data-testid="filter-clear-all">
                      Clear all
                    </button>
                  )}
                </div>

                {anyFilterActive && (
                  <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-subtle">
                    {filterCompanies.map((c) => (
                      <Badge key={c} className="bg-brand/15 text-brand border-brand/30 text-10 gap-1 cursor-pointer hover:bg-brand/25" onClick={() => removeCompanyFilter(c)}>
                        <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: companyColors[c] ?? INK.faint }} />
                        {c}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    ))}
                    {filterRTOs.map((rto) => (
                      <Badge key={rto} className="bg-brand/15 text-brand border-brand/30 text-10 gap-1 cursor-pointer hover:bg-brand/25" onClick={() => removeRTOFilter(rto)}>
                        {rto}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    ))}
                    {filterCapacity !== "all" && (
                      <Badge className="bg-brand/15 text-brand border-brand/30 text-10 gap-1 cursor-pointer hover:bg-brand/25" onClick={removeCapacityFilter}>
                        {capacityLabels[filterCapacity]}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] text-white/40 mb-2">Operator</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allCompanies.map((c) => {
                        const active = filterCompanies.includes(c);
                        const color = companyColors[c] ?? INK.faint;
                        return (
                          <button
                            key={c}
                            data-testid={`filter-company-${c.toLowerCase().replace(/\s+/g, "-")}`}
                            onClick={() => toggleCompany(c)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-10 font-medium transition-all ${
                              active
                                ? "bg-brand/20 text-brand border border-brand/40"
                                : "bg-white/[0.04] text-white/50 border border-subtle hover:text-white/80 hover:bg-white/[0.08]"
                            }`}
                          >
                            <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            {c}
                            <span className="text-9 opacity-50">({companyCounts[c] ?? 0})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-white/40 mb-2">Grid Region</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_RTOS.map((rto) => {
                        const active = filterRTOs.includes(rto);
                        const color = RTO_MUTED_COLORS[rto] ?? INK.faint;
                        return (
                          <button
                            key={rto}
                            data-testid={`filter-rto-${rto.toLowerCase()}`}
                            onClick={() => toggleRTO(rto)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-10 font-medium transition-all ${
                              active
                                ? "bg-brand/20 text-brand border border-brand/40"
                                : "bg-white/[0.04] text-white/50 border border-subtle hover:text-white/80 hover:bg-white/[0.08]"
                            }`}
                          >
                            <div className="h-1.5 w-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color, opacity: 0.85 }} />
                            {rto}
                            <span className="text-9 opacity-50">({rtoCounts[rto] ?? 0})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] text-white/40 mb-2">Capacity</p>
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
                          className={`px-2 py-1 rounded text-10 font-medium transition-all ${
                            filterCapacity === key
                              ? "bg-brand/20 text-brand border border-brand/40"
                              : "bg-white/[0.04] text-white/50 border border-subtle hover:text-white/80 hover:bg-white/[0.08]"
                          }`}
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
            <div className="bg-surface-raised/90 backdrop-blur-md border border-subtle rounded-lg px-3 py-2.5 shadow-lg">
              {viewMode === "dc" ? (
                <div className="flex items-start gap-4">
                  <div>
                    <p className="text-10 text-white/40 mb-1.5">Size = capacity</p>
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
                            <span className="text-9 font-mono text-white/50 whitespace-nowrap">{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-10 text-white/40 mb-1.5">Color = status</p>
                    <div className="space-y-1 text-10 text-white/60">
                      <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.operational }} />Operational</div>
                      <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.construction }} />Construction</div>
                      <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.announced }} />Announced</div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-10 text-white/40 mb-1.5">Grid stress</p>
                  <div className="space-y-1 text-10 text-white/60">
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
            style={{ width: "100%", height: "100%", minHeight: 520, background: SURFACE.base }}
            className="rounded-none"
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
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
              <div className="pointer-events-auto bg-surface-raised/95 backdrop-blur-md border border-subtle rounded-lg shadow-2xl px-8">
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
                className="border rounded-lg shadow-2xl text-xs min-w-[260px] max-w-[280px] overflow-hidden"
                style={{
                  background: SURFACE.raised,
                  borderColor: alpha(BRAND.primary, 0.3),
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(8px)",
                }}
                data-testid="pin-detail-tooltip"
              >
                <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: BORDER.subtle }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-white text-sm leading-tight">{displayDC.name}</p>
                    <span
                      className="text-10 px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                      style={{
                        backgroundColor: alpha(STATUS_COLORS[displayDC.status], 0.15),
                        color: STATUS_COLORS[displayDC.status],
                      }}
                    >
                      {getStatusBadge(displayDC.status).label}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-xs">Operator</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: companyColors[displayDC.company] ?? INK.faint }} />
                      <span className="text-white text-xs">{displayDC.company}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-xs">Location</span>
                    <span className="text-white text-xs">{displayDC.city}, {displayDC.state}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-xs">Capacity</span>
                    <span className="text-brand-2 font-mono font-bold text-13 tabular-nums">{displayDC.powerMW} MW</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-xs">Grid Region</span>
                    <span className="text-white text-xs">{gridOpToRTO(displayDC.gridOperator)}</span>
                  </div>
                  {selected && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-white/40 text-xs">Annual Power</span>
                        <span className="text-white text-xs font-mono tabular-nums">{(displayDC.annualMWh / 1_000_000).toFixed(2)} TWh</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/40 text-xs">Online</span>
                        <span className="text-white text-xs">{displayDC.openDate}</span>
                      </div>
                    </>
                  )}
                  <div className="pt-1.5 mt-1" style={{ borderTop: `1px solid ${BORDER.subtle}` }}>
                    <a
                      href="/stack"
                      className="text-11 text-brand hover:text-brand-2 transition-colors pointer-events-auto"
                      data-testid="link-view-in-stack"
                    >
                      View in Equities &rarr;
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* All five read payloads the page already fetches. */}
      <BiggestDataCenters />
      <StateBuildout />
      <CompanyBuildout />
      <BuildoutTimeline />
      <PowerSourceMix />

      <div className="border-t border-border px-4 sm:px-6 py-4" data-testid="upcoming-projects-section">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold text-foreground">Upcoming Projects</h2>
          <span className="text-10 text-muted-foreground/50">Announced facilities not yet built</span>
          {announced.length > 0 && (
            <button
              onClick={() => setShowAllUpcoming((v) => !v)}
              className="ml-auto text-10 text-brand hover:text-brand-2 transition-colors"
              data-testid="upcoming-show-all"
            >
              {showAllUpcoming ? "Collapse" : `Show all ${announced.length}`}
            </button>
          )}
        </div>
        {dcLoading && (
          <div className="flex gap-3 overflow-hidden" aria-hidden="true">
            {Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-[104px] w-52 flex-shrink-0 rounded-md" />)}
          </div>
        )}
        {dcError && (
          <p className="text-xs text-muted-foreground py-2">Unavailable - facility data failed to load. Retry from the card above.</p>
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
                className="flex-shrink-0 snap-start w-52 rounded-md border border-dashed border-border/70 bg-muted/10 p-3 text-left hover:bg-muted/20 hover:border-border transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cColor }} />
                  <span className="text-10 font-semibold" style={{ color: cColor }}>{dc.company}</span>
                </div>
                <p className="text-xs font-semibold text-foreground leading-tight mb-2">{dc.name}</p>
                <div className="flex items-center justify-between text-10 font-mono text-muted-foreground">
                  <span className="text-brand-2 font-semibold">{dc.powerMW} MW</span>
                  <span>{dc.openDate}</span>
                </div>
                {rtoColor && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: rtoColor, opacity: 0.8 }} />
                    <span className="text-9 text-muted-foreground/70">{rto}</span>
                    <span className="text-9 text-muted-foreground/50 ml-auto">{dc.city}, {dc.state}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border px-4 sm:px-6 py-4" data-testid="grid-stress-table">
        <div className="flex items-center gap-2 mb-3">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold text-foreground">Grid Operator Load Analysis</h2>
          <span className="text-10 text-muted-foreground/50">Reserve margins: NERC LTRA 2025 (2026 projections)</span>
          {rtoFocus ? (
            <button
              onClick={() => setRtoFocus(null)}
              className="ml-auto flex items-center gap-1 text-10 px-2 py-0.5 rounded border transition-colors"
              style={{
                borderColor: alpha(BRAND.primary, 0.4),
                color: BRAND.primary,
                backgroundColor: alpha(BRAND.primary, 0.1),
              }}
              data-testid="rto-focus-clear"
            >
              Map: {rtoFocus} only
              <X className="h-2.5 w-2.5" />
            </button>
          ) : (
            <span className="ml-auto text-10 text-muted-foreground/50 hidden sm:inline">Click a row to filter the map</span>
          )}
        </div>
        <div className="overflow-x-auto rto-table-scroll">
          <table className="w-full min-w-[520px] text-xs font-mono">
            <thead>
              <tr className="border-b border-border/60 font-sans">
                <th className="text-left text-muted-foreground/60 font-normal pb-2 pr-6">RTO / ISO</th>
                <th className="text-right text-muted-foreground/60 font-normal pb-2 pr-6">Tracked AI Load</th>
                <th className="text-right text-muted-foreground/60 font-normal pb-2 pr-6">Reserve Margin</th>
                <th className="text-left text-muted-foreground/60 font-normal pb-2">AI Load Signal</th>
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
                    className={`border-b border-border/30 cursor-pointer transition-colors ${active ? "bg-brand/10" : "hover:bg-muted/10"}`}
                  >
                    <td className="py-2 pr-6">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: RTO_MUTED_COLORS[rto], opacity: 0.9 }} />
                        <span className="text-foreground font-semibold">{rto}</span>
                        {active && <span className="text-9 font-sans text-brand">on map</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-6 text-right text-foreground">
                      {dcLoading ? <Skeleton className="h-3 w-16 ml-auto inline-block" aria-hidden="true" /> : dcError ? "—" : `${loadMW.toLocaleString()} MW`}
                    </td>
                    <td className="py-2 pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <span style={{ color: sColor }}>{cfg.reserveMargin}%</span>
                        <div className="h-1.5 w-16 rounded-full overflow-hidden flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (cfg.reserveMargin / 30) * 100)}%`,
                              backgroundColor: sColor,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge
                        className="text-10 border-transparent whitespace-nowrap"
                        style={{ backgroundColor: alpha(sColor, 0.15), color: sColor }}
                      >
                        {cfg.aiSignal}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Tap-outside-to-close for a thumb. Escape covers the keyboard, so
              this is decoration to a screen reader rather than a control. */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-surface-raised border-t border-subtle rounded-t-xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-white/60" />
                <span className="font-semibold text-sm text-white">Filters</span>
                {anyFilterActive && (
                  <span className="text-10 font-mono text-brand">{filteredCount} of {dataCenters.length}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {anyFilterActive && (
                  <button onClick={clearAllFilters} className="text-xs text-white/40 border border-strong rounded px-2 py-1">
                    Clear all
                  </button>
                )}
                <button onClick={() => setMobileFiltersOpen(false)} className="p-1.5 rounded hover:bg-white/10">
                  <X className="h-4 w-4 text-white/60" />
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-[11px] text-white/40 mb-2">Operator</p>
                <div className="flex flex-wrap gap-2">
                  {allCompanies.map((c) => {
                    const active = filterCompanies.includes(c);
                    const color = companyColors[c] ?? INK.faint;
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCompany(c)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          active ? "bg-brand/20 text-brand border border-brand/40" : "bg-white/[0.04] text-white/50 border border-subtle"
                        }`}
                      >
                        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {c} ({companyCounts[c] ?? 0})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[11px] text-white/40 mb-2">Grid Region</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_RTOS.map((rto) => {
                    const active = filterRTOs.includes(rto);
                    const color = RTO_MUTED_COLORS[rto] ?? INK.faint;
                    return (
                      <button
                        key={rto}
                        onClick={() => toggleRTO(rto)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          active ? "bg-brand/20 text-brand border border-brand/40" : "bg-white/[0.04] text-white/50 border border-subtle"
                        }`}
                      >
                        <div className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.85 }} />
                        {rto} ({rtoCounts[rto] ?? 0})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[11px] text-white/40 mb-2">Capacity</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all",    label: "All Sizes" },
                    { key: "small",  label: "400-600 MW" },
                    { key: "medium", label: "600-1000 MW" },
                    { key: "large",  label: "1 GW+" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCapacity(key)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterCapacity === key ? "bg-brand/20 text-brand border border-brand/40" : "bg-white/[0.04] text-white/50 border border-subtle"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setMobileFiltersOpen(false)}
              className="w-full mt-5 py-2.5 rounded-md bg-brand text-black text-sm font-semibold"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
