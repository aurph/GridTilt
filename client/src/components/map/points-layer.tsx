/**
 * The two dense point layers: power plants (EIA-860M) and mapped data center
 * sites (PNNL's IM3 atlas, from OpenStreetMap).
 *
 * Both draw on the shared canvas, plants first so data centers sit on top.
 * They are built together in that order whenever either list changes, which
 * is the only way to keep the stacking fixed on one canvas (the lists arrive
 * at different times). Tracked campuses and clusters stay DOM markers above.
 *
 * A mapped site is a location only: one small dot, one color, no size. A
 * plant is a diamond in its fuel's color, quieter than the data centers,
 * sized gently by nameplate MW; nuclear plants carry a ring, because they
 * are the landmarks people know.
 */
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { DiamondMarker } from "@/components/map/canvas-shapes";
import { fuelColor } from "@/lib/fuel-colors";
import { plantRadius, zoomScale } from "@/lib/map-layers";

export interface MapSite {
  id: string;
  lat: number;
  lng: number;
  state: string;
  name?: string;
  operator?: string;
  /** Atlas features folded into this site, when more than one. */
  n?: number;
}

export interface MapPlant {
  id: number;
  name: string;
  operator: string;
  fuel: string;
  mw: number;
  state: string;
  ba: string | null;
  lat: number;
  lng: number;
}

export type PointInfo = ({ kind: "site"; item: MapSite } | { kind: "plant"; item: MapPlant }) & { x: number; y: number };

/** One warm, pale color for every mapped site, so dense areas read as bright clusters. */
export const SITE_COLOR = "#FFD9A6";

export function PointsLayer({
  sites,
  plants,
  renderer,
  siteFocus,
  plantFocus,
  onHover,
  onPick,
}: {
  /** Null when the layer is off or not loaded. */
  sites: MapSite[] | null;
  plants: MapPlant[] | null;
  renderer: L.Renderer;
  /** When set, only these ids are at full strength; the rest dim. */
  siteFocus: Set<string> | null;
  plantFocus: Set<number> | null;
  onHover: (info: PointInfo | null) => void;
  onPick: (info: PointInfo) => void;
}) {
  const map = useMap();
  const handlers = useRef({ onHover, onPick });
  handlers.current = { onHover, onPick };

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const sized: Array<{ marker: L.CircleMarker; base: number }> = [];
    const k = zoomScale(map.getZoom());
    const at = (e: L.LeafletMouseEvent) => {
      const p = map.latLngToContainerPoint(e.latlng);
      return { x: p.x, y: p.y };
    };
    const add = (marker: L.CircleMarker, base: number) => {
      sized.push({ marker, base });
      marker.addTo(group);
    };

    // Largest plants first so a small plant is never hidden under a big one.
    for (const p of plants ?? []) {
      const on = !plantFocus || plantFocus.has(p.id);
      const color = fuelColor(p.fuel);
      const nuclear = p.fuel === "NUC";
      const r = plantRadius(p.mw) + (nuclear ? 0.8 : 0);
      if (nuclear) {
        add(
          L.circleMarker([p.lat, p.lng], { renderer, radius: (r + 3) * k, color, weight: 1, opacity: on ? 0.7 : 0.15, fill: false, interactive: false }),
          r + 3,
        );
      }
      const marker = new DiamondMarker([p.lat, p.lng], {
        renderer,
        radius: r * k,
        stroke: false,
        fillColor: color,
        fillOpacity: on ? (nuclear ? 0.95 : 0.55) : 0.1,
        bubblingMouseEvents: false,
      });
      marker.on("mouseover", (e: L.LeafletMouseEvent) => handlers.current.onHover({ kind: "plant", item: p, ...at(e) }));
      marker.on("mouseout", () => handlers.current.onHover(null));
      marker.on("click", (e: L.LeafletMouseEvent) => handlers.current.onPick({ kind: "plant", item: p, ...at(e) }));
      add(marker, r);
    }

    // Sites on top of plants: a faint glow under every dot, then the dots.
    const list = sites ?? [];
    for (const s of list) {
      const on = !siteFocus || siteFocus.has(s.id);
      add(
        L.circleMarker([s.lat, s.lng], { renderer, radius: 5 * k, stroke: false, fillColor: SITE_COLOR, fillOpacity: on ? 0.08 : 0.015, interactive: false }),
        5,
      );
    }
    for (const s of list) {
      const on = !siteFocus || siteFocus.has(s.id);
      const marker = L.circleMarker([s.lat, s.lng], {
        renderer,
        radius: 1.9 * k,
        stroke: false,
        fillColor: SITE_COLOR,
        fillOpacity: on ? 0.9 : 0.18,
        bubblingMouseEvents: false,
      });
      marker.on("mouseover", (e: L.LeafletMouseEvent) => handlers.current.onHover({ kind: "site", item: s, ...at(e) }));
      marker.on("mouseout", () => handlers.current.onHover(null));
      marker.on("click", (e: L.LeafletMouseEvent) => handlers.current.onPick({ kind: "site", item: s, ...at(e) }));
      add(marker, 1.9);
    }

    const rescale = () => {
      const scale = zoomScale(map.getZoom());
      for (const { marker, base } of sized) marker.setRadius(base * scale);
    };
    map.on("zoomend", rescale);
    return () => {
      map.off("zoomend", rescale);
      map.removeLayer(group);
    };
  }, [map, renderer, sites, plants, siteFocus, plantFocus]);

  return null;
}
