// ─── GPU rental price index (pure) ───────────────────────────────────────
//
// The deterministic math behind Neocloud Intel: per-model on-demand rental
// prices, marketplace ranges, and period changes (1W/1M/YTD/1Y) computed from
// real sourced anchor points plus the daily-recorded series. Same discipline
// as server/clusters.ts and server/indices.ts: a pure function from rows to
// displayed numbers, unit-tested, with a thin route wrapper.
//
// Integrity rule: a period change is computed ONLY when the series has a real
// data point near the lookback date. Windows with no nearby point read null
// rather than an invented number. The chart plots the real points only; it
// fills in as the recorder appends consistent daily snapshots over time.

export interface GpuHistoryAnchor {
  date: string; // "YYYY-MM" (treated as mid-month) or "YYYY-MM-DD"
  price: number;
}

export interface GpuPriceLite {
  model: string;
  vendor: string;
  currentUsdPerHr: number;
  low: number;
  high: number;
  architecture?: string;
  vramGB?: number;
  vramType?: string;
  launchYear?: number;
  confidence?: string;
  oneYearTrend?: string;
  sources?: string[];
  historyAnchors?: GpuHistoryAnchor[];
  estimated?: string[];
}

export interface GpuChanges {
  w1: number | null;
  m1: number | null;
  ytd: number | null;
  y1: number | null;
}

export interface GpuRow {
  model: string;
  vendor: string;
  architecture: string | null;
  vramGB: number | null;
  vramType: string | null;
  launchYear: number | null;
  confidence: string | null;
  oneYearTrend: string | null;
  sources: string[];
  current: number;
  low: number;
  high: number;
  estimated: string[];
  changes: GpuChanges;
  series: GpuHistoryAnchor[]; // merged anchors + recorded, oldest first
}

export interface GpuMetrics {
  asOf: string;
  modelCount: number;
  rows: GpuRow[]; // sorted by current price desc
  fleetAvg: number; // mean current across models
  fleetAvg1yChange: number | null; // mean of the available 1Y changes
}

const DAY = 86_400_000;

/** Parse "YYYY-MM" (mid-month) or "YYYY-MM-DD" to a UTC timestamp. */
function toMs(d: string): number {
  const parts = d.split("-").map((x) => parseInt(x, 10));
  const [y, m, day] = [parts[0], parts[1] ?? 1, parts[2] ?? 15];
  return Date.UTC(y, m - 1, day);
}

function round(n: number, dp: number): number {
  return parseFloat(n.toFixed(dp));
}

/** Pct change of `current` vs the series point nearest `targetMs`, but only if
 *  a point falls within `tolDays`; otherwise null. */
function changeVs(
  series: Array<{ ms: number; price: number }>,
  current: number,
  targetMs: number,
  tolDays: number,
): number | null {
  let best: { ms: number; price: number } | null = null;
  for (const p of series) {
    if (best === null || Math.abs(p.ms - targetMs) < Math.abs(best.ms - targetMs)) best = p;
  }
  if (!best || Math.abs(best.ms - targetMs) > tolDays * DAY || best.price <= 0) return null;
  return round(((current - best.price) / best.price) * 100, 1);
}

export function computeGpuIndex(
  models: GpuPriceLite[],
  asOf: string,
  recorded?: Record<string, GpuHistoryAnchor[]>,
): GpuMetrics {
  const asOfMs = toMs(asOf);
  const asOfYear = new Date(asOfMs).getUTCFullYear();
  const yearStartMs = Date.UTC(asOfYear, 0, 1);

  const rows: GpuRow[] = models.map((g) => {
    // Merge anchors + recorded points, dedupe by date (recorded wins), sort old->new.
    const byDate = new Map<string, number>();
    for (const a of g.historyAnchors ?? []) byDate.set(a.date, a.price);
    for (const r of recorded?.[g.model] ?? []) byDate.set(r.date, r.price);
    const series = Array.from(byDate.entries())
      .map(([date, price]) => ({ date, price }))
      .sort((a, b) => toMs(a.date) - toMs(b.date));
    const pts = series.map((p) => ({ ms: toMs(p.date), price: p.price }));

    const changes: GpuChanges = {
      w1: changeVs(pts, g.currentUsdPerHr, asOfMs - 7 * DAY, 4),
      m1: changeVs(pts, g.currentUsdPerHr, asOfMs - 30 * DAY, 12),
      ytd: changeVs(pts, g.currentUsdPerHr, yearStartMs, 45),
      y1: changeVs(pts, g.currentUsdPerHr, asOfMs - 365 * DAY, 75),
    };

    return {
      model: g.model,
      vendor: g.vendor,
      architecture: g.architecture ?? null,
      vramGB: g.vramGB ?? null,
      vramType: g.vramType ?? null,
      launchYear: g.launchYear ?? null,
      confidence: g.confidence ?? null,
      oneYearTrend: g.oneYearTrend ?? null,
      sources: g.sources ?? [],
      current: g.currentUsdPerHr,
      low: g.low,
      high: g.high,
      estimated: g.estimated ?? [],
      changes,
      series,
    };
  });

  rows.sort((a, b) => b.current - a.current || a.model.localeCompare(b.model));

  const fleetAvg = rows.length ? round(rows.reduce((s, r) => s + r.current, 0) / rows.length, 2) : 0;
  const y1s = rows.map((r) => r.changes.y1).filter((v): v is number => v !== null);
  const fleetAvg1yChange = y1s.length ? round(y1s.reduce((a, b) => a + b, 0) / y1s.length, 1) : null;

  return { asOf, modelCount: rows.length, rows, fleetAvg, fleetAvg1yChange };
}
