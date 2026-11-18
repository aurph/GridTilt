// ─── Mapped data center sites ───────────────────────────────────────────────
//
// Small, location-only dots for the map, from one source: PNNL's IM3 Open
// Source Data Center Atlas, which is built from OpenStreetMap and published
// under the Open Database License (ODbL 1.0). scripts/ingest-dc-sites.ts
// downloads the atlas and this module turns its features into sites and
// builds server/data/datacenter-sites.json.
//
// A mapped site is a place and, where OpenStreetMap carries them, a name and
// an operator. It has no megawatts, no status and no date: the atlas has none,
// and GridTilt does not invent them. Sites never enter a MW or TWh total.
//
// Two rules keep one dot per site:
// - collapseSites folds the atlas's overlapping features (a campus outline and
//   its buildings, neighbouring buildings of one operator) into one site.
// - dropTrackedCampusSites leaves out sites that are a campus GridTilt already
//   tracks in datacenters.json. The server applies it when it serves the file,
//   against the tracked list as it is at that moment, because that list
//   changes at runtime (the ingester promotes new campuses).

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface AtlasFeature {
  lat: number;
  lng: number;
  name: string | null;
  operator: string | null;
  /** Two-letter state code (or DC), as the atlas assigns it. */
  state: string;
  /** The atlas layer: a point, a building footprint or a campus outline (both as centroids). */
  kind: "point" | "building" | "campus";
  /** Footprint area in square feet, where the atlas computed one. Used only to size a campus outline. */
  sqft: number | null;
}

export interface DcSite {
  id: string;
  lat: number;
  lng: number;
  state: string;
  name?: string;
  operator?: string;
  /** How many atlas features were folded into this site, when more than one. */
  n?: number;
}

export interface TrackedCampus {
  id: number;
  name: string;
  company: string;
  lat: number;
  lng: number;
  status: string;
}

const US_STATES = new Set(
  ("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY").split(" "),
);
/** The fifty states and DC: Hawaii's south tip to Alaska's north coast, the Aleutians to Maine. */
const inUsBounds = (lat: number, lng: number) => lat >= 18 && lat <= 72 && lng >= -180 && lng <= -66;

function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" || /^(nan|none|null)$/i.test(t) ? null : t;
}

/** The atlas's centroid GeoJSON as features. Anything that is not a point in a US state or DC is counted and left out. */
export function parseAtlasFeatures(geojson: unknown): { features: AtlasFeature[]; skipped: { badGeometry: number; outsideUs: number } } {
  const g = geojson as { type?: string; features?: unknown[] } | null;
  if (!g || g.type !== "FeatureCollection" || !Array.isArray(g.features)) throw new Error("expected a GeoJSON FeatureCollection");
  const features: AtlasFeature[] = [];
  const skipped = { badGeometry: 0, outsideUs: 0 };
  for (const raw of g.features) {
    const f = raw as { geometry?: { type?: string; coordinates?: unknown[] } | null; properties?: Record<string, unknown> | null };
    const c = f?.geometry?.type === "Point" ? f.geometry.coordinates : null;
    const lng = Array.isArray(c) ? Number(c[0]) : NaN;
    const lat = Array.isArray(c) ? Number(c[1]) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped.badGeometry += 1;
      continue;
    }
    const p = f.properties ?? {};
    const state = cleanText(p.state_abb)?.toUpperCase() ?? "";
    if (!US_STATES.has(state) || !inUsBounds(lat, lng)) {
      skipped.outsideUs += 1;
      continue;
    }
    const sqft = typeof p.sqft === "number" ? p.sqft : typeof p.sqft === "string" && p.sqft.trim() !== "" ? Number(p.sqft) : NaN;
    const kind = p.type === "building" || p.type === "campus" ? p.type : "point";
    features.push({
      lat,
      lng,
      name: cleanText(p.name),
      operator: cleanText(p.operator),
      state,
      kind,
      sqft: Number.isFinite(sqft) && sqft > 0 ? sqft : null,
    });
  }
  return { features, skipped };
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Lowercase letters and digits only, so "Digital Realty" and "digital-realty" compare equal. */
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** A feature or a partly merged site, with the tallies needed to name the result. */
interface Node {
  lat: number;
  lng: number;
  weight: number;
  op: string;
  name: string;
  kind: AtlasFeature["kind"];
  sqft: number | null;
  ops: Map<string, number>;
  names: Map<string, number>;
  states: Map<string, number>;
}

function mostCommon(tally: Map<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const k of Array.from(tally.keys()).sort()) {
    const n = tally.get(k) as number;
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

const SQFT_TO_M2 = 0.09290304;
const KM_PER_DEG_LAT = 111.195;

/** One pass: nodes that are the same site are merged. Returns the merged nodes. */
function mergePass(input: Node[], radiusKm: number): Node[] {
  const nodes = [...input].sort(
    (a, b) => a.lat - b.lat || a.lng - b.lng || a.op.localeCompare(b.op) || a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind),
  );
  const parent = nodes.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const tagged = (n: Node) => n.op !== "" || n.name !== "";
  const sameIdentity = (a: Node, b: Node) => (a.op !== "" && a.op === b.op) || (a.name !== "" && a.name === b.name);

  // Neighbours within the radius: same operator or name, or both untagged.
  // An untagged feature never joins a tagged one here, so it cannot bridge
  // two operators' buildings into one site.
  const latReach = radiusKm / KM_PER_DEG_LAT;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length && nodes[j].lat - nodes[i].lat <= latReach; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const both = tagged(a) && tagged(b);
      const neither = !tagged(a) && !tagged(b);
      if (!(neither || (both && sameIdentity(a, b)))) continue;
      if (haversineKm(a, b) <= radiusKm) union(i, j);
    }
  }

  // A campus outline takes in what lies inside it: untagged features and
  // features of its own operator or name, within the radius of a circle of
  // the outline's area (at least the neighbour radius, at most 1.5 km).
  for (let i = 0; i < nodes.length; i++) {
    const c = nodes[i];
    if (c.kind !== "campus" || !c.sqft) continue;
    const reach = Math.min(1.5, Math.max(radiusKm, Math.sqrt((c.sqft * SQFT_TO_M2) / Math.PI) / 1000));
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const f = nodes[j];
      if (Math.abs(f.lat - c.lat) > reach / KM_PER_DEG_LAT) continue;
      if (!(!tagged(f) || (tagged(c) && sameIdentity(c, f)))) continue;
      if (haversineKm(c, f) <= reach) union(i, j);
    }
  }

  const groups = new Map<number, Node[]>();
  nodes.forEach((n, i) => {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(n);
    else groups.set(r, [n]);
  });
  const out: Node[] = [];
  groups.forEach((members) => {
    if (members.length === 1) {
      // Past its first pass a node is a site, not an outline.
      out.push({ ...members[0], kind: "point", sqft: null });
      return;
    }
    const weight = members.reduce((s, n) => s + n.weight, 0);
    const merged: Node = {
      lat: members.reduce((s, n) => s + n.lat * n.weight, 0) / weight,
      lng: members.reduce((s, n) => s + n.lng * n.weight, 0) / weight,
      weight,
      op: "",
      name: "",
      kind: "point",
      sqft: null,
      ops: new Map(),
      names: new Map(),
      states: new Map(),
    };
    for (const n of members) {
      n.ops.forEach((v, k) => merged.ops.set(k, (merged.ops.get(k) ?? 0) + v));
      n.names.forEach((v, k) => merged.names.set(k, (merged.names.get(k) ?? 0) + v));
      n.states.forEach((v, k) => merged.states.set(k, (merged.states.get(k) ?? 0) + v));
    }
    merged.op = norm(mostCommon(merged.ops));
    merged.name = norm(mostCommon(merged.names));
    out.push(merged);
  });
  return out;
}

/**
 * The atlas's features as sites: one per place. Repeats until nothing more
 * merges, so in the result no two sites that share an operator or a name, and
 * no two untagged sites, are within the radius of each other.
 */
export function collapseSites(features: AtlasFeature[], opts: { radiusKm?: number } = {}): DcSite[] {
  const radiusKm = opts.radiusKm ?? 0.2;
  let nodes: Node[] = features.map((f) => ({
    lat: f.lat,
    lng: f.lng,
    weight: 1,
    op: norm(f.operator),
    name: norm(f.name),
    kind: f.kind,
    sqft: f.sqft,
    ops: new Map(f.operator ? [[f.operator, 1]] : []),
    names: new Map(f.name ? [[f.name, 1]] : []),
    states: new Map([[f.state, 1]]),
  }));
  for (;;) {
    const next = mergePass(nodes, radiusKm);
    const done = next.length === nodes.length;
    nodes = next;
    if (done) break;
  }

  const sites = nodes.map((n) => {
    const lat = Number(n.lat.toFixed(5));
    const lng = Number(n.lng.toFixed(5));
    const site: DcSite = { id: `s${lat.toFixed(5)}_${lng.toFixed(5)}`, lat, lng, state: mostCommon(n.states) ?? "" };
    const name = mostCommon(n.names);
    const operator = mostCommon(n.ops);
    if (name) site.name = name;
    if (operator) site.operator = operator;
    if (n.weight > 1) site.n = n.weight;
    return site;
  });
  // North to south, then west to east: a stable order for the file.
  sites.sort(
    (a, b) => b.lat - a.lat || a.lng - b.lng || (a.operator ?? "").localeCompare(b.operator ?? "") || (a.name ?? "").localeCompare(b.name ?? ""),
  );
  const used = new Map<string, number>();
  for (const s of sites) {
    const n = (used.get(s.id) ?? 0) + 1;
    used.set(s.id, n);
    if (n > 1) s.id = `${s.id}-${n}`;
  }
  return sites;
}

/** Whole-word patterns for the companies in datacenters.json, including the names OpenStreetMap uses for them. */
const COMPANY_PATTERNS: Record<string, RegExp> = {
  Amazon: /\b(amazon|aws)\b/i,
  Microsoft: /\b(microsoft|azure)\b/i,
  Google: /\b(google|alphabet)\b/i,
  Meta: /\b(meta|facebook)\b/i,
  Apple: /\bapple\b/i,
  Oracle: /\boracle\b/i,
  xAI: /\bx\.?ai\b/i,
  // Stargate sites are built and run with partners; their buildings carry the partner's name.
  OpenAI: /\b(openai|stargate|crusoe|lancium|oracle)\b/i,
  CoreWeave: /\bcore\s?weave\b/i,
  Nebius: /\bnebius\b/i,
};

/** A tracked campus that is capacity inside a host's campus is named for the host; the host's buildings there are that campus. */
const HOSTS: Array<{ inCampusName: RegExp; pattern: RegExp }> = [
  { inCampusName: /\bqts\b/i, pattern: /\b(qts|quality technology services)\b/i },
];

/** Does a mapped site's operator or name name this tracked company (or, for a hosted campus, its host)? */
export function namesCompany(company: string, operator: string | null | undefined, name: string | null | undefined, campusName?: string): boolean {
  const hay = `${operator ?? ""} | ${name ?? ""}`;
  const pattern = COMPANY_PATTERNS[company] ?? new RegExp(`\\b${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  if (pattern.test(hay)) return true;
  if (campusName) {
    for (const h of HOSTS) if (h.inCampusName.test(campusName) && h.pattern.test(hay)) return true;
  }
  return false;
}

/** A site of the tracked company this close to the campus's listed place is that campus. */
export const TRACKED_NAMED_RADIUS_KM = 10;
/** An untagged site this close to a built campus is that campus, where no other company is as close. */
export const TRACKED_UNTAGGED_RADIUS_KM = 6;

/**
 * Sites that are not a campus GridTilt already tracks.
 *
 * Tracked campuses carry city-level coordinates, so this is a proximity rule,
 * not a parcel match: a site whose operator or name names the campus's company
 * within 10 km is that campus; so is an untagged site within 6 km of a campus
 * that is built or being built, when no other company's site is within that
 * 6 km (in a town with one data center, the unlabelled buildings are it; in a
 * metro they could be anyone's and stay).
 */
export function dropTrackedCampusSites(
  sites: DcSite[],
  tracked: TrackedCampus[],
): { kept: DcSite[]; dropped: Array<{ campusId: number; campus: string; named: number; untagged: number }> } {
  const isTagged = (s: DcSite) => Boolean(s.operator || s.name);
  const crowded = new Map<number, boolean>();
  for (const t of tracked) {
    crowded.set(
      t.id,
      sites.some((s) => isTagged(s) && !namesCompany(t.company, s.operator, s.name, t.name) && haversineKm(s, t) <= TRACKED_UNTAGGED_RADIUS_KM),
    );
  }
  const tally = new Map<number, { campusId: number; campus: string; named: number; untagged: number }>();
  const kept: DcSite[] = [];
  for (const s of sites) {
    let best: TrackedCampus | null = null;
    let bestD = Infinity;
    for (const t of tracked) {
      const d = haversineKm(s, t);
      const claims = isTagged(s)
        ? d <= TRACKED_NAMED_RADIUS_KM && namesCompany(t.company, s.operator, s.name, t.name)
        : d <= TRACKED_UNTAGGED_RADIUS_KM && t.status !== "announced" && !crowded.get(t.id);
      if (claims && (d < bestD || (d === bestD && best !== null && t.id < best.id))) {
        best = t;
        bestD = d;
      }
    }
    if (!best) {
      kept.push(s);
      continue;
    }
    const row = tally.get(best.id) ?? { campusId: best.id, campus: best.name, named: 0, untagged: 0 };
    if (isTagged(s)) row.named += 1;
    else row.untagged += 1;
    tally.set(best.id, row);
  }
  return { kept, dropped: Array.from(tally.values()).sort((a, b) => a.campusId - b.campusId) };
}

export interface DcSitesFile {
  dataset: "datacenter-sites";
  /** The day the atlas was downloaded, YYYY-MM-DD. */
  retrieved: string;
  source: {
    name: string;
    publisher: string;
    version: string;
    /** The atlas version's publication date, YYYY-MM-DD. */
    published: string;
    doi: string;
    url: string;
    /** The file that was read. */
    retrievedFrom: string;
    citation: string;
    upstream: string;
  };
  license: { name: string; url: string; note: string };
  /** The credit line the map and the source footer must show. */
  attribution: string;
  method: string[];
  counts: {
    sourceFeatures: number;
    outsideUs: number;
    badGeometry: number;
    sites: number;
    lower48: number;
    withOperator: number;
    withName: number;
    /** For the record: what the tracked-campus rule left out on the day of the ingest. The server recomputes it. */
    trackedAtIngest: { campuses: number; sitesLeftOut: number };
  };
  sites: DcSite[];
}

const ODBL_URL = "https://opendatacommons.org/licenses/odbl/1-0/";

export function buildSitesFile(input: {
  retrieved: string;
  sourceFeatures: number;
  skipped: { badGeometry: number; outsideUs: number };
  sites: DcSite[];
  trackedAtIngest: { campuses: number; sitesLeftOut: number };
  atlas: { version: string; published: string; doi: string; retrievedFrom: string };
}): DcSitesFile {
  const { atlas, sites } = input;
  const year = atlas.published.slice(0, 4);
  return {
    dataset: "datacenter-sites",
    retrieved: input.retrieved,
    source: {
      name: "IM3 Open Source Data Center Atlas",
      publisher: "Pacific Northwest National Laboratory",
      version: atlas.version,
      published: atlas.published,
      doi: atlas.doi,
      url: `https://doi.org/${atlas.doi}`,
      retrievedFrom: atlas.retrievedFrom,
      citation: `Mongird, K., Thurber, T., Vernon, C., Burleyson, C., Akdemir, K. Z., & Rice, J. (${year}). IM3 Open Source Data Center Atlas (${atlas.version}) [Data set]. MSD-LIVE Data Repository. https://doi.org/${atlas.doi}`,
      upstream: "Facility locations in the atlas come from OpenStreetMap (https://www.openstreetmap.org/copyright).",
    },
    license: {
      name: "Open Database License (ODbL) 1.0",
      url: ODBL_URL,
      note: "This file is a database derived from the atlas and, through it, from OpenStreetMap. It is offered under the same license; see datacenter-sites.LICENSE.md beside it.",
    },
    attribution: `Data center sites: IM3 Open Source Data Center Atlas ${atlas.version} (PNNL), built from OpenStreetMap. © OpenStreetMap contributors. ODbL 1.0.`,
    method: [
      "Read the atlas's centroid layer: one point per mapped data center point, building footprint or campus outline in the United States.",
      "Kept points in the fifty states and DC. Kept each point's place, and its name and operator where OpenStreetMap carries them.",
      "Folded overlapping features into one site: features of the same operator or the same name within 200 m, untagged features within 200 m of each other, and the untagged or same-operator features inside a campus outline. Repeated until nothing more merged.",
      "A site sits at the mean of its features and takes the name and operator most of them carry. Its id is its rounded coordinates.",
      "A site is a location only. The atlas carries no power capacity, status or date, and GridTilt adds none; sites never enter a MW or TWh total.",
      `When the file is served, sites that are a campus GridTilt already tracks are left out, so a tracked campus is never drawn twice: a site naming the campus's company within ${TRACKED_NAMED_RADIUS_KM} km of it, or an untagged site within ${TRACKED_UNTAGGED_RADIUS_KM} km of a built campus where no other company's site is as close. Tracked campuses carry city-level coordinates, so this is a proximity rule.`,
      "OpenStreetMap is crowd-sourced: a data center nobody has mapped is missing, and a mapped building may be mislabelled. PNNL removes records that appear to carry personal information.",
    ],
    counts: {
      sourceFeatures: input.sourceFeatures,
      outsideUs: input.skipped.outsideUs,
      badGeometry: input.skipped.badGeometry,
      sites: sites.length,
      lower48: sites.filter((s) => s.state !== "AK" && s.state !== "HI").length,
      withOperator: sites.filter((s) => s.operator).length,
      withName: sites.filter((s) => s.name).length,
      trackedAtIngest: input.trackedAtIngest,
    },
    sites,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SITE_KEYS = new Set(["id", "lat", "lng", "state", "name", "operator", "n"]);

/** The file, checked. Throws with every problem found (the first ten are listed). */
export function validateSitesFile(raw: unknown): DcSitesFile {
  const errors: string[] = [];
  const f = (raw ?? {}) as Partial<DcSitesFile>;
  if (f.dataset !== "datacenter-sites") errors.push(`dataset is ${JSON.stringify(f.dataset)}, expected "datacenter-sites"`);
  if (typeof f.retrieved !== "string" || !DAY.test(f.retrieved)) errors.push(`retrieved ${JSON.stringify(f.retrieved)} is not YYYY-MM-DD`);
  const src = f.source;
  if (!src || typeof src !== "object") errors.push("source is missing");
  else {
    for (const k of ["name", "publisher", "version", "doi", "citation"] as const) {
      if (typeof src[k] !== "string" || src[k].trim() === "") errors.push(`source.${k} is missing`);
    }
    if (typeof src.published !== "string" || !DAY.test(src.published)) errors.push(`source.published ${JSON.stringify(src.published)} is not YYYY-MM-DD`);
    for (const k of ["url", "retrievedFrom"] as const) {
      if (typeof src[k] !== "string" || !src[k].startsWith("https://")) errors.push(`source.${k} must be an https address`);
    }
  }
  if (!f.license || typeof f.license.name !== "string" || !/ODbL/.test(f.license.name) || f.license.url !== ODBL_URL) {
    errors.push(`license must be the ODbL 1.0 (${ODBL_URL}): the file is derived from OpenStreetMap`);
  }
  if (typeof f.attribution !== "string" || !/OpenStreetMap contributors/.test(f.attribution)) {
    errors.push('attribution must credit "OpenStreetMap contributors"');
  }
  if (!Array.isArray(f.method) || f.method.length === 0) errors.push("method is missing");
  if (!Array.isArray(f.sites)) errors.push("sites is not an array");
  else {
    const seen = new Set<string>();
    f.sites.forEach((s, i) => {
      const where = `sites[${i}] (${s?.id ?? "no id"})`;
      if (typeof s?.id !== "string" || s.id === "") errors.push(`${where}: id is missing`);
      else if (seen.has(s.id)) errors.push(`${where}: duplicate site id`);
      else seen.add(s.id);
      if (typeof s?.lat !== "number" || typeof s?.lng !== "number" || !inUsBounds(s.lat, s.lng)) {
        errors.push(`${where}: ${JSON.stringify(s?.lat)}, ${JSON.stringify(s?.lng)} is outside the United States`);
      }
      if (typeof s?.state !== "string" || !US_STATES.has(s.state)) errors.push(`${where}: state ${JSON.stringify(s?.state)} is not a US state or DC`);
      for (const k of ["name", "operator"] as const) {
        if (s?.[k] !== undefined && (typeof s[k] !== "string" || (s[k] as string).trim() === "")) errors.push(`${where}: ${k} must be text when present`);
      }
      if (s?.n !== undefined && (!Number.isInteger(s.n) || s.n < 2)) errors.push(`${where}: n must be a whole number of 2 or more when present`);
      for (const k of Object.keys(s ?? {})) {
        if (!SITE_KEYS.has(k)) errors.push(`${where}: unexpected field ${k}. A mapped site is a location only`);
      }
    });
    if (f.counts && f.counts.sites !== f.sites.length) errors.push(`counts.sites is ${f.counts.sites} but the file holds ${f.sites.length} sites`);
  }
  if (errors.length > 0) {
    throw new Error(`datacenter-sites.json is not valid (${errors.length} problem${errors.length === 1 ? "" : "s"}):\n- ${errors.slice(0, 10).join("\n- ")}`);
  }
  return f as DcSitesFile;
}

/** What GET /api/map/sites answers. */
export interface SitesPayload {
  source: { name: string; publisher: string; version: string; published: string; url: string };
  license: { name: string; url: string };
  attribution: string;
  retrieved: string;
  counts: {
    /** Sites sent: the file's sites minus the ones that are a tracked campus today. */
    sites: number;
    leftOutAsTracked: number;
    trackedCampuses: number;
  };
  sites: DcSite[];
}

/**
 * The file as the map receives it: the sites that are not a campus GridTilt
 * tracks right now, with the credit and source the map must show. The method
 * text stays in the file.
 */
export function sitesPayload(file: DcSitesFile, tracked: TrackedCampus[]): SitesPayload {
  const { kept } = dropTrackedCampusSites(file.sites, tracked);
  const { name, publisher, version, published, url } = file.source;
  return {
    source: { name, publisher, version, published, url },
    license: { name: file.license.name, url: file.license.url },
    attribution: file.attribution,
    retrieved: file.retrieved,
    counts: { sites: kept.length, leftOutAsTracked: file.sites.length - kept.length, trackedCampuses: tracked.length },
    sites: kept,
  };
}

let cache: { path: string; mtimeMs: number; file: DcSitesFile } | null = null;

/** server/data/datacenter-sites.json, validated; re-read only when the file changes. */
export function loadDcSites(dir: string = join(process.cwd(), "server", "data")): DcSitesFile {
  const path = join(dir, "datacenter-sites.json");
  const { mtimeMs } = statSync(path);
  if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.file;
  const file = validateSitesFile(JSON.parse(readFileSync(path, "utf-8")));
  cache = { path, mtimeMs, file };
  return file;
}
