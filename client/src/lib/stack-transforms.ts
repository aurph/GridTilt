/**
 * Pure data transforms for The Stack (Lake 3). No React, no DOM - unit
 * tested in Lake 8.
 */
import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from "d3-hierarchy";
import { INK, SEMANTIC, SURFACE } from "./tokens";

// ─── Market cap ─────────────────────────────────────────────────────────────

/**
 * Parse a display string like "$3.2T" / "850B" / "$500M" into $B units.
 * Fixes the old parseM bug where B and M were treated identically, which
 * made a $50M cap sort equal to a $50B cap.
 */
export function parseMarketCapDisplay(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = /^\$?\s*([\d.]+)\s*([TBM])\b/i.exec(s.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toUpperCase();
  if (unit === "T") return n * 1000;
  if (unit === "B") return n;
  return n / 1000; // M
}

/** Market cap in $B: numeric field from the API first, display string as fallback. */
export function marketCapOf(stock: { marketCap?: number | null; marketCapDisplay?: string }): number | null {
  if (typeof stock.marketCap === "number" && Number.isFinite(stock.marketCap) && stock.marketCap > 0) {
    return stock.marketCap / 1e9;
  }
  return parseMarketCapDisplay(stock.marketCapDisplay);
}

// ─── Sparkline windows ──────────────────────────────────────────────────────

/** % change across a sparkline window (first -> last). Null when undefined. */
export function pctFromSparkline(spark: number[] | undefined | null): number | null {
  if (!spark || spark.length < 2) return null;
  const first = spark.find((v) => Number.isFinite(v) && v !== 0);
  const last = [...spark].reverse().find((v) => Number.isFinite(v));
  if (first === undefined || last === undefined || first === 0) return null;
  return ((last - first) / first) * 100;
}

export type WindowDirection = "up" | "down" | "flat";

/** Net direction of the sparkline's own window - what the line color encodes. */
export function windowDirection(spark: number[] | undefined | null): WindowDirection | null {
  const pct = pctFromSparkline(spark);
  if (pct === null) return null;
  if (Math.abs(pct) < 0.005) return "flat";
  return pct > 0 ? "up" : "down";
}

// ─── Table sorting ──────────────────────────────────────────────────────────

export type TableSortKey = "ticker" | "price" | "d1" | "d5" | "m1" | "mktcap" | "pe" | "revGrowth";

export interface TableRowValues {
  ticker: string;
  price: number | null;
  d1: number | null;
  d5: number | null;
  m1: number | null;
  mktcap: number | null;
  pe: number | null;
  revGrowth: number | null;
}

/** Sort with nulls always last regardless of direction. */
export function sortTableRows<T extends TableRowValues>(rows: T[], key: TableSortKey, dir: "asc" | "desc"): T[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "ticker") return mul * a.ticker.localeCompare(b.ticker);
    const av = a[key];
    const bv = b[key];
    if (av === null && bv === null) return a.ticker.localeCompare(b.ticker);
    if (av === null) return 1;
    if (bv === null) return -1;
    return mul * (av - bv);
  });
}

// ─── Heatmap (treemap) ──────────────────────────────────────────────────────

export interface HeatStock {
  ticker: string;
  name: string;
  changePercent: number | null;
  stale?: boolean;
  sizeB: number; // $B
}

export interface HeatGroup {
  key: string;
  title: string;
  color: string;
  stocks: HeatStock[];
  totalB: number;
}

export interface HeatmapInput {
  groups: HeatGroup[];
  /** tickers that could not be sized (no market cap) - listed, not drawn */
  unsized: string[];
}

/**
 * Group stocks by layer for the treemap. ETF benchmarks are excluded (fund
 * AUM is not corporate market cap; sizing funds against operating companies
 * would misstate "where the money is"). Unsized tickers are returned for an
 * honest caption instead of silently dropped.
 */
export function buildHeatmapInput(
  layers: Array<{ key: string; title: string; color: string }>,
  stocksByLayer: Record<string, Array<{ ticker: string; name: string; changePercent: number | null; stale?: boolean; marketCap?: number | null; marketCapDisplay?: string }>>,
): HeatmapInput {
  const unsized: string[] = [];
  const groups: HeatGroup[] = [];
  for (const layer of layers) {
    if (layer.key === "etfsBenchmarks") continue;
    const src = stocksByLayer[layer.key] ?? [];
    const stocks: HeatStock[] = [];
    for (const s of src) {
      const sizeB = marketCapOf(s);
      if (sizeB === null || sizeB <= 0) {
        unsized.push(s.ticker);
        continue;
      }
      stocks.push({ ticker: s.ticker, name: s.name, changePercent: s.changePercent, stale: s.stale, sizeB });
    }
    if (stocks.length > 0) {
      groups.push({
        key: layer.key,
        title: layer.title,
        color: layer.color,
        stocks,
        totalB: stocks.reduce((t, s) => t + s.sizeB, 0),
      });
    }
  }
  return { groups, unsized };
}

export interface HeatRect {
  ticker: string;
  name: string;
  changePercent: number | null;
  stale?: boolean;
  sizeB: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  groupKey: string;
}

export interface HeatGroupRect {
  key: string;
  title: string;
  color: string;
  totalB: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const GROUP_HEADER = 16;

/** Squarified two-level treemap layout in pixel space. */
export function layoutHeatmap(input: HeatmapInput, width: number, height: number): { tiles: HeatRect[]; groups: HeatGroupRect[] } {
  if (width <= 0 || height <= 0 || input.groups.length === 0) return { tiles: [], groups: [] };
  type Node = { children?: Node[]; group?: HeatGroup; stock?: HeatStock; groupKey?: string };
  const root = hierarchy<Node>({
    children: input.groups.map((g) => ({
      group: g,
      children: g.stocks.map((s) => ({ stock: s, groupKey: g.key })),
    })),
  })
    .sum((d) => (d.stock ? Math.max(d.stock.sizeB, 0.001) : 0))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const laid = treemap<Node>()
    .tile(treemapSquarify)
    .size([width, height])
    .paddingOuter(2)
    .paddingTop(GROUP_HEADER)
    .paddingInner(2)(root) as HierarchyRectangularNode<Node>;

  const groups: HeatGroupRect[] = (laid.children ?? []).map((g) => ({
    key: g.data.group!.key,
    title: g.data.group!.title,
    color: g.data.group!.color,
    totalB: g.data.group!.totalB,
    x0: g.x0,
    y0: g.y0,
    x1: g.x1,
    y1: g.y1,
  }));

  const tiles: HeatRect[] = laid.leaves().map((l) => ({
    ticker: l.data.stock!.ticker,
    name: l.data.stock!.name,
    changePercent: l.data.stock!.changePercent,
    stale: l.data.stock!.stale,
    sizeB: l.data.stock!.sizeB,
    x0: l.x0,
    y0: l.y0,
    x1: l.x1,
    y1: l.y1,
    groupKey: l.data.groupKey!,
  }));

  return { tiles, groups };
}

// ─── Diverging change color ─────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function blendHex(a: string, b: string, f: number): string {
  const t = Math.min(1, Math.max(0, f));
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[c(ar, br), c(ag, bg), c(ab, bb)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Diverging fill for a % change: neutral surface at 0, semantic green/red
 * ramping with magnitude, saturating at +-4%. Null (stale/unknown) gets the
 * neutral surface so absence of data never reads as "flat day".
 */
export const HEAT_SATURATION_PCT = 4;

export function heatColor(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return SURFACE.overlay;
  const f = Math.min(Math.abs(pct) / HEAT_SATURATION_PCT, 1);
  // ease so small moves are visible but don't scream
  const eased = Math.pow(f, 0.7);
  const target = pct >= 0 ? SEMANTIC.positiveDeep : SEMANTIC.negativeDeep;
  return blendHex(SURFACE.overlay, target, 0.12 + eased * 0.7);
}

/** Text color that stays readable on heatColor() fills. */
export function heatTextColor(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return INK.muted;
  return INK.primary;
}
