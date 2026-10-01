import { GeoJSON, TileLayer } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { basemapTileLayerProps, getCartoApiKey, OUTLINE_ATTRIBUTION, type CartoStyle } from "@/lib/basemap";
import { BORDER, SURFACE } from "@/lib/tokens";
// US state boundaries: US Census cartographic boundary file (public domain),
// the same file My Grid draws its selected state from.
import statesGeoRaw from "@/data/us-states.geo.json";

const statesGeo = statesGeoRaw as unknown as FeatureCollection;

/** Land a step lighter than the map background, borders as faint lines. */
const OUTLINE_STYLE = {
  color: BORDER.strong,
  weight: 0.8,
  fillColor: SURFACE.raised,
  fillOpacity: 1,
};

interface BasemapTilesProps {
  style?: CartoStyle;
  /** Omit to keep Leaflet's default. See basemapTileLayerProps. */
  maxZoom?: number;
}

/**
 * The single place any GridTilt map gets its Carto tiles, so the API key is
 * wired once instead of per map. See client/src/lib/basemap.ts for why the
 * key is public and where it comes from.
 *
 * No key in the page means none is configured or CARTO rejected it (the server
 * checks; see server/runtime-config.ts). Every CARTO tile would then be the
 * same "API KEY REQUIRED" watermark, so the map draws state outlines instead
 * and says so in its attribution.
 */
export function BasemapTiles({ style = "dark_nolabels", maxZoom }: BasemapTilesProps) {
  if (!getCartoApiKey()) {
    return <GeoJSON data={statesGeo} interactive={false} style={OUTLINE_STYLE} attribution={OUTLINE_ATTRIBUTION} />;
  }
  return <TileLayer {...basemapTileLayerProps(style, maxZoom)} />;
}
