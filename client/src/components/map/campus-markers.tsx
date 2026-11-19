/**
 * The two registry layers that carry megawatts: tracked campuses (the glow
 * markers) and AI clusters (rings). Both are DOM markers, drawn above the
 * canvas layers, one per record at every zoom. Each takes the rows already
 * filtered by the page, so a filter change is a list change here and nothing
 * else. Hover and selection restyle a marker in place; a mouseover never
 * rebuilds the layer.
 */
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { clusterLabelMinMW, clusterPinRadius, type ClusterPoint, type ClusterStatus } from "@/lib/power-map-clusters";
import { MIN_TRACKED_MW } from "@/lib/real-gauges";
import { INK, STATUS_COLORS } from "@/lib/tokens";

export interface DataCenter {
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
  /** Set when a reviewed cluster record is this facility (server join). */
  clusterId?: string;
}

// Escape user-controlled strings before interpolating into raw Leaflet
// divIcon HTML. Datacenter names arrive via the admin form / ingester
// pipeline, so an unescaped name is a stored-XSS vector (SEC-5).
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Continuous sqrt scale: marker AREA ~ campus MW. 400 MW maps to a 6px
 * radius, 1.5 GW lands near 11.6px, and a campus under 400 MW sits at the
 * 5px floor.
 */
export function pinRadius(powerMW: number): number {
  return Math.min(13, Math.max(5, 6 * Math.sqrt(powerMW / MIN_TRACKED_MW)));
}

function statusZ(status: string): number {
  return status === "operational" ? 100 : status === "construction" ? 50 : 0;
}

function campusIcon(dc: DataCenter, dim: boolean): L.DivIcon {
  const r = pinRadius(dc.powerMW);
  const color = STATUS_COLORS[dc.status];
  const size = Math.ceil((r + 12) * 2);
  const center = size / 2;
  const baseOpacity = dc.status === "announced" ? 0.75 : 1;
  const animClass = dc.status === "operational" && !dim ? "pin-pulse" : "";
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${center}" cy="${center}" r="${r + 8}" fill="${color}" opacity="0.3" class="${animClass}-glow" />
    <circle cx="${center}" cy="${center}" r="${r}" fill="${color}" opacity="${baseOpacity}" />
  </svg>`;
  return L.divIcon({
    html: `<div class="pin-wrapper ${animClass}">${svg}</div>`,
    className: `leaflet-pin-icon${dim ? " pin-dim" : ""}`,
    iconSize: [size, size],
    iconAnchor: [center, center],
  });
}

/**
 * A cluster is a ring, not a filled dot: the same status colors and the same
 * size scale as a campus, but hollow, so the two registries never read as
 * the same kind of mark when they draw together.
 */
function clusterIcon(c: ClusterPoint, dim: boolean): L.DivIcon {
  const r = clusterPinRadius(c.plannedPowerMW);
  const color = STATUS_COLORS[c.status] ?? INK.muted;
  const size = Math.ceil((r + 6) * 2);
  const center = size / 2;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${center}" cy="${center}" r="${r}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="1.5" stroke-opacity="${c.status === "announced" ? 0.7 : 0.95}" />
  </svg>`;
  return L.divIcon({
    html: `<div class="pin-wrapper">${svg}</div>`,
    className: `leaflet-pin-icon${dim ? " pin-dim" : ""}`,
    iconSize: [size, size],
    iconAnchor: [center, center],
  });
}

interface MarkerLayerProps<T, K extends string | number> {
  items: T[];
  /** Ids drawn faint: outside the selected region. */
  dimmed: Set<K> | null;
  hoveredId: K | null;
  setHoveredId: (id: K | null) => void;
  selected: T | null;
  setSelected: (item: T | null) => void;
  setTooltip: (item: T | null) => void;
  setTooltipPos: (pos: { x: number; y: number } | null) => void;
}

/** One marker per record, with in-place hover and selection. Shared by both layers. */
function useMarkerLayer<T extends { id: K; status: string }, K extends string | number>(
  { items, dimmed, hoveredId, setHoveredId, selected, setSelected, setTooltip, setTooltipPos }: MarkerLayerProps<T, K>,
  place: (item: T) => [number, number],
  icon: (item: T, dim: boolean) => L.DivIcon,
  /** Campuses sit above clusters, so a campus is never hidden under its own cluster ring. */
  zBase: number,
) {
  const map = useMap();
  const markersRef = useRef(new Map<K, L.Marker>());
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const markers = new Map<K, L.Marker>();
    for (const item of items) {
      const marker = L.marker(place(item), {
        icon: icon(item, dimmed ? dimmed.has(item.id) : false),
        zIndexOffset: zBase + statusZ(item.status),
      });
      marker.on("mouseover", (e) => {
        setHoveredId(item.id);
        setTooltip(item);
        const point = map.latLngToContainerPoint(e.latlng);
        setTooltipPos({ x: point.x, y: point.y });
      });
      marker.on("mouseout", () => {
        setHoveredId(null);
        setTooltip(null);
        setTooltipPos(null);
      });
      marker.on("click", (e) => {
        setSelected(item);
        setHoveredId(null);
        setTooltip(null);
        const point = map.latLngToContainerPoint(e.latlng);
        setTooltipPos({ x: point.x, y: point.y });
      });
      markers.set(item.id, marker);
      marker.addTo(group);
    }
    markersRef.current = markers;
    return () => {
      map.removeLayer(group);
      markersRef.current = new Map();
    };
    // hoveredId and selected are deliberately not deps: they restyle below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, items, dimmed]);

  const prevHovered = useRef<K | null>(null);
  useEffect(() => {
    const prev = prevHovered.current;
    if (prev !== null && prev !== hoveredId) {
      const m = markersRef.current.get(prev);
      if (m) {
        m.getElement()?.classList.remove("pin-hovered");
        const item = itemsRef.current.find((d) => d.id === prev);
        m.setZIndexOffset(zBase + statusZ(item?.status ?? ""));
      }
    }
    if (hoveredId !== null) {
      const m = markersRef.current.get(hoveredId);
      if (m) {
        m.getElement()?.classList.add("pin-hovered");
        m.setZIndexOffset(2000);
      }
    }
    prevHovered.current = hoveredId;
  }, [hoveredId, zBase]);

  const prevSelected = useRef<K | null>(null);
  useEffect(() => {
    const prev = prevSelected.current;
    if (prev !== null && prev !== selected?.id) markersRef.current.get(prev)?.getElement()?.classList.remove("pin-selected");
    if (selected) markersRef.current.get(selected.id)?.getElement()?.classList.add("pin-selected");
    prevSelected.current = selected?.id ?? null;
  }, [selected, items]);
}

export function CampusMarkers(props: MarkerLayerProps<DataCenter, number>) {
  useMarkerLayer(props, (d) => [d.lat, d.lng], campusIcon, 500);
  return null;
}

export function ClusterMarkers(props: MarkerLayerProps<ClusterPoint, string>) {
  useMarkerLayer(props as MarkerLayerProps<ClusterPoint & { status: ClusterStatus }, string>, (c) => [c.location.lat, c.location.lng], clusterIcon, 0);
  return null;
}

/** Name labels that appear as you zoom in: the big sites from zoom 6, every site from zoom 8. */
function useLabels<T>(items: T[], place: (item: T) => [number, number], name: (item: T) => string, minMW: (zoom: number) => number | null, mw: (item: T) => number) {
  const map = useMap();
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const draw = () => {
      group.clearLayers();
      const floor = minMW(map.getZoom());
      if (floor === null) return;
      for (const item of items) {
        if (mw(item) < floor) continue;
        const full = name(item);
        const label = full.length > 20 ? `${full.slice(0, 18)}..` : full;
        L.marker(place(item), {
          icon: L.divIcon({ html: `<div class="map-label">${escapeHtml(label)}</div>`, className: "leaflet-label-icon", iconSize: [120, 16], iconAnchor: [-8, 20] }),
          interactive: false,
          keyboard: false,
          zIndexOffset: -10,
        }).addTo(group);
      }
    };
    draw();
    map.on("zoomend", draw);
    return () => {
      map.off("zoomend", draw);
      map.removeLayer(group);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, items]);
}

export function CampusLabels({ items }: { items: DataCenter[] }) {
  useLabels(
    items,
    (d) => [d.lat, d.lng],
    (d) => d.name,
    (zoom) => (zoom < 6 ? null : zoom >= 8 ? 0 : 500),
    (d) => d.powerMW,
  );
  return null;
}

export function ClusterLabels({ items }: { items: ClusterPoint[] }) {
  useLabels(
    items,
    (c) => [c.location.lat, c.location.lng],
    (c) => c.name,
    clusterLabelMinMW,
    (c) => c.plannedPowerMW,
  );
  return null;
}
