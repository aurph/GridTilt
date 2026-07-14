// ─── Real uranium correlation ───────────────────────────────────────────────
//
// Replaces the last fabricated dataset in the app: the CCJ/CEG "correlation"
// scatter was Math.random dots generated around a TARGET r (0.82) on every
// request. This module computes the real thing from real weekly closes:
//
//   uranium proxy: SRUUF (Sprott Physical Uranium Trust - a fund holding
//   physical U3O8; the closest tradeable, freely-quotable spot proxy)
//   vs CCJ (pure miner) and CEG (nuclear utility), 52 weeks, weekly closes.
//
// Pure alignment + Pearson math here (unit tested); the fetch is injected.
// Honest degradation: any failure yields null - the client renders an
// unavailable state, never invented dots.

export interface WeeklyPoint {
  t: number; // week timestamp (ms)
  close: number;
}

export interface CorrelationPayload {
  /** paired weekly closes for the scatter */
  ccjPairs: Array<{ uranium: number; ccj: number }>;
  cegPairs: Array<{ uranium: number; ceg: number }>;
  ccjR: number | null;
  cegR: number | null;
  weeks: number;
  proxyTicker: string;
  asOf: string; // ISO date of computation
}

/** Pearson correlation; null when undefined (n < 3 or zero variance). */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  return num / Math.sqrt(dx2 * dy2);
}

const WEEK_MS = 7 * 86_400_000;

/**
 * Align two weekly series by week bucket (timestamps within the same
 * calendar week pair up). Only weeks present in BOTH series survive -
 * missing weeks are dropped, never interpolated.
 */
export function alignWeekly(a: WeeklyPoint[], b: WeeklyPoint[]): Array<{ a: number; b: number; t: number }> {
  const bucket = (t: number) => Math.floor(t / WEEK_MS);
  const bByWeek = new Map<number, number>();
  for (const p of b ?? []) {
    if (typeof p.close === "number" && Number.isFinite(p.close)) bByWeek.set(bucket(p.t), p.close);
  }
  const out: Array<{ a: number; b: number; t: number }> = [];
  for (const p of a ?? []) {
    if (!(typeof p.close === "number" && Number.isFinite(p.close))) continue;
    const match = bByWeek.get(bucket(p.t));
    if (match !== undefined) out.push({ a: p.close, b: match, t: p.t });
  }
  return out.sort((x, y) => x.t - y.t);
}

export function buildCorrelationPayload(
  proxy: WeeklyPoint[],
  ccj: WeeklyPoint[],
  ceg: WeeklyPoint[],
  proxyTicker: string,
  asOf: string,
): CorrelationPayload | null {
  const ccjAligned = alignWeekly(proxy, ccj);
  const cegAligned = alignWeekly(proxy, ceg);
  // A real 1y weekly overlap should be ~50 weeks; below 20 the scatter and r
  // are too thin to present as a 52-week relationship.
  if (ccjAligned.length < 20) return null;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    ccjPairs: ccjAligned.map((p) => ({ uranium: round2(p.a), ccj: round2(p.b) })),
    cegPairs: cegAligned.map((p) => ({ uranium: round2(p.a), ceg: round2(p.b) })),
    ccjR: pearson(ccjAligned.map((p) => p.a), ccjAligned.map((p) => p.b)),
    cegR: cegAligned.length >= 20 ? pearson(cegAligned.map((p) => p.a), cegAligned.map((p) => p.b)) : null,
    weeks: ccjAligned.length,
    proxyTicker,
    asOf,
  };
}

// ─── Cached fetcher (thin I/O, injected chart fn) ───────────────────────────

export type WeeklyChartFetch = (ticker: string) => Promise<WeeklyPoint[]>;

const PROXY_TICKER = "SRUUF";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // weekly data; daily refresh is plenty

let cache: { payload: CorrelationPayload | null; at: number } | null = null;

export function clearCorrelationCache(): void {
  cache = null;
}

export async function getUraniumCorrelation(fetchWeekly: WeeklyChartFetch): Promise<CorrelationPayload | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.payload;
  try {
    const [proxy, ccj, ceg] = await Promise.all([
      fetchWeekly(PROXY_TICKER),
      fetchWeekly("CCJ"),
      fetchWeekly("CEG"),
    ]);
    const payload = buildCorrelationPayload(proxy, ccj, ceg, PROXY_TICKER, new Date(now).toISOString());
    cache = { payload, at: now };
    return payload;
  } catch (e) {
    console.error("uranium correlation fetch failed:", e);
    // Cache the failure briefly so a Yahoo outage doesn't hammer retries,
    // but retry sooner than a success would.
    cache = { payload: null, at: now - CACHE_TTL_MS + 30 * 60 * 1000 };
    return null;
  }
}
