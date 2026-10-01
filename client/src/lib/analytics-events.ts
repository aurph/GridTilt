/**
 * The one place an analytics payload is built. GoatCounter records a path
 * (an event name for events) and a title; it has no event properties and no
 * identified cross-day users, so bounded context is encoded into the name.
 * Every value is checked against an allowlist or a strict format, and a
 * payload that fails any check is not sent at all: no raw query strings,
 * searches, typed tickers or basket contents, emails or tokens.
 */

export type EventName = "state_selected" | "state_context_ready" | "project_opened" | "source_opened";

const STATE = /^[A-Z]{2}$/;
const ENTITY = /^[a-z0-9][a-z0-9-]{0,79}$/;
const FIELD = /^[a-zA-Z]{1,30}$/;
const DOMAIN = /^[a-z0-9.-]{1,60}$/;
const PARAM_VALUE = /^[a-z0-9-]{1,20}$/;
const PATH = /^\/[A-Za-z0-9/._-]{0,120}$/;
const CAMPAIGN_VALUE = /^[A-Za-z0-9_-]{1,40}$/;

export const SURFACES = ["header", "chooser", "search", "map", "my-grid", "internal", "direct"] as const;
export type Surface = (typeof SURFACES)[number];
const STATUSES = ["operational", "construction", "announced"] as const;

/** Query parameters worth keeping on a page view, in a fixed order. */
const KEPT_PARAMS = ["tab", "view", "state"] as const;
const CAMPAIGN_PARAMS = ["utm_source", "utm_medium", "utm_campaign"] as const;

function paramsOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/**
 * The page-view path: the route plus the allowlisted parameters, or null for a
 * path that should not be counted (admin, or anything outside the safe format).
 */
export function pagePath(pathname: string, search = ""): string | null {
  if (!PATH.test(pathname) || pathname.startsWith("/admin")) return null;
  const params = paramsOf(search);
  const kept: string[] = [];
  for (const k of KEPT_PARAMS) {
    const v = params.get(k);
    if (v === null) continue;
    const ok = k === "state" ? STATE.test(v) : PARAM_VALUE.test(v);
    if (ok) kept.push(`${k}=${v}`);
  }
  return kept.length ? `${pathname}?${kept.join("&")}` : pathname;
}

/** Campaign tags for GoatCounter's `q` parameter; anything malformed is dropped. */
export function campaignQuery(search = ""): string | null {
  const params = paramsOf(search);
  const kept = CAMPAIGN_PARAMS.map((k) => [k, params.get(k)] as const).filter(
    ([, v]) => v !== null && CAMPAIGN_VALUE.test(v),
  );
  return kept.length ? kept.map(([k, v]) => `${k}=${v}`).join("&") : null;
}

export function recordBucket(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n <= 3) return "1_3";
  if (n <= 10) return "4_10";
  return "11plus";
}

export function ageBucket(days: number | null): string {
  if (days === null || !Number.isFinite(days) || days < 0) return "unknown";
  if (days < 7) return "lt7d";
  if (days < 30) return "lt30d";
  if (days < 90) return "lt90d";
  return "90dplus";
}

/** Host of a link, without "www.", or null when it is not an http(s) URL. */
export function sourceDomain(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return DOMAIN.test(host) ? host : null;
  } catch {
    return null;
  }
}

export type EventContext =
  | { name: "state_selected"; state: string; surface: Surface }
  | { name: "state_context_ready"; state: string; ratesAvailable: boolean; records: number; dataAgeDays: number | null }
  | { name: "project_opened"; entity: string; state: string; status: string; surface: Surface }
  | { name: "source_opened"; entity: string; claim: string; url: string };

const isSurface = (s: string): s is Surface => (SURFACES as readonly string[]).includes(s);

/** The event name GoatCounter will record, or null when any part fails its check. */
export function eventPath(ctx: EventContext): string | null {
  switch (ctx.name) {
    case "state_selected":
      if (!STATE.test(ctx.state) || !isSurface(ctx.surface)) return null;
      return `state_selected-${ctx.state}-${ctx.surface}`;
    case "state_context_ready":
      if (!STATE.test(ctx.state)) return null;
      return `state_context_ready-${ctx.state}-rates_${ctx.ratesAvailable ? "yes" : "no"}-records_${recordBucket(ctx.records)}-age_${ageBucket(ctx.dataAgeDays)}`;
    case "project_opened":
      if (!ENTITY.test(ctx.entity) || !STATE.test(ctx.state) || !isSurface(ctx.surface)) return null;
      if (!(STATUSES as readonly string[]).includes(ctx.status)) return null;
      return `project_opened-${ctx.entity}-${ctx.state}-${ctx.status}-${ctx.surface}`;
    case "source_opened": {
      const domain = sourceDomain(ctx.url);
      if (!ENTITY.test(ctx.entity) || !FIELD.test(ctx.claim) || !domain) return null;
      return `source_opened-${ctx.entity}-${ctx.claim.toLowerCase()}-${domain}`;
    }
  }
}

/**
 * What makes an event "the same" within one page view. state_context_ready
 * counts once per state: a background refetch that moves a bucket (a new
 * facility, a newer rate month) is not another reader reaching context.
 */
export function eventDedupeKey(ctx: EventContext, path: string): string {
  return ctx.name === "state_context_ready" ? `state_context_ready-${ctx.state}` : path;
}

/** Only the production site counts; local, preview, test and automated browsers never do. */
export function trafficAllowed(opts: { hostname: string; allowedHosts: string[]; webdriver?: boolean }): boolean {
  if (opts.webdriver) return false;
  return opts.allowedHosts.includes(opts.hostname.toLowerCase());
}

/**
 * Remembers what was sent in the current page view, so a re-render does not
 * count as another task. Reset on navigation.
 */
export function createDeduper(): { first: (key: string) => boolean; reset: () => void } {
  let seen = new Set<string>();
  return {
    first: (key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    reset: () => {
      seen = new Set();
    },
  };
}
