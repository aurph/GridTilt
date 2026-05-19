import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import RSSParser from "rss-parser";

export type ApprovedDatacenter = {
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
};

export type PendingDatacenter = ApprovedDatacenter & {
  sourceUrl: string;
  sourceTitle: string;
  sourceName: string;
  discoveredAt: string;
  approxCoords: boolean;
};

const INGEST_FEEDS: Array<{ url: string; sourceName: string }> = [
  { url: "https://www.datacenterdynamics.com/en/rss/", sourceName: "DCD" },
  { url: "https://www.utilitydive.com/feeds/news/", sourceName: "Utility Dive" },
  { url: "https://www.power-eng.com/feed/", sourceName: "Power Engineering" },
  { url: "https://www.powermag.com/feed/", sourceName: "Power Magazine" },
];

const HYPERSCALER_COMPANIES: Array<{ name: string; aliases: string[] }> = [
  { name: "Microsoft", aliases: ["microsoft", "azure"] },
  { name: "Google", aliases: ["google", "alphabet"] },
  { name: "Amazon", aliases: ["amazon", "aws", "amazon web services"] },
  { name: "Meta", aliases: ["meta", "facebook"] },
  { name: "Apple", aliases: ["apple"] },
  { name: "Oracle", aliases: ["oracle"] },
  { name: "OpenAI", aliases: ["openai"] },
  { name: "Anthropic", aliases: ["anthropic"] },
  { name: "xAI", aliases: ["xai", "x.ai"] },
  { name: "CoreWeave", aliases: ["coreweave"] },
  { name: "Crusoe", aliases: ["crusoe"] },
  { name: "Equinix", aliases: ["equinix"] },
  { name: "Digital Realty", aliases: ["digital realty"] },
  { name: "QTS", aliases: ["qts realty", "qts data centers"] },
  { name: "Stack Infrastructure", aliases: ["stack infrastructure"] },
  { name: "Vantage", aliases: ["vantage data centers"] },
  { name: "EdgeConneX", aliases: ["edgeconnex"] },
  { name: "Switch", aliases: ["switch inc"] },
  { name: "Iron Mountain", aliases: ["iron mountain"] },
  { name: "Aligned", aliases: ["aligned data centers"] },
  { name: "Compass", aliases: ["compass datacenters"] },
];

const US_STATES: Record<string, { abbr: string; lat: number; lng: number }> = {
  alabama: { abbr: "AL", lat: 32.806, lng: -86.791 },
  alaska: { abbr: "AK", lat: 61.370, lng: -152.404 },
  arizona: { abbr: "AZ", lat: 33.729, lng: -111.431 },
  arkansas: { abbr: "AR", lat: 34.969, lng: -92.373 },
  california: { abbr: "CA", lat: 36.116, lng: -119.681 },
  colorado: { abbr: "CO", lat: 39.059, lng: -105.311 },
  connecticut: { abbr: "CT", lat: 41.597, lng: -72.755 },
  delaware: { abbr: "DE", lat: 39.318, lng: -75.507 },
  florida: { abbr: "FL", lat: 27.766, lng: -81.686 },
  georgia: { abbr: "GA", lat: 33.040, lng: -83.643 },
  hawaii: { abbr: "HI", lat: 21.094, lng: -157.498 },
  idaho: { abbr: "ID", lat: 44.240, lng: -114.478 },
  illinois: { abbr: "IL", lat: 40.349, lng: -88.986 },
  indiana: { abbr: "IN", lat: 39.849, lng: -86.258 },
  iowa: { abbr: "IA", lat: 42.011, lng: -93.210 },
  kansas: { abbr: "KS", lat: 38.526, lng: -96.726 },
  kentucky: { abbr: "KY", lat: 37.668, lng: -84.670 },
  louisiana: { abbr: "LA", lat: 31.169, lng: -91.867 },
  maine: { abbr: "ME", lat: 44.693, lng: -69.381 },
  maryland: { abbr: "MD", lat: 39.063, lng: -76.802 },
  massachusetts: { abbr: "MA", lat: 42.230, lng: -71.530 },
  michigan: { abbr: "MI", lat: 43.326, lng: -84.536 },
  minnesota: { abbr: "MN", lat: 45.694, lng: -93.900 },
  mississippi: { abbr: "MS", lat: 32.741, lng: -89.678 },
  missouri: { abbr: "MO", lat: 38.456, lng: -92.288 },
  montana: { abbr: "MT", lat: 46.921, lng: -110.454 },
  nebraska: { abbr: "NE", lat: 41.125, lng: -98.268 },
  nevada: { abbr: "NV", lat: 38.313, lng: -117.055 },
  "new hampshire": { abbr: "NH", lat: 43.452, lng: -71.563 },
  "new jersey": { abbr: "NJ", lat: 40.298, lng: -74.521 },
  "new mexico": { abbr: "NM", lat: 34.840, lng: -106.248 },
  "new york": { abbr: "NY", lat: 42.165, lng: -74.948 },
  "north carolina": { abbr: "NC", lat: 35.630, lng: -79.806 },
  "north dakota": { abbr: "ND", lat: 47.528, lng: -99.784 },
  ohio: { abbr: "OH", lat: 40.388, lng: -82.764 },
  oklahoma: { abbr: "OK", lat: 35.565, lng: -96.928 },
  oregon: { abbr: "OR", lat: 44.572, lng: -122.070 },
  pennsylvania: { abbr: "PA", lat: 40.590, lng: -77.209 },
  "rhode island": { abbr: "RI", lat: 41.680, lng: -71.511 },
  "south carolina": { abbr: "SC", lat: 33.856, lng: -80.945 },
  "south dakota": { abbr: "SD", lat: 44.299, lng: -99.439 },
  tennessee: { abbr: "TN", lat: 35.747, lng: -86.692 },
  texas: { abbr: "TX", lat: 31.054, lng: -97.563 },
  utah: { abbr: "UT", lat: 40.150, lng: -111.862 },
  vermont: { abbr: "VT", lat: 44.045, lng: -72.710 },
  virginia: { abbr: "VA", lat: 37.770, lng: -78.169 },
  washington: { abbr: "WA", lat: 47.400, lng: -121.490 },
  "west virginia": { abbr: "WV", lat: 38.491, lng: -80.954 },
  wisconsin: { abbr: "WI", lat: 44.268, lng: -89.616 },
  wyoming: { abbr: "WY", lat: 42.756, lng: -107.302 },
};

const STATE_ABBR_TO_KEY: Record<string, string> = Object.entries(US_STATES).reduce(
  (acc, [name, info]) => {
    acc[info.abbr] = name;
    return acc;
  },
  {} as Record<string, string>,
);

const DC_KEYWORDS = [
  "data center", "datacenter", "data centre", "data-center", "campus",
  "hyperscale", "ai facility", "ai data center", "cloud region",
];

type ParsedCandidate = {
  company: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  powerMW: number;
  approxCoords: boolean;
};

export function parsePowerMW(text: string): number | null {
  // Match "600 MW", "1.2 GW", "1,200 MW", "600-megawatt"
  const lower = text.toLowerCase();
  const patterns: Array<{ re: RegExp; mult: number }> = [
    { re: /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:gw|gigawatt|gigawatts)\b/g, mult: 1000 },
    { re: /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:mw|megawatt|megawatts|-megawatt|-mw)\b/g, mult: 1 },
  ];
  let best = 0;
  for (const { re, mult } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      const raw = m[1].replace(/,/g, "");
      const num = parseFloat(raw);
      if (Number.isFinite(num)) {
        const mw = num * mult;
        if (mw > best && mw < 100000) best = mw;
      }
    }
  }
  return best > 0 ? best : null;
}

export function detectCompany(text: string): string | null {
  const lower = text.toLowerCase();
  for (const c of HYPERSCALER_COMPANIES as Array<{ name: string; aliases: string[] }>) {
    for (const alias of c.aliases) {
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(lower)) return c.name;
    }
  }
  return null;
}

export function detectLocation(
  text: string,
  cityCoords: Map<string, { lat: number; lng: number; state: string }>,
): { city: string; state: string; lat: number; lng: number; approx: boolean } | null {
  const lower = text.toLowerCase();

  // 1. Known city lookup (cities from existing datacenters.json)
  for (const [cityKey, info] of Array.from(cityCoords.entries())) {
    const re = new RegExp(`\\b${cityKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) {
      return { city: cityKey.replace(/\b\w/g, (c) => c.toUpperCase()), state: info.state, lat: info.lat, lng: info.lng, approx: false };
    }
  }

  // 2. "City, ST" pattern
  const cityState = /([A-Z][a-zA-Z.\- ]{2,30}),\s*([A-Z]{2})\b/.exec(text);
  if (cityState) {
    const abbr = cityState[2];
    const stateKey = STATE_ABBR_TO_KEY[abbr];
    if (stateKey) {
      const s = US_STATES[stateKey];
      return { city: cityState[1].trim(), state: abbr, lat: s.lat, lng: s.lng, approx: true };
    }
  }

  // 3. Full state name fallback
  for (const [name, info] of Object.entries(US_STATES)) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(lower)) {
      return { city: "Unknown", state: info.abbr, lat: info.lat, lng: info.lng, approx: true };
    }
  }

  return null;
}

function buildCityCoords(approved: ApprovedDatacenter[]): Map<string, { lat: number; lng: number; state: string }> {
  const m = new Map<string, { lat: number; lng: number; state: string }>();
  for (const d of approved) {
    if (!d.city || d.city === "Unknown") continue;
    m.set(d.city.toLowerCase(), { lat: d.lat, lng: d.lng, state: d.state });
  }
  return m;
}

function isDatacenterRelevant(text: string): boolean {
  const lower = text.toLowerCase();
  return DC_KEYWORDS.some((kw) => lower.includes(kw));
}

export function parseFeedItem(
  title: string,
  description: string,
  cityCoords: Map<string, { lat: number; lng: number; state: string }>,
): ParsedCandidate | null {
  const text = `${title} ${description}`;
  if (!isDatacenterRelevant(text)) return null;
  const mw = parsePowerMW(text);
  if (mw === null || mw < 400) return null;
  const company = detectCompany(text);
  if (!company) return null;
  const loc = detectLocation(text, cityCoords);
  if (!loc) return null;
  return {
    company,
    city: loc.city,
    state: loc.state,
    lat: loc.lat,
    lng: loc.lng,
    powerMW: Math.round(mw),
    approxCoords: loc.approx,
  };
}

// Mirrors the admin POST /api/admin/datacenters dedupe in server/routes.ts:
// match on name (case-insensitive) OR (lat/lng within 0.01 deg AND same company).
export function isAdminDuplicate(
  candidate: { name: string; company: string; lat: number; lng: number },
  existing: { name: string; company: string; lat: number; lng: number },
): boolean {
  if (existing.name.toLowerCase() === candidate.name.toLowerCase()) return true;
  if (
    Math.abs(existing.lat - candidate.lat) < 0.01 &&
    Math.abs(existing.lng - candidate.lng) < 0.01 &&
    existing.company.toLowerCase() === candidate.company.toLowerCase()
  ) return true;
  return false;
}

export function dedupeAgainst(
  candidate: { name: string; company: string; lat: number; lng: number },
  approved: ApprovedDatacenter[],
  pending: PendingDatacenter[],
): boolean {
  for (const d of approved) {
    if (isAdminDuplicate(candidate, d)) return true;
  }
  for (const d of pending) {
    if (isAdminDuplicate(candidate, d)) return true;
  }
  return false;
}

export type IngesterPaths = {
  approvedPath: string;
  pendingPath: string;
};

export function defaultPaths(): IngesterPaths {
  return {
    approvedPath: join(process.cwd(), "server", "data", "datacenters.json"),
    pendingPath: join(process.cwd(), "server", "data", "datacenters-pending.json"),
  };
}

export function loadApproved(p: IngesterPaths = defaultPaths()): ApprovedDatacenter[] {
  try {
    if (!existsSync(p.approvedPath)) return [];
    return JSON.parse(readFileSync(p.approvedPath, "utf-8"));
  } catch {
    return [];
  }
}

export function savePending(list: PendingDatacenter[], p: IngesterPaths = defaultPaths()): void {
  writeFileSync(p.pendingPath, JSON.stringify(list, null, 2) + "\n", "utf-8");
}

export function loadPending(p: IngesterPaths = defaultPaths()): PendingDatacenter[] {
  try {
    if (!existsSync(p.pendingPath)) return [];
    return JSON.parse(readFileSync(p.pendingPath, "utf-8"));
  } catch {
    return [];
  }
}

export type IngestRunResult = {
  scanned: number;
  matched: number;
  added: number;
  skippedDuplicate: number;
};

export async function runDatacenterIngestion(
  paths: IngesterPaths = defaultPaths(),
  feedFetcher: (url: string) => Promise<{ items: Array<{ title?: string; content?: string; contentSnippet?: string; link?: string; isoDate?: string; pubDate?: string }> }> = defaultFeedFetcher,
): Promise<IngestRunResult> {
  const approved = loadApproved(paths);
  const pending = loadPending(paths);
  const cityCoords = buildCityCoords(approved);

  let scanned = 0;
  let matched = 0;
  let added = 0;
  let skippedDuplicate = 0;

  const nextPending = [...pending];
  const nextId = () => {
    const maxApproved = approved.reduce((m, d) => Math.max(m, d.id), 0);
    const maxPending = nextPending.reduce((m, d) => Math.max(m, d.id), 0);
    return Math.max(maxApproved, maxPending) + 1;
  };

  for (const feed of INGEST_FEEDS) {
    let parsed;
    try {
      parsed = await feedFetcher(feed.url);
    } catch {
      continue;
    }
    for (const item of parsed.items ?? []) {
      scanned++;
      const title = (item.title ?? "").trim();
      const desc = (item.contentSnippet ?? item.content ?? "").trim();
      if (!title) continue;
      const candidate = parseFeedItem(title, desc, cityCoords);
      if (!candidate) continue;
      matched++;

      const name = `${candidate.company} ${candidate.city} (${title.slice(0, 40).replace(/[^\w\s\-]/g, "").trim()})`;
      const proposed = {
        name,
        company: candidate.company,
        city: candidate.city,
        state: candidate.state,
        lat: candidate.lat,
        lng: candidate.lng,
      };

      if (dedupeAgainst(proposed, approved, nextPending)) {
        skippedDuplicate++;
        continue;
      }

      const entry: PendingDatacenter = {
        id: nextId(),
        name,
        company: candidate.company,
        city: candidate.city,
        state: candidate.state,
        lat: candidate.lat,
        lng: candidate.lng,
        powerMW: candidate.powerMW,
        status: "announced",
        annualMWh: Math.round(candidate.powerMW * 8760 * 0.85),
        gridOperator: "Unknown",
        openDate: "TBD",
        sourceUrl: item.link ?? "",
        sourceTitle: title,
        sourceName: feed.sourceName,
        discoveredAt: new Date().toISOString(),
        approxCoords: candidate.approxCoords,
      };
      nextPending.push(entry);
      added++;
    }
  }

  if (added > 0) savePending(nextPending, paths);
  return { scanned, matched, added, skippedDuplicate };
}

async function defaultFeedFetcher(url: string) {
  const parser = new RSSParser({ timeout: 8000 });
  const feed = await parser.parseURL(url);
  return { items: (feed.items ?? []) as any[] };
}

let scheduleTimer: NodeJS.Timeout | null = null;

export function startDatacenterIngesterSchedule(intervalMs = 6 * 60 * 60 * 1000): void {
  if (scheduleTimer) return;
  if (process.env.NODE_ENV === "test") return;
  if (process.env.DISABLE_DATACENTER_INGESTER === "1") return;

  // Initial run delayed so it does not block server startup
  setTimeout(() => {
    runDatacenterIngestion()
      .then((r) => console.log(`[datacenter-ingester] initial run: ${JSON.stringify(r)}`))
      .catch((e) => console.error("[datacenter-ingester] initial run error:", e));
  }, 60_000);

  scheduleTimer = setInterval(() => {
    runDatacenterIngestion()
      .then((r) => console.log(`[datacenter-ingester] run: ${JSON.stringify(r)}`))
      .catch((e) => console.error("[datacenter-ingester] run error:", e));
  }, intervalMs);
}

export function stopDatacenterIngesterSchedule(): void {
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
}

export function approvePending(
  id: number,
  paths: IngesterPaths = defaultPaths(),
): { ok: true; approved: ApprovedDatacenter } | { ok: false; error: string } {
  const pending = loadPending(paths);
  const approved = loadApproved(paths);
  const idx = pending.findIndex((d) => d.id === id);
  if (idx === -1) return { ok: false, error: "Pending entry not found" };
  const p = pending[idx];

  if (dedupeAgainst(p, approved, [])) {
    pending.splice(idx, 1);
    savePending(pending, paths);
    return { ok: false, error: "Already exists in approved list; removed from pending" };
  }

  const nextId = approved.reduce((m, d) => Math.max(m, d.id), 0) + 1;
  const newEntry: ApprovedDatacenter = {
    id: nextId,
    name: p.name,
    company: p.company,
    city: p.city,
    state: p.state,
    lat: p.lat,
    lng: p.lng,
    powerMW: p.powerMW,
    status: p.status,
    annualMWh: p.annualMWh,
    gridOperator: p.gridOperator,
    openDate: p.openDate,
  };
  approved.push(newEntry);
  writeFileSync(paths.approvedPath, JSON.stringify(approved, null, 2) + "\n", "utf-8");
  pending.splice(idx, 1);
  savePending(pending, paths);
  return { ok: true, approved: newEntry };
}

export function rejectPending(id: number, paths: IngesterPaths = defaultPaths()): boolean {
  const pending = loadPending(paths);
  const next = pending.filter((d) => d.id !== id);
  if (next.length === pending.length) return false;
  savePending(next, paths);
  return true;
}
