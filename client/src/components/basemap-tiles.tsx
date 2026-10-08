import { TileLayer } from "react-leaflet";
import { basemapLabelLayerProps, basemapTileLayerProps, type CartoStyle } from "@/lib/basemap";

interface BasemapTilesProps {
  style?: CartoStyle;
  /** Omit to keep Leaflet's default. See basemapTileLayerProps. */
  maxZoom?: number;
}

/**
 * The single place any GridTilt map gets its basemap: Carto when CARTO_API
 * is set, Esri's keyless tiles otherwise. See client/src/lib/basemap.ts.
 */
export function BasemapTiles({ style = "dark_nolabels", maxZoom }: BasemapTilesProps) {
  const labels = basemapLabelLayerProps(style, maxZoom);
  return (
    <>
      <TileLayer {...basemapTileLayerProps(style, maxZoom)} />
      {labels && <TileLayer {...labels} />}
    </>
  );
}
