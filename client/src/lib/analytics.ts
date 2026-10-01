/**
 * Privacy-respecting analytics via GoatCounter: no cookies, no cross-site
 * tracking, no personal data. Entirely inert until VITE_GOATCOUNTER_CODE is
 * set at build time (the goatcounter.com site code), so development and forks
 * send nothing.
 *
 * Transport: GoatCounter's documented /count endpoint as a 1x1 image request.
 * The site used to load count.js from gc.zgo.at, which production's CSP
 * (script-src 'self') blocks, so nothing could have been counted there. An
 * image request needs only img-src https:, which the CSP already allows.
 *
 * What is sent is built in analytics-events.ts: five events with bounded,
 * allowlisted context, only on the production host, never from automated
 * browsers or admin pages. A failure here never touches the page.
 */
import {
  campaignQuery,
  createDeduper,
  eventDedupeKey,
  eventPath,
  pagePath,
  trafficAllowed,
  type EventContext,
} from "./analytics-events";

const RAW_CODE: string | undefined = import.meta.env.VITE_GOATCOUNTER_CODE;
/** GoatCounter site codes are short slugs; anything else would build a bad hostname. */
const CODE = RAW_CODE && /^[a-z0-9-]{1,40}$/.test(RAW_CODE) ? RAW_CODE : undefined;
/** Hosts that count. A staging build can list its own host (and should use its own site code). */
const ALLOWED_HOSTS = (import.meta.env.VITE_GOATCOUNTER_HOSTS ?? "gridtilt.com,www.gridtilt.com")
  .split(",")
  .map((h: string) => h.trim().toLowerCase())
  .filter(Boolean);

const events = createDeduper();
let lastPage: string | null = null;
/** The page before the current one, for an event's entry surface. */
let priorPage: string | null = null;

function enabled(): boolean {
  if (!CODE || typeof window === "undefined") return false;
  try {
    return trafficAllowed({ hostname: window.location.hostname, allowedHosts: ALLOWED_HOSTS, webdriver: navigator.webdriver });
  } catch {
    return false;
  }
}

function send(params: Record<string, string>): void {
  try {
    const url = new URL(`https://${CODE}.goatcounter.com/count`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("rnd", Math.random().toString(36).slice(2, 10));
    const img = new Image();
    img.src = url.toString();
  } catch {
    /* analytics must never break the page */
  }
}

/** Kept for App.tsx; there is no script to load any more. */
export function initAnalytics(): void {}

/** One page view per completed navigation; the same path twice in a row is one view. */
export function trackPageview(pathname: string, search = typeof window !== "undefined" ? window.location.search : ""): void {
  if (!enabled()) return;
  const p = pagePath(pathname, search);
  if (!p || p === lastPage) return;
  priorPage = lastPage;
  lastPage = p;
  events.reset();
  const params: Record<string, string> = { p };
  const q = campaignQuery(search);
  if (q) params.q = q;
  // Only another site's origin, never a full referring URL (which can carry tokens).
  try {
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.hostname !== window.location.hostname) params.r = ref.origin;
    }
  } catch {
    /* no referrer */
  }
  send(params);
}

/** One of the four task events, sent at most once per page view. */
export function trackEvent(ctx: EventContext): void {
  if (!enabled()) return;
  const p = eventPath(ctx);
  if (!p || !events.first(eventDedupeKey(ctx, p))) return;
  send({ p, e: "true" });
}

/** The page the reader was on before this one, or null when they arrived here directly. */
export function previousPage(): string | null {
  return priorPage;
}
