// ─── Gzipped JSON for large, slow-changing payloads ─────────────────────────
//
// The host (Replit autoscale behind Google's front end) does not compress API
// responses, and the map layers are a few hundred KB of JSON. Routes that
// serve them use this cache: the payload is serialized and gzipped once per
// content key, and each request is answered from the stored buffers.
//
// It is deliberately per route rather than a global compression middleware:
// the security middleware block in server/index.ts is reviewed and not edited
// casually, and most API responses are small or live.

import { gzipSync } from "node:zlib";

export interface GzippedJson {
  json: Buffer;
  gz: Buffer;
}

/**
 * A cache of one entry per name. `key` names the content: the same key
 * returns the stored buffers, a new key rebuilds them.
 */
export function jsonGzipCache(): (name: string, key: string, build: () => unknown) => GzippedJson {
  const entries = new Map<string, { key: string; value: GzippedJson }>();
  return (name, key, build) => {
    const hit = entries.get(name);
    if (hit && hit.key === key) return hit.value;
    const json = Buffer.from(JSON.stringify(build()), "utf-8");
    const value = { json, gz: gzipSync(json) };
    entries.set(name, { key, value });
    return value;
  };
}

/** Does the request's Accept-Encoding header take gzip (and not refuse it with q=0)? */
export function acceptsGzip(header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header.join(",") : header ?? "";
  for (const part of value.split(",")) {
    const [coding, ...params] = part.trim().toLowerCase().split(";");
    if (coding.trim() !== "gzip") continue;
    const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
    return q === undefined || Number(q) > 0;
  }
  return false;
}
