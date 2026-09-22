import RSSParser from "rss-parser";

// ─── State grid news ─────────────────────────────────────────────────────
//
// My Grid is built on the facility registry, and the registry floor is
// 400 MW. Around forty states have no tracked campus, so for most readers
// the page had nothing on it that was actually about their state. This
// module is the layer that is true everywhere.
//
// Source is Google News RSS, one query per state, no key. That matters for
// two reasons beyond cost: the alternatives for state legislative data all
// need a key (OpenStates v3) or are unusable (the OpenStates bulk dump is
// 10 GB of Postgres and a month stale), and grid legislation is reported as
// news anyway. A well-scoped state query surfaces the moratorium, the rate
// case and the bill in the week they happen.
//
// This module never writes to server/data. It is a read-through cache, so a
// bad match shows one wrong headline for an hour rather than corrupting a
// curated file the way a mis-tuned scanner regex would.

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, same as /api/news
const FEED_TIMEOUT_MS = 5000;
const MAX_ITEMS = 12;

/**
 * Query window. Google News accepts `when:` as a search operator; 14 days
 * keeps a quiet state from showing an empty card while still reading as
 * current.
 */
const WINDOW = "when:14d";

/**
 * Grid terms, used twice: to scope the search and to score what comes back.
 *
 * Both regulator spellings are included because states split between
 * "Public Service Commission" and "Public Utility Commission", and naming
 * the body is what pulls in rate cases and dockets rather than only
 * construction stories.
 */
const QUERY_TERMS = [
  "grid",
  "utility",
  '"data center"',
  "electricity",
  '"power plant"',
  '"Public Service Commission"',
  '"Public Utility Commission"',
];

/**
 * A headline must contain one of these to survive. Google honors the query
 * loosely: a search scoped to Virginia returned "September Releases -
 * Governor of Virginia", a generic press index with no grid content. The
 * filter errs toward dropping, because a thin card of real stories beats a
 * full one of noise.
 */
const RELEVANT = [
  "grid", "utility", "utilities", "data center", "datacenter", "electric",
  "electricity", "power plant", "powerplant", "megawatt", "gigawatt", "nuclear",
  "solar", "wind farm", "transmission", "substation", "interconnection",
  "rate case", "rate hike", "rate increase", "ratepayer", "public service commission",
  "public utility commission", "puc", "psc", "energy bill", "power bill",
  "moratorium", "kilowatt", "outage", "peak demand", "capacity market",
];

export interface StateNewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
}

export interface StateNewsPayload {
  state: string;
  stateName: string;
  items: StateNewsItem[];
  asOf: string;
  source: string;
  sourceUrl: string;
}

/**
 * State names, server-side on purpose. client/src/data/state-grid.ts holds
 * the same names, but nothing is shared between client and server in this
 * project, so the table is re-declared here rather than imported across
 * that boundary.
 */
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** Exported for tests: the search URL for a state, or null if unknown. */
export function stateNewsUrl(stateCode: string): string | null {
  const name = STATE_NAMES[stateCode?.toUpperCase?.() ?? ""];
  if (!name) return null;
  const query = `"${name}" (${QUERY_TERMS.join(" OR ")}) ${WINDOW}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

/** Exported for tests: does this headline carry any grid signal at all? */
export function isStateNewsRelevant(text: string): boolean {
  const haystack = text.toLowerCase();
  return RELEVANT.some((term) => haystack.includes(term));
}

/**
 * State names longest-first, so "West Virginia" is consumed before the
 * "Virginia" inside it can match, and likewise New/North/South/Rhode pairs.
 */
const NAMES_LONGEST_FIRST = Object.values(STATE_NAMES).sort((a, b) => b.length - a.length);

/**
 * Exported for tests: which states a headline actually names.
 *
 * Matched spans are blanked as they are found, so a longer name cannot be
 * double counted by the shorter one nested inside it. "Washington" is
 * skipped when it is really Washington DC, which is how most federal policy
 * headlines read and would otherwise be filed under Washington state.
 */
export function statesMentioned(text: string): string[] {
  let haystack = ` ${text} `;
  haystack = haystack.replace(/Washington,?\s*,?\s*D\.?\s*C\.?/gi, " ");
  const found: string[] = [];
  for (const name of NAMES_LONGEST_FIRST) {
    const pattern = new RegExp(`(^|[^A-Za-z])${name}([^A-Za-z]|$)`, "i");
    if (pattern.test(haystack)) {
      found.push(name);
      haystack = haystack.replace(new RegExp(name, "gi"), " ");
    }
  }
  return found;
}

/**
 * Exported for tests: is this story plausibly about the reader's state?
 *
 * Google honors a scoped query loosely and pads with national stories once
 * a small state runs out of local ones. Vermont's live feed returned a
 * story about utility bills in Arizona. The rule that fixes it without
 * throwing away good local coverage: reject a headline that names a
 * different state and not this one. A headline naming no state at all is
 * kept, because the genuinely local ones often read "Baltimore County
 * Council ..." or "City of Torrington ..." and never say the state.
 */
export function isPlausiblyLocal(headline: string, stateName: string): boolean {
  const mentioned = statesMentioned(headline);
  if (mentioned.length === 0) return true;
  return mentioned.includes(stateName);
}

/**
 * Google News titles arrive as "Headline - Publisher". The publisher is not
 * given as a separate field, so it is split off the end rather than
 * invented; when there is no separator the source falls back to the feed.
 */
export function splitHeadlineSource(title: string): { headline: string; source: string | null } {
  const at = title.lastIndexOf(" - ");
  if (at <= 0 || at >= title.length - 3) return { headline: title.trim(), source: null };
  return { headline: title.slice(0, at).trim(), source: title.slice(at + 3).trim() };
}

/** The shape this module needs from a feed entry; rss-parser returns more. */
export interface RawFeedItem {
  title?: string;
  link?: string;
  guid?: string;
  isoDate?: string;
  pubDate?: string;
}

/**
 * Exported for tests: filter, dedupe, sort and cap. All the judgement in
 * this module lives here, so it is kept pure and driven from fixtures
 * rather than the network.
 */
export function buildStateNewsItems(
  raw: RawFeedItem[],
  stateName: string,
  now = Date.now(),
): StateNewsItem[] {
  const seen = new Set<string>();
  const items: Array<StateNewsItem & { namesState: boolean }> = [];

  for (const item of raw ?? []) {
    const rawTitle = (item.title ?? "").trim();
    if (!rawTitle) continue;
    const { headline, source } = splitHeadlineSource(rawTitle);
    // Score the headline only. Google News descriptions are boilerplate
    // markup naming the publisher, not the story.
    if (!isStateNewsRelevant(headline)) continue;
    if (!isPlausiblyLocal(headline, stateName)) continue;
    const key = headline.slice(0, 60).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      headline,
      source: source ?? "Google News",
      url: item.link ?? item.guid ?? "#",
      publishedAt: item.isoDate ?? item.pubDate ?? new Date(now).toISOString(),
      namesState: statesMentioned(headline).includes(stateName),
    });
  }

  // Headlines that name the state lead, because in a thin state the rest is
  // regional or national coverage that merely survived the filter. Recency
  // orders within each tier.
  items.sort((a, b) => {
    if (a.namesState !== b.namesState) return a.namesState ? -1 : 1;
    const at = new Date(a.publishedAt).getTime();
    const bt = new Date(b.publishedAt).getTime();
    if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
    if (Number.isNaN(at)) return 1; // undated sinks rather than leading
    if (Number.isNaN(bt)) return -1;
    return bt - at;
  });

  return items.slice(0, MAX_ITEMS).map(({ namesState: _drop, ...item }) => item);
}

const cache = new Map<string, { at: number; payload: StateNewsPayload }>();

/** Test seam: the module-level cache would otherwise leak between cases. */
export function clearStateNewsCache(): void {
  cache.clear();
}

export async function getStateNews(stateCode: string): Promise<StateNewsPayload | null> {
  const code = stateCode?.toUpperCase?.() ?? "";
  const stateName = STATE_NAMES[code];
  if (!stateName) return null;

  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.payload;

  const url = stateNewsUrl(code)!;
  const parser = new RSSParser({ timeout: FEED_TIMEOUT_MS });
  const feed = await parser.parseURL(url);

  const payload: StateNewsPayload = {
    state: code,
    stateName,
    items: buildStateNewsItems((feed.items ?? []) as RawFeedItem[], stateName),
    asOf: new Date().toISOString(),
    source: "Google News",
    sourceUrl: "https://news.google.com/",
  };
  cache.set(code, { at: Date.now(), payload });
  return payload;
}
