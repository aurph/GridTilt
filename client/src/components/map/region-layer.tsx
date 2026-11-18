/**
 * The nine grid regions on the map: softly filled shapes you can hover and
 * click, with their short names at a national zoom.
 *
 * The shapes are built once and restyled in place (hover, selection, the
 * stress coloring, a tour highlight), so a mouse move never rebuilds a layer.
 * They draw on the shared canvas under the points, which is also what lets a
 * click fall through to the region wherever no point is under the cursor.
 */
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { GRID_REGIONS, gridRegion, type GridRegionId } from "@/data/grid-regions";
import type { NercRisk } from "@/data/nerc-reserve-margins";
import { regionRiskLevel, type RegionShape } from "@/lib/grid-regions";
import { INK, SEMANTIC } from "@/lib/tokens";

/** NERC's risk levels, the one ramp every stress surface reads. */
export const RISK_COLOR: Record<NercRisk | "mixed", string> = {
  High: SEMANTIC.negativeDeep,
  Elevated: SEMANTIC.warning,
  Normal: SEMANTIC.positive,
  mixed: INK.faint,
};

export interface RegionLayerProps {
  shapes: RegionShape[];
  renderer: L.Renderer;
  /** Color by NERC risk instead of by region identity. */
  stress: boolean;
  selected: GridRegionId | null;
  hovered: GridRegionId | null;
  /** Regions a tour step points at; the rest dim. */
  spotlight?: GridRegionId[] | null;
  onHover: (id: GridRegionId | null, at?: { x: number; y: number }) => void;
  onSelect: (id: GridRegionId) => void;
}

function styleFor(
  id: GridRegionId,
  s: { stress: boolean; selected: GridRegionId | null; hovered: GridRegionId | null; spotlight?: GridRegionId[] | null },
): L.PathOptions {
  const fillColor = s.stress ? RISK_COLOR[regionRiskLevel(id)] : gridRegion(id).color;
  const base = s.stress ? 0.26 : 0.11;
  const focus = s.spotlight && s.spotlight.length > 0 ? s.spotlight : s.selected ? [s.selected] : null;
  const isFocus = focus ? focus.includes(id) : false;
  const isHover = s.hovered === id;
  let fillOpacity = base;
  if (focus) fillOpacity = isFocus ? base + 0.12 : base * 0.35;
  if (isHover) fillOpacity = Math.max(fillOpacity, base + 0.14);
  else if (s.hovered && !isFocus) fillOpacity = Math.min(fillOpacity, base * 0.6);
  return {
    fillColor,
    fillOpacity,
    color: isFocus ? "#F07800" : isHover ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.28)",
    weight: isFocus ? 2 : isHover ? 1.6 : 0.9,
    opacity: 1,
  };
}

export function RegionLayer({ shapes, renderer, stress, selected, hovered, spotlight, onHover, onSelect }: RegionLayerProps) {
  const map = useMap();
  const layersRef = useRef<Partial<Record<GridRegionId, L.GeoJSON>>>({});
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const handlers = useRef({ onHover, onSelect });
  handlers.current = { onHover, onSelect };
  const state = useRef({ stress, selected, hovered, spotlight });
  state.current = { stress, selected, hovered, spotlight };

  // Build once per shapes file.
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const byId: Partial<Record<GridRegionId, L.GeoJSON>> = {};
    for (const shape of shapes) {
      const layer = L.geoJSON({ type: "Feature", properties: {}, geometry: shape.geometry } as GeoJSON.Feature, {
        renderer,
        bubblingMouseEvents: false,
        style: () => styleFor(shape.id, state.current),
      } as L.GeoJSONOptions);
      layer.on("mousemove", (e: L.LeafletMouseEvent) => {
        const p = map.latLngToContainerPoint(e.latlng);
        handlers.current.onHover(shape.id, { x: p.x, y: p.y });
      });
      layer.on("mouseout", () => handlers.current.onHover(null));
      layer.on("click", () => handlers.current.onSelect(shape.id));
      layer.addTo(group);
      byId[shape.id] = layer;
    }
    layersRef.current = byId;
    // Under the points: the regions are the ground the dots sit on.
    Object.values(byId).forEach((l) => l?.bringToBack());
    return () => {
      map.removeLayer(group);
      layersRef.current = {};
    };
  }, [map, shapes, renderer]);

  // Restyle in place.
  useEffect(() => {
    for (const r of GRID_REGIONS) layersRef.current[r.id]?.setStyle(styleFor(r.id, { stress, selected, hovered, spotlight }));
  }, [stress, selected, hovered, spotlight, shapes]);

  // Short names at a national zoom; they get in the way once you are in.
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    labelsRef.current = group;
    const draw = () => {
      group.clearLayers();
      const zoom = map.getZoom();
      if (zoom > 6) return;
      for (const r of GRID_REGIONS) {
        if (!shapes.some((s) => s.id === r.id)) continue;
        // ISO-NE and NYISO sit too close to both be named when the whole country is in view.
        if (zoom < 4 && (r.id === "isone" || r.id === "nyiso")) continue;
        L.marker(r.labelAt, {
          icon: L.divIcon({ html: `<span>${r.name}</span>`, className: "region-label", iconSize: [90, 16], iconAnchor: [45, 8] }),
          interactive: false,
          keyboard: false,
          zIndexOffset: -500,
        }).addTo(group);
      }
    };
    draw();
    map.on("zoomend", draw);
    return () => {
      map.off("zoomend", draw);
      map.removeLayer(group);
      labelsRef.current = null;
    };
  }, [map, shapes]);

  return null;
}
