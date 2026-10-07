import { TileLayer } from "react-leaflet";
import { basemapTileLayerProps, type CartoStyle } from "@/lib/basemap";

interface BasemapTilesProps {
  style?: CartoStyle;
  /** Omit to keep Leaflet's default. See basemapTileLayerProps. */
  maxZoom?: number;
}

/**
 * The single place any GridTilt map gets its Carto tiles, so the API key is
 * wired once instead of per map. See client/src/lib/basemap.ts for why the
 * key is public and where it comes from.
 */
export function BasemapTiles({ style = "dark_nolabels", maxZoom }: BasemapTilesProps) {
  return <TileLayer {...basemapTileLayerProps(style, maxZoom)} />;
}
