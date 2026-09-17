/**
 * Carto basemap tile URLs.
 *
 * Carto began watermarking anonymous tiles ("API KEY REQUIRED") in Aug 2026.
 * The request still returns HTTP 200 with a valid PNG, so there is no error
 * to catch - an unkeyed map simply renders defaced tiles.
 *
 * The key is injected into index.html by server/runtime-config.ts, which
 * reads the CARTO_API environment variable. It is readable by anyone using
 * the site; that is inherent to a browser-side basemap. Scope it by domain
 * in the Carto dashboard rather than treating it as a secret.
 */

export type CartoStyle = "dark_nolabels" | "dark_all" | "light_nolabels" | "light_all";

export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/**
 * Kept in sync with server/runtime-config.ts. A meta tag rather than an
 * inline script because production CSP is `script-src 'self'`.
 */
export const CARTO_KEY_META_NAME = "gridtilt:carto-api-key";

/** Null when unset, so callers can surface the watermark cause deliberately. */
export function getCartoApiKey(): string | null {
  if (typeof document === "undefined") return null;
  const meta = document.querySelector(`meta[name="${CARTO_KEY_META_NAME}"]`);
  const key = meta?.getAttribute("content");
  return typeof key === "string" && key.length > 0 ? key : null;
}

/**
 * Carto authenticates raster tiles with `key`, not `api_key`. The Leaflet
 * placeholders ({s}/{z}/{x}/{y}/{r}) must survive untouched, so the key is
 * appended as a query string rather than run through a URL builder.
 */
export function cartoTileUrl(
  style: CartoStyle,
  apiKey: string | null = getCartoApiKey(),
): string {
  const base = `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
  return apiKey ? `${base}?key=${encodeURIComponent(apiKey)}` : base;
}

export interface BasemapTileLayerProps {
  url: string;
  attribution: string;
  subdomains: string;
  maxZoom?: number;
}

/**
 * Builds the TileLayer props.
 *
 * maxZoom is omitted rather than passed as undefined on purpose: Leaflet's
 * GridLayer defaults it to 18, and handing it an explicit `undefined`
 * replaces that default instead of falling back to it. An unbounded layer
 * then throws "Attempted to load an infinite number of tiles" and renders
 * nothing - which is what happens on any map whose MapContainer sets no
 * maxZoom of its own.
 */
export function basemapTileLayerProps(
  style: CartoStyle = "dark_nolabels",
  maxZoom?: number,
): BasemapTileLayerProps {
  const props: BasemapTileLayerProps = {
    url: cartoTileUrl(style),
    attribution: CARTO_ATTRIBUTION,
    subdomains: "abcd",
  };
  if (maxZoom !== undefined) props.maxZoom = maxZoom;
  return props;
}
