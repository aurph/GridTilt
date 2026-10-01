/**
 * Whether CARTO accepts the configured basemap key.
 *
 * CARTO answers a request with no key and a request with a key it does not
 * accept the same way: HTTP 200 and one watermark PNG ("API KEY REQUIRED")
 * for every tile, with an ETag that starts with "wm-". Nothing errors. Checked
 * 2026-09-28: no key and a made-up key returned byte-identical PNGs for
 * different tiles and styles. So the only way to know a key works is to fetch
 * tiles with it and look.
 *
 * Two different land tiles are fetched. Real map tiles of different places are
 * never identical; the watermark is the same image everywhere.
 *
 * A key restricted to websites ("Restrict to specific websites (Referer)" in
 * CARTO's dashboard) answers HTTP 403 to any request whose Referer does not
 * match, and server-side requests send none by default (CARTO's basemaps FAQ,
 * checked 2026-10-01). So the check sends the Referer a browser on the site
 * sends: the site's origin, which is what the tiles carry under
 * strict-origin-when-cross-origin (see basemapTileLayerProps). A 403 then
 * means the key's website list does not include the site: "refused".
 */

export type CartoKeyStatus = "unchecked" | "accepted" | "rejected" | "refused" | "unreachable";

/**
 * The origin a browser on the site sends as Referer: production is
 * gridtilt.com (no www; that name has no DNS record), development is
 * localhost. CARTO matches the host only, without scheme or port.
 */
export function siteReferer(env: NodeJS.ProcessEnv = process.env): string {
  return env.NODE_ENV === "production" ? "https://gridtilt.com/" : "http://localhost/";
}

/** Central US at zoom 4 (x=3 and x=4, y=6): both land, visibly different. */
export const PROBE_TILE_URLS = [
  "https://a.basemaps.cartocdn.com/dark_nolabels/4/3/6.png",
  "https://b.basemaps.cartocdn.com/dark_nolabels/4/4/6.png",
] as const;

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

function isWatermarkEtag(etag: string | null): boolean {
  return etag !== null && /^(W\/)?"wm-/.test(etag);
}

export async function probeCartoKey(
  key: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 8000,
  referer: string = siteReferer(),
): Promise<Exclude<CartoKeyStatus, "unchecked">> {
  let responses;
  try {
    responses = await Promise.all(
      PROBE_TILE_URLS.map((url) =>
        fetchImpl(`${url}?key=${encodeURIComponent(key)}`, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { Referer: referer },
        }),
      ),
    );
  } catch {
    return "unreachable";
  }

  // A known key whose website restriction does not cover this site.
  if (responses.some((r) => r.status === 401 || r.status === 403)) return "refused";
  if (responses.some((r) => !r.ok)) return "unreachable";
  if (responses.some((r) => isWatermarkEtag(r.headers.get("etag")))) return "rejected";

  let bodies: Buffer[];
  try {
    bodies = await Promise.all(responses.map(async (r) => Buffer.from(await r.arrayBuffer())));
  } catch {
    return "unreachable";
  }
  return bodies[0].equals(bodies[1]) ? "rejected" : "accepted";
}
