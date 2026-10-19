// ─── Post-deploy smoke checks ───────────────────────────────────────────────
//
// Checks of a running GridTilt using GET requests only: nothing is sent,
// posted or submitted. Like any visitor, a GET of /api/kpis may let the site's
// own daily index recorder append its point (that is its design). Run after
// each Replit redeploy:
//
//   npm run smoke -- https://gridtilt.com
//
// FAIL means the deploy is wrong (a page or API is broken, or a compliance
// switch is on). WARN means it works but needs attention (stale data, a
// missing optional key, a slow response). The CLI exits 1 on any FAIL.

export type Level = "pass" | "warn" | "fail";

export interface CheckResult {
  name: string;
  level: Level;
  detail: string;
  ms: number;
}

export interface SmokeOptions {
  /** Base URL without a trailing slash. */
  base: string;
  /** Today as YYYY-MM-DD (Eastern), for staleness. */
  today: string;
  /** Written permission from the GPU price providers is on file. */
  gpuDataPermitted?: boolean;
  /** Admin key; admin checks run only when set. */
  adminKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface Got {
  status: number;
  type: string;
  text: string;
  ms: number;
  json?: any;
}

const SLOW_MS = 3000;
/** A curated dataset older than this many days earns a warning. */
export const STALE_DAYS = 45;

export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

async function get(o: SmokeOptions, path: string, headers: Record<string, string> = {}): Promise<Got> {
  const f = o.fetchFn ?? fetch;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), o.timeoutMs ?? 25_000);
  const t0 = Date.now();
  try {
    const res = await f(`${o.base}${path}`, { headers, signal: c.signal, redirect: "manual" });
    const type = res.headers.get("content-type") ?? "";
    const isText = /json|html|xml|text/.test(type);
    const text = isText ? await res.text() : (await res.arrayBuffer(), "");
    let json: any;
    if (type.includes("json")) {
      try {
        json = JSON.parse(text);
      } catch {}
    }
    return { status: res.status, type, text, ms: Date.now() - t0, json };
  } finally {
    clearTimeout(t);
  }
}

type Verdict = { level: Level; detail: string };
type Check = { name: string; path: string; headers?: (o: SmokeOptions) => Record<string, string> | null; judge: (g: Got, o: SmokeOptions) => Verdict };

const ok = (detail = ""): Verdict => ({ level: "pass", detail });
const warn = (detail: string): Verdict => ({ level: "warn", detail });
const fail = (detail: string): Verdict => ({ level: "fail", detail });

function page(path: string): Check {
  return {
    name: `page ${path}`,
    path,
    judge: (g) =>
      g.status !== 200 ? fail(`HTTP ${g.status}`)
      : !g.type.includes("text/html") ? fail(`content-type ${g.type}`)
      : !g.text.includes('id="root"') ? fail("no app root in the HTML")
      : /<meta name="robots"[^>]*noindex/.test(g.text) ? fail("page is marked noindex")
      : ok(),
  };
}

function jsonCheck(name: string, path: string, judge: (j: any, o: SmokeOptions) => Verdict): Check {
  return {
    name,
    path,
    judge: (g, o) =>
      g.status !== 200 ? fail(`HTTP ${g.status}`)
      : !g.type.includes("application/json") || g.json === undefined ? fail(`not JSON (${g.type || "no content-type"})`)
      : judge(g.json, o),
  };
}

/** A curated dataset's lastRefreshed: missing fails, old warns. */
function freshness(label: string, value: unknown, o: SmokeOptions): Verdict | null {
  if (typeof value !== "string") return fail(`${label}: no lastRefreshed`);
  const age = daysBetween(value, o.today);
  if (age === null) return fail(`${label}: unreadable date ${value}`);
  if (age > STALE_DAYS) return warn(`${label} last refreshed ${value} (${age} days)`);
  return null;
}

function keyedFeed(name: string, path: string): Check {
  return {
    name,
    path,
    judge: (g) =>
      g.status === 200 && g.json ? ok()
      : g.status === 503 && g.json?.configured === false ? warn("EIA_API_KEY is not set; the feed is off")
      : fail(`HTTP ${g.status}`),
  };
}

export const CHECKS: Check[] = [
  ...["/", "/overview", "/stack", "/supply-chain", "/power-map", "/compute-frontier", "/neocloud-intel", "/analyze", "/catalysts", "/timeline", "/blog", "/data-status"].map(page),
  {
    name: "state page /state/maryland",
    path: "/state/maryland",
    judge: (g) => (g.status !== 200 ? fail(`HTTP ${g.status}`) : g.text.includes('data-prerender="state-page"') ? ok() : fail("state facts not prerendered")),
  },
  {
    name: "unknown ticker is a real 404",
    path: "/stock/NOPE",
    judge: (g) => (g.status !== 404 ? fail(`HTTP ${g.status}, expected 404`) : /noindex/.test(g.text) ? ok() : fail("404 without noindex")),
  },
  {
    name: "unknown API path is a JSON 404",
    path: "/api/smoke-no-such-route",
    judge: (g) => (g.status === 404 && g.type.includes("json") ? ok() : fail(`HTTP ${g.status} ${g.type}`)),
  },
  jsonCheck("stock quotes", "/api/stack", (j) => {
    // Layer arrays hold ticker rows; the payload also carries a correlation series.
    const items = (Object.values(j ?? {}).filter(Array.isArray).flat() as any[]).filter((i) => typeof i?.ticker === "string");
    if (items.length < 50) return fail(`${items.length} tickers`);
    const stale = items.filter((i) => i?.stale === true || typeof i?.price !== "number").length;
    return stale > items.length * 0.2 ? warn(`${stale} of ${items.length} tickers on static fallback (Yahoo throttled?)`) : ok(`${items.length} tickers`);
  }),
  jsonCheck("market gauges", "/api/kpis", (j) => (j?.source === "live" ? ok() : j?.source ? warn(`source ${j.source}`) : fail("no source field"))),
  jsonCheck("clusters", "/api/clusters/metrics", (j, o) => (!(j?.clusterCount > 0) ? fail("no clusters") : freshness("clusters", j.lastRefreshed, o) ?? ok(`${j.clusterCount} clusters`))),
  jsonCheck("power deals", "/api/deals/metrics", (j, o) => (!(j?.rowCount > 0) ? fail("no deals") : freshness("deals", j.lastRefreshed, o) ?? ok(`${j.rowCount} agreements`))),
  jsonCheck("GPU price sweep stays off without permission", "/api/gpu-prices/metrics", (j, o) => {
    const enabled = j?.health?.sweepEnabled;
    if (typeof enabled !== "boolean") return fail("no sweepEnabled in health: this build predates the sweep switch (#53)");
    if (enabled && !o.gpuDataPermitted) return fail("GPU_LIVE_SWEEP_ENABLED is on but no provider permission is recorded");
    return ok(enabled ? "sweep on (permitted)" : "sweep off");
  }),
  jsonCheck("catalysts", "/api/catalysts/all", (j) => (Array.isArray(j?.items) && j.items.length > 0 ? ok(`${j.items.length} items`) : warn("no catalyst items (Yahoo earnings unavailable?)"))),
  jsonCheck("news", "/api/news", (j, o) => {
    if (!Array.isArray(j) || j.length === 0) return warn("no news items");
    const newest = j.map((i: any) => String(i?.publishedAt ?? "")).sort().pop() ?? "";
    const age = daysBetween(newest, o.today);
    return age === null || age > 2 ? warn(`newest item ${newest || "undated"}`) : ok(`${j.length} items`);
  }),
  jsonCheck("timeline", "/api/timeline", (j) => {
    const events = Array.isArray(j?.events) ? j.events : null;
    if (!events) return fail("no events array");
    if (!events.some((e: any) => e?.eventType === "power_deal")) return fail("no power deal events (announced dates missing?)");
    return ok(`${events.length} events`);
  }),
  jsonCheck("data status", "/api/data-status", (j) => {
    if (!Array.isArray(j?.datasets) || j.datasets.length === 0) return fail("no datasets");
    const behind = j.datasets.filter((d: any) => d?.status === "behind").map((d: any) => d.label);
    return behind.length ? warn(`${behind.length} behind schedule: ${behind.join(", ")}`) : ok(`${j.datasets.length} datasets`);
  }),
  jsonCheck("frontier models", "/api/frontier-models", (j) => (Array.isArray(j?.models) && j.models.length > 0 ? ok() : fail("no models"))),
  jsonCheck("Maryland state data", "/api/state-pages/maryland", (j) => (j?.code === "MD" ? ok() : fail("no MD payload"))),
  keyedFeed("retail electricity rates (EIA)", "/api/physical/retail-rates"),
  keyedFeed("hourly demand (EIA)", "/api/physical/load-hourly"),
  {
    name: "share card renders",
    path: "/api/og?template=state_fact&state=MD",
    judge: (g) => (g.status === 200 && g.type.includes("image/png") ? ok() : fail(`HTTP ${g.status} ${g.type}`)),
  },
  {
    name: "robots.txt",
    path: "/robots.txt",
    judge: (g) =>
      g.status !== 200 ? fail(`HTTP ${g.status}`)
      : !g.text.includes("Disallow: /api/") ? fail("API not disallowed by default")
      : /Allow: \/api\/(admin|newsletter|export)/.test(g.text) ? fail("a private API path is allowed")
      : !g.text.includes("Allow: /api/blog") ? fail("public data paths not allowed")
      : ok(),
  },
  {
    name: "sitemap.xml",
    path: "/sitemap.xml",
    judge: (g) => (g.status !== 200 ? fail(`HTTP ${g.status}`) : !g.text.includes("/state/maryland") ? fail("state page missing") : ok(`${(g.text.match(/<loc>/g) ?? []).length} URLs`)),
  },
  {
    name: "admin freshness report",
    path: "/api/admin/freshness",
    headers: (o) => (o.adminKey ? { "x-admin-key": o.adminKey } : null),
    judge: (g) => (g.status === 200 && g.json ? ok() : fail(`HTTP ${g.status}`)),
  },
];

export async function runSmoke(o: SmokeOptions, checks: Check[] = CHECKS): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  for (const c of checks) {
    let headers: Record<string, string> = {};
    if (c.headers) {
      const h = c.headers(o);
      if (!h) continue; // admin check without a key: skipped, not failed
      headers = h;
    }
    try {
      const g = await get(o, c.path, headers);
      let v = c.judge(g, o);
      if (v.level === "pass" && g.ms > SLOW_MS) v = warn(`slow: ${(g.ms / 1000).toFixed(1)}s${v.detail ? `; ${v.detail}` : ""}`);
      out.push({ name: c.name, level: v.level, detail: v.detail, ms: g.ms });
    } catch (e) {
      out.push({ name: c.name, level: "fail", detail: e instanceof Error ? e.message : String(e), ms: 0 });
    }
  }
  return out;
}

export function formatResults(results: CheckResult[]): string {
  const lines = results.map((r) => `${r.level.toUpperCase().padEnd(4)} ${r.name}${r.detail ? `: ${r.detail}` : ""} (${r.ms} ms)`);
  const n = (l: Level) => results.filter((r) => r.level === l).length;
  lines.push(`${n("pass")} pass, ${n("warn")} warn, ${n("fail")} fail`);
  return lines.join("\n");
}
