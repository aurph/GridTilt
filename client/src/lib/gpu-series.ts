/**
 * Pure data transforms for the Neocloud GPU price-history chart.
 * No React, no DOM: everything here is unit-testable (Lake 8 covers it).
 *
 * Data honesty model
 * ------------------
 * The API's per-model `series` mixes two kinds of points, distinguishable
 * by date format:
 *   - "YYYY-MM"    sourced history anchor (month granularity, blended est.)
 *   - "YYYY-MM-DD" recorded daily snapshot from the price recorder
 * Points render as dots (anchors solid, recorded small). The line BETWEEN
 * points is classified per span:
 *   - "observed"     consecutive recorded days (<= MAX_OBSERVED_GAP_DAYS apart)
 *   - "interpolated" anything else - drawn dashed at reduced opacity because
 *     the path between those points is synthetic, not price action.
 * Interpolation is linear only. No splines: monotone curves invent price
 * movement that never happened.
 */

export type PointKind = "anchor" | "recorded";
export type SpanQuality = "observed" | "interpolated";

export interface SeriesPointIn {
  date: string;
  price: number;
  low?: number;
  high?: number;
  sources?: string[];
  n?: number;
}

export interface ChartPoint {
  t: number; // UTC ms
  price: number;
  kind: PointKind;
  /** original date string, for tooltips */
  date: string;
  /** Observed marketplace spread and provenance. Recorded daily points only. */
  low?: number;
  high?: number;
  sources?: string[];
  n?: number;
}

export interface ChartSpan {
  quality: SpanQuality;
  points: ChartPoint[]; // >= 2 points, shares endpoints with neighbors
}

export interface ChartSeries {
  model: string;
  vendor: string;
  color: string;
  points: ChartPoint[];
  spans: ChartSpan[];
  /** first point = product launch/first tracked price */
  launch: ChartPoint | null;
  latest: ChartPoint | null;
}

export const RANGE_KEYS = ["1M", "3M", "6M", "1Y", "ALL"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

/** Consecutive recorded points at most this far apart count as observed. */
export const MAX_OBSERVED_GAP_DAYS = 2;

const DAY_MS = 86_400_000;

/** "YYYY-MM" -> anchor at month start; "YYYY-MM-DD" -> recorded day. Null on garbage. */
export function parsePointDate(date: string): { t: number; kind: PointKind } | null {
  const mMonth = /^(\d{4})-(\d{2})$/.exec(date);
  if (mMonth) {
    const t = Date.UTC(Number(mMonth[1]), Number(mMonth[2]) - 1, 1);
    return Number.isFinite(t) ? { t, kind: "anchor" } : null;
  }
  const mDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (mDay) {
    const t = Date.UTC(Number(mDay[1]), Number(mDay[2]) - 1, Number(mDay[3]));
    return Number.isFinite(t) ? { t, kind: "recorded" } : null;
  }
  return null;
}

/**
 * Points -> time-ordered, deduped (last write wins per timestamp), dropping
 * unparseable dates and non-positive prices (invalid on a log scale).
 */
export function buildPoints(series: SeriesPointIn[]): ChartPoint[] {
  const byT = new Map<number, ChartPoint>();
  for (const p of series ?? []) {
    if (typeof p?.price !== "number" || !Number.isFinite(p.price) || p.price <= 0) continue;
    const parsed = parsePointDate(p.date);
    if (!parsed) continue;
    const point: ChartPoint = { t: parsed.t, price: p.price, kind: parsed.kind, date: p.date };
    if (parsed.kind === "recorded") {
      const validSpread =
        typeof p.low === "number" && Number.isFinite(p.low) && p.low > 0 &&
        typeof p.high === "number" && Number.isFinite(p.high) && p.high >= p.low &&
        p.low <= p.price && p.price <= p.high;
      if (validSpread) {
        point.low = p.low;
        point.high = p.high;
      }
      if (Array.isArray(p.sources) && p.sources.length > 0 && p.sources.every((source) => typeof source === "string" && source.length > 0)) {
        point.sources = [...p.sources];
      }
      if (typeof p.n === "number" && Number.isInteger(p.n) && p.n > 0) point.n = p.n;
    }
    byT.set(parsed.t, point);
  }
  return Array.from(byT.values()).sort((a, b) => a.t - b.t);
}

/** Split a point run into quality spans (adjacent spans share an endpoint). */
export function buildSpans(points: ChartPoint[]): ChartSpan[] {
  if (points.length < 2) return [];
  const spans: ChartSpan[] = [];
  let cur: ChartSpan | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const observed =
      a.kind === "recorded" &&
      b.kind === "recorded" &&
      b.t - a.t <= MAX_OBSERVED_GAP_DAYS * DAY_MS;
    const quality: SpanQuality = observed ? "observed" : "interpolated";
    if (cur && cur.quality === quality) {
      cur.points.push(b);
    } else {
      cur = { quality, points: [a, b] };
      spans.push(cur);
    }
  }
  return spans;
}

export function buildSeries(
  rows: Array<{ model: string; vendor: string; series: SeriesPointIn[] }>,
  colorFor: (model: string) => string,
): ChartSeries[] {
  return rows.map((r) => {
    const points = buildPoints(r.series);
    return {
      model: r.model,
      vendor: r.vendor,
      color: colorFor(r.model),
      points,
      spans: buildSpans(points),
      launch: points[0] ?? null,
      latest: points[points.length - 1] ?? null,
    };
  });
}

function subtractUtcMonths(now: number, months: number): number {
  const d = new Date(now);
  const absoluteMonth = d.getUTCFullYear() * 12 + d.getUTCMonth() - months;
  const year = Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay));
}

export function rangeStart(range: RangeKey, now: number): number | null {
  switch (range) {
    case "1M":
      return subtractUtcMonths(now, 1);
    case "3M":
      return subtractUtcMonths(now, 3);
    case "6M":
      return subtractUtcMonths(now, 6);
    case "1Y":
      return subtractUtcMonths(now, 12);
    case "ALL":
      return null;
  }
}

export interface RangeCoverage {
  pointCount: number;
  enabled: boolean;
}

/** Count only real input points. Synthetic clipped boundaries never enter ChartSeries.points. */
export function rangeCoverage(series: ChartSeries[], start: number | null, now: number): number {
  return series.reduce(
    (count, item) => count + item.points.filter((point) => point.t <= now && (start === null || point.t >= start)).length,
    0,
  );
}

/** ALL remains a safe fallback even when fewer than two points exist. */
export function rangeAvailability(series: ChartSeries[], now: number): Record<RangeKey, RangeCoverage> {
  const result = {} as Record<RangeKey, RangeCoverage>;
  for (const range of RANGE_KEYS) {
    const pointCount = rangeCoverage(series, rangeStart(range, now), now);
    result[range] = { pointCount, enabled: range === "ALL" || pointCount >= 2 };
  }
  return result;
}

/**
 * Clip a series to [start, now]. If the window edge cuts a span, a synthetic
 * entry point is linearly interpolated AT the edge so the line enters the
 * frame at its true height. Edge points are not data: they carry
 * `edge: true` and must never render a dot or appear in tooltips.
 */
export interface ClippedPoint extends ChartPoint {
  edge?: boolean;
}

export function clipSeries(points: ChartPoint[], start: number | null, now: number): ClippedPoint[] {
  if (points.length === 0) return [];
  const lo = start ?? -Infinity;
  const inWin = points.filter((p) => p.t >= lo && p.t <= now);
  if (start === null) return inWin;
  const firstIdx = points.findIndex((p) => p.t >= lo);
  if (firstIdx > 0) {
    const a = points[firstIdx - 1];
    const b = points[firstIdx];
    const f = (lo - a.t) / (b.t - a.t);
    const price = a.price + (b.price - a.price) * f;
    return [{ t: lo, price, kind: a.kind, date: a.date, edge: true }, ...inWin];
  }
  return inWin;
}

export const SPARSE_POINT_THRESHOLD = 6;

type MaybeClippedPoint = ChartPoint & { edge?: boolean };

function actualPoints(points: MaybeClippedPoint[]): ChartPoint[] {
  return points.filter((point) => !point.edge);
}

export function isSparseSeries(points: MaybeClippedPoint[]): boolean {
  return actualPoints(points).length < SPARSE_POINT_THRESHOLD;
}

function countedLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Honest sparse-state copy that never calls an estimated anchor an observation. */
export function coverageCaption(points: MaybeClippedPoint[]): string {
  const real = actualPoints(points).sort((a, b) => a.t - b.t);
  if (real.length === 0) return "No points in this window. Daily history accrues automatically.";
  const recorded = real.filter((point) => point.kind === "recorded").length;
  const anchors = real.length - recorded;
  const since = real[0].date.slice(0, 7);
  const suffix = "Daily history accrues automatically.";
  if (recorded === 0) return `${countedLabel(anchors, "estimated anchor")} since ${since}. ${suffix}`;
  if (anchors === 0) return `${countedLabel(recorded, "recorded day")} since ${since}. ${suffix}`;
  return `${real.length} points since ${since}: ${countedLabel(recorded, "recorded day")}, ${countedLabel(anchors, "estimated anchor")}. ${suffix}`;
}

/** Log-scale ticks on the 1-2-5 progression covering [min, max]. */
export function logTicks125(min: number, max: number): number[] {
  if (!(min > 0) || !(max > 0) || min > max) return [];
  const ticks: number[] = [];
  let decade = Math.pow(10, Math.floor(Math.log10(min)));
  // guard against float drift on tiny/huge domains
  for (let i = 0; i < 40 && decade <= max * 1.0000001; i++, decade *= 10) {
    for (const m of [1, 2, 5]) {
      const v = decade * m;
      if (v >= min * 0.9999999 && v <= max * 1.0000001) ticks.push(Number(v.toPrecision(12)));
    }
  }
  return ticks;
}

/** Padded log domain for a set of positive prices. */
export function logDomain(values: number[], padRatio = 0.12): [number, number] {
  const pos = values.filter((v) => v > 0 && Number.isFinite(v));
  if (pos.length === 0) return [1, 10];
  const min = Math.min(...pos);
  const max = Math.max(...pos);
  if (min === max) return [min / (1 + padRatio * 2), max * (1 + padRatio * 2)];
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const pad = (logMax - logMin) * padRatio;
  return [Math.pow(10, logMin - pad), Math.pow(10, logMax + pad)];
}

/**
 * 1-D right-edge label de-overlap: labels keep their order by target y,
 * are pushed apart to at least `gap`, then shifted back inside [top, bottom].
 */
export interface LabelIn {
  id: string;
  y: number;
}
export interface LabelOut extends LabelIn {
  labelY: number;
}

export function solveLabelCollisions(labels: LabelIn[], top: number, bottom: number, gap: number): LabelOut[] {
  if (labels.length === 0) return [];
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  const ys = sorted.map((l) => Math.min(Math.max(l.y, top), bottom));
  // forward pass: push down to enforce spacing
  for (let i = 1; i < ys.length; i++) {
    if (ys[i] < ys[i - 1] + gap) ys[i] = ys[i - 1] + gap;
  }
  // if we ran past the bottom, shift the tail up and re-resolve upward
  const overflow = ys[ys.length - 1] - bottom;
  if (overflow > 0) {
    ys[ys.length - 1] = bottom;
    for (let i = ys.length - 2; i >= 0; i--) {
      if (ys[i] > ys[i + 1] - gap) ys[i] = ys[i + 1] - gap;
    }
    // clamp at top if the stack is taller than the space; overlap is then unavoidable
    for (let i = 0; i < ys.length; i++) if (ys[i] < top) ys[i] = top;
  }
  return sorted.map((l, i) => ({ ...l, labelY: ys[i] }));
}

/**
 * Value of a series at time t for the unified crosshair: exact point if one
 * exists, linear interpolation inside a span, null outside the series' range.
 */
export interface ValueAt {
  price: number;
  exact: ChartPoint | null; // the exact point if t lands on one
  interpolated: boolean;
}

export function valueAt(points: ChartPoint[], t: number): ValueAt | null {
  if (points.length === 0) return null;
  if (t < points[0].t || t > points[points.length - 1].t) return null;
  for (let i = 0; i < points.length; i++) {
    if (points[i].t === t) return { price: points[i].price, exact: points[i], interpolated: false };
    if (points[i].t > t) {
      const a = points[i - 1];
      const b = points[i];
      const f = (t - a.t) / (b.t - a.t);
      return { price: a.price + (b.price - a.price) * f, exact: null, interpolated: true };
    }
  }
  return null;
}

/** Nearest actual point to t among the given points (for snapping). */
export function nearestPoint(points: ChartPoint[], t: number): ChartPoint | null {
  if (points.length === 0) return null;
  let best = points[0];
  for (const p of points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
  return best;
}

/**
 * Sparkline geometry with an honest domain: y-domain is the series' own
 * [min, max] with `padRatio` padding - never zero-based, never global.
 * Returns null when there is nothing to draw (0 points). A single point
 * renders as a centered dot (the caller special-cases `points.length === 1`).
 */
export interface SparkGeom {
  domain: [number, number];
  flat: boolean;
}

export function sparklineDomain(values: number[], padRatio = 0.1): SparkGeom | null {
  const pos = values.filter((v) => Number.isFinite(v));
  if (pos.length === 0) return null;
  const min = Math.min(...pos);
  const max = Math.max(...pos);
  if (min === max) {
    // flat window: pad around the value so the line sits mid-band, flagged so
    // callers can render a reference treatment instead of implying movement
    const pad = Math.abs(min) * padRatio || 0.5;
    return { domain: [min - pad, max + pad], flat: true };
  }
  const pad = (max - min) * padRatio;
  return { domain: [min - pad, max + pad], flat: false };
}

/** Format a UTC ms timestamp for tooltips/axis: "Jul 2 '26" / "Jul '25". */
export function fmtDate(t: number, dayPrecision: boolean): string {
  const d = new Date(t);
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const yy = String(d.getUTCFullYear()).slice(2);
  return dayPrecision ? `${mon} ${d.getUTCDate()} '${yy}` : `${mon} '${yy}`;
}
