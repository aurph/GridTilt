/**
 * Neocloud GPU price history chart (Lake 2 rebuild).
 *
 * - True UTC time x-scale: pixels proportional to elapsed time.
 * - Log y-scale with 1-2-5 ticks, labeled "log scale" in the corner.
 * - Data honesty: sourced anchors = solid dots; recorded days = small dots;
 *   spans between points render dashed + reduced opacity when interpolated,
 *   solid when observed. Linear interpolation only - no splines.
 * - Direct right-edge labels with collision avoidance; hovering a line or
 *   label isolates that series (others drop to 25%).
 * - Unified crosshair tooltip: all visible series at the crosshair time,
 *   sorted descending, interp/est flagged.
 * - Launch marker (ring) on each series' first point.
 * - Current low-high marketplace range bands when <= 3 series visible.
 * - Overlay and Grid (small multiples) modes; 3M/6M/1Y/ALL ranges.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { scaleUtc, scaleLog } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { Group } from "@visx/group";
import { localPoint } from "@visx/event";
import { SrChartTable } from "@/components/Freshness";
import { BORDER, INK, SURFACE } from "@/lib/tokens";
import { chartTheme, timeTicks } from "@/lib/chart-theme";
import {
  ChartSeries,
  ClippedPoint,
  RangeKey,
  clipSeries,
  fmtDate,
  logDomain,
  logTicks125,
  rangeStart,
  solveLabelCollisions,
  valueAt,
} from "@/lib/gpu-series";

export interface PriceHistoryChartProps {
  series: ChartSeries[]; // already filtered to visible models
  range: RangeKey;
  now: number;
  view: "overlay" | "grid";
  width: number;
  hovered: string | null;
  onHover: (model: string | null) => void;
  /** current marketplace range per model, for the <= 3 series bands */
  ranges: Record<string, { low: number; high: number }>;
  estimatedModels: Set<string>;
  recorderEmpty: boolean;
}

const MARGIN = { top: 14, right: 118, bottom: 26, left: 44 };
const GRID_MARGIN = { top: 22, right: 12, bottom: 20, left: 38 };
const OVERLAY_HEIGHT = 380;
const PANEL_HEIGHT = 168;
const LABEL_GAP = 15;

interface TooltipState {
  t: number;
  x: number;
  yPx: number;
  dayPrecision: boolean;
}

export default function PriceHistoryChart(props: PriceHistoryChartProps) {
  const { series, range, now, view, width } = props;

  const start = rangeStart(range, now);
  const clipped = useMemo(
    () =>
      series
        .map((s) => ({ ...s, clipped: clipSeries(s.points, start, now) }))
        .filter((s) => s.clipped.length > 0),
    [series, start, now],
  );

  // Screen-reader mirror of exactly what the chart draws: the visible
  // series' real points in the current window (synthetic edge points excluded).
  const srRows = useMemo(
    () =>
      clipped.flatMap((s) =>
        s.clipped
          .filter((p) => !p.edge)
          .map((p) => [
            s.model,
            fmtDate(p.t, p.kind === "recorded"),
            `$${p.price.toFixed(2)}`,
            p.kind === "anchor" ? "sourced anchor" : "recorded",
          ]),
      ),
    [clipped],
  );

  if (width <= 0) return null;

  if (clipped.length === 0) {
    return (
      <div className="h-[240px] flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground" data-testid="ni-history-empty">
        <span>No price points in this window.</span>
        <span className="text-10 text-muted-foreground/60">
          {series.length === 0
            ? "No GPUs selected. Select All to reset."
            : "Sourced anchors are sparse; the daily recorder widens coverage from here forward. Try 1Y or ALL."}
        </span>
      </div>
    );
  }

  return (
    <>
      {view === "overlay" ? <Overlay {...props} clipped={clipped} start={start} /> : <SmallMultiples {...props} clipped={clipped} start={start} />}
      <SrChartTable
        caption={`GPU rental price history ($/GPU/hr), ${range} range, ${clipped.length} series`}
        columns={["Model", "Date", "Price", "Kind"]}
        rows={srRows}
      />
    </>
  );
}

type ClippedSeries = ChartSeries & { clipped: ClippedPoint[] };

const xTicks = timeTicks;

function spanDash(quality: "observed" | "interpolated"): { dash?: string; opacity: number } {
  return quality === "observed" ? { opacity: 1 } : { dash: "5 4", opacity: 0.55 };
}

function seriesOpacity(model: string, hovered: string | null): number {
  if (!hovered) return 1;
  return model === hovered ? 1 : 0.22;
}

function Overlay({
  clipped,
  start,
  now,
  width,
  hovered,
  onHover,
  ranges,
  estimatedModels,
  recorderEmpty,
}: PriceHistoryChartProps & { clipped: ClippedSeries[]; start: number | null }) {
  const height = OVERLAY_HEIGHT;
  // Narrow screens: collapse the right label gutter and drop label prices so
  // the plot keeps usable width (model-only labels still identify each line).
  const compact = width < 640;
  const margin = compact ? { ...MARGIN, right: 72 } : MARGIN;
  const innerW = Math.max(40, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);

  const x0 = start ?? Math.min(...clipped.map((s) => s.clipped[0].t));
  const x1 = now;

  const xScale = useMemo(() => scaleUtc({ domain: [x0, x1], range: [0, innerW] }), [x0, x1, innerW]);
  const allPrices = useMemo(() => {
    const vals = clipped.flatMap((s) => s.clipped.map((p) => p.price));
    if (clipped.length <= 3) {
      for (const s of clipped) {
        const r = ranges[s.model];
        if (r) vals.push(r.low, r.high);
      }
    }
    return vals;
  }, [clipped, ranges]);
  const yDomain = useMemo(() => logDomain(allPrices), [allPrices]);
  const yScale = useMemo(() => scaleLog({ domain: yDomain, range: [innerH, 0] }), [yDomain, innerH]);
  const yTicks = logTicks125(yDomain[0], yDomain[1]);
  const ticks = xTicks(x0, x1, innerW);

  // Right-edge direct labels with collision avoidance
  const labels = useMemo(() => {
    const raw = clipped
      .filter((s) => s.latest)
      .map((s) => ({ id: s.model, y: yScale(s.clipped[s.clipped.length - 1].price) }));
    return solveLabelCollisions(raw, 4, innerH - 4, LABEL_GAP);
  }, [clipped, yScale, innerH]);
  const labelById = new Map(labels.map((l) => [l.id, l.labelY]));

  const dayPrecision = clipped.some((s) => s.clipped.some((p) => p.kind === "recorded" && !p.edge));

  const handleMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;
      const pt = localPoint(svgRef.current, e);
      if (!pt) return;
      const gx = pt.x - margin.left;
      if (gx < 0 || gx > innerW) {
        setTip(null);
        return;
      }
      const t = xScale.invert(gx).getTime();
      setTip({ t, x: gx, yPx: pt.y, dayPrecision });
    },
    [xScale, innerW, dayPrecision, margin.left],
  );

  // Unified tooltip rows at crosshair time, sorted desc by price
  const tipRows = useMemo(() => {
    if (!tip) return [];
    return clipped
      .map((s) => {
        const v = valueAt(s.points, tip.t);
        if (!v) return null;
        return {
          model: s.model,
          color: s.color,
          price: v.price,
          interpolated: v.interpolated,
          est: estimatedModels.has(s.model),
          exactDate: v.exact ? fmtDate(v.exact.t, v.exact.kind === "recorded") : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.price - a.price);
  }, [tip, clipped, estimatedModels]);

  const showBands = clipped.length <= 3;

  return (
    <div className="relative" data-testid="ni-history-overlay">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        onPointerMove={handleMove}
        onPointerLeave={() => {
          setTip(null);
          onHover(null);
        }}
        role="img"
        aria-label={`GPU rental price history, log scale, ${clipped.length} series`}
      >
        <Group left={margin.left} top={margin.top}>
          {/* y grid + ticks */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={0} x2={innerW} y1={yScale(v)} y2={yScale(v)} stroke={chartTheme.grid.stroke} strokeDasharray={chartTheme.grid.strokeDasharray} />
              <text x={-8} y={yScale(v)} dy="0.32em" textAnchor="end" fill={chartTheme.axis.tickFill} fontSize={chartTheme.axis.fontSize} fontFamily={chartTheme.axis.fontFamily}>
                ${v >= 10 ? v.toFixed(0) : v}
              </text>
            </g>
          ))}
          {/* x ticks on month/quarter boundaries */}
          {ticks.map((d) => (
            <g key={+d}>
              <line x1={xScale(d)} x2={xScale(d)} y1={innerH} y2={innerH + 4} stroke={chartTheme.axis.stroke} />
              <text x={xScale(d)} y={innerH + 15} textAnchor="middle" fill={chartTheme.axis.tickFill} fontSize={chartTheme.axis.fontSize} fontFamily={chartTheme.axis.fontFamily}>
                {fmtDate(+d, false)}
              </text>
            </g>
          ))}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={chartTheme.axis.stroke} />

          {/* current marketplace range bands (<= 3 series) */}
          {showBands &&
            clipped.map((s) => {
              const r = ranges[s.model];
              if (!r || !(r.low > 0) || !(r.high > 0)) return null;
              const yHi = yScale(r.high);
              const yLo = yScale(r.low);
              return (
                <rect
                  key={`band-${s.model}`}
                  x={0}
                  width={innerW}
                  y={Math.min(yHi, yLo)}
                  height={Math.abs(yLo - yHi)}
                  fill={s.color}
                  opacity={0.06 * seriesOpacity(s.model, hovered)}
                  pointerEvents="none"
                />
              );
            })}

          {/* series */}
          {clipped.map((s) => {
            const op = seriesOpacity(s.model, hovered);
            const clippedSpans = spansFromClipped(s.clipped);
            return (
              <Group key={s.model} opacity={op} style={{ transition: "opacity 120ms" }}>
                {clippedSpans.map((span, i) => {
                  const st = spanDash(span.quality);
                  return (
                    <LinePath<ClippedPoint>
                      key={i}
                      data={span.points}
                      x={(p) => xScale(p.t)}
                      y={(p) => yScale(p.price)}
                      stroke={s.color}
                      strokeWidth={2}
                      strokeOpacity={st.opacity}
                      strokeDasharray={st.dash}
                      strokeLinecap="round"
                    />
                  );
                })}
                {/* single lonely point still draws a dot */}
                {s.clipped.filter((p) => !p.edge).map((p) => (
                  <circle
                    key={p.t}
                    cx={xScale(p.t)}
                    cy={yScale(p.price)}
                    r={p.kind === "anchor" ? 3.2 : 2}
                    fill={p.kind === "anchor" ? s.color : SURFACE.raised}
                    stroke={s.color}
                    strokeWidth={p.kind === "anchor" ? 0 : 1.4}
                  />
                ))}
                {/* sparse-series value labels (only when the view is uncrowded) */}
                {clipped.length <= 3 &&
                  s.clipped.filter((p) => !p.edge).length <= 4 &&
                  s.clipped.filter((p) => !p.edge).map((p, i) => (
                    <text
                      key={`vlbl-${p.t}`}
                      x={Math.min(Math.max(xScale(p.t), 16), innerW - 16)}
                      y={yScale(p.price) + (i % 2 === 0 ? -9 : 16)}
                      textAnchor="middle"
                      fill={s.color}
                      fontSize={9}
                      fontFamily={chartTheme.axis.fontFamily}
                      pointerEvents="none"
                    >
                      ${p.price >= 10 ? p.price.toFixed(0) : p.price.toFixed(2)}
                    </text>
                  ))}
                {/* launch marker: ring on the series' true first point when in window */}
                {s.launch && s.clipped.some((p) => !p.edge && p.t === s.launch!.t) && (
                  <circle cx={xScale(s.launch.t)} cy={yScale(s.launch.price)} r={6} fill="none" stroke={s.color} strokeWidth={1} opacity={0.7}>
                    <title>{`${s.model} first tracked price (${fmtDate(s.launch.t, s.launch.kind === "recorded")})`}</title>
                  </circle>
                )}
                {/* invisible fat hit path per series for hover */}
                <LinePath<ClippedPoint>
                  data={s.clipped}
                  x={(p) => xScale(p.t)}
                  y={(p) => yScale(p.price)}
                  stroke="transparent"
                  strokeWidth={12}
                  onPointerEnter={() => onHover(s.model)}
                  style={{ cursor: "pointer" }}
                />
              </Group>
            );
          })}

          {/* crosshair */}
          {tip && (
            <line
              x1={tip.x}
              x2={tip.x}
              y1={0}
              y2={innerH}
              stroke={chartTheme.crosshair.stroke}
              strokeWidth={chartTheme.crosshair.strokeWidth}
              strokeDasharray={chartTheme.crosshair.strokeDasharray}
              pointerEvents="none"
            />
          )}

          {/* right-edge direct labels */}
          {clipped.map((s) => {
            const ly = labelById.get(s.model);
            if (ly === undefined) return null;
            const last = s.clipped[s.clipped.length - 1];
            return (
              <g
                key={`lbl-${s.model}`}
                opacity={seriesOpacity(s.model, hovered)}
                onPointerEnter={() => onHover(s.model)}
                style={{ cursor: "pointer", transition: "opacity 120ms" }}
              >
                <line x1={innerW} x2={innerW + 6} y1={yScale(last.price)} y2={ly} stroke={s.color} strokeWidth={1} opacity={0.6} />
                <text x={innerW + 9} y={ly} dy="0.32em" fill={s.color} fontSize={11} fontFamily={chartTheme.label.fontFamily} fontWeight={600}>
                  {s.model}
                  {!compact && (
                    <tspan fill={INK.secondary} fontWeight={400}>
                      {" "}${last.price >= 10 ? last.price.toFixed(2) : last.price.toFixed(2)}
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}
        </Group>
      </svg>

      {/* corner scale label */}
      <div className="absolute top-0 left-11 text-8 font-mono uppercase tracking-wider text-muted-foreground/60 select-none" data-testid="ni-log-label">
        log scale
      </div>
      {recorderEmpty && (
        <div className="absolute top-0 right-2 text-8 font-mono text-muted-foreground/50 select-none">
          daily recorder starts {fmtDate(now, true)} - history before is sourced anchors
        </div>
      )}

      {/* unified tooltip */}
      {tip && tipRows.length > 0 && (
        <div
          className="absolute z-10 pointer-events-none rounded border px-2.5 py-2"
          style={{
            left: Math.min(Math.max(tip.x + margin.left + 12, 0), Math.max(0, width - 190)),
            top: 8,
            background: SURFACE.overlay,
            borderColor: BORDER.strong,
            minWidth: 178,
          }}
          data-testid="ni-history-tooltip"
        >
          <div className="text-10 font-mono text-muted-foreground mb-1">{fmtDate(tip.t, tip.dayPrecision)}</div>
          {tipRows.map((r) => (
            <div key={r.model} className="flex items-center justify-between gap-3 text-11 font-mono leading-5">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                <span style={{ color: r.color }}>{r.model}</span>
              </span>
              <span className="tabular-nums text-ink">
                ${r.price.toFixed(2)}
                <span className="text-8 text-muted-foreground/70 ml-1">
                  {r.interpolated ? "interp." : r.exactDate ?? ""}
                  {r.est ? " est." : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Re-derive quality spans on the clipped run (edge points inherit span quality). */
function spansFromClipped(points: ClippedPoint[]): Array<{ quality: "observed" | "interpolated"; points: ClippedPoint[] }> {
  if (points.length < 2) return [];
  const spans: Array<{ quality: "observed" | "interpolated"; points: ClippedPoint[] }> = [];
  let cur: (typeof spans)[number] | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const observed =
      !a.edge && !b.edge && a.kind === "recorded" && b.kind === "recorded" && b.t - a.t <= 2 * 86_400_000;
    const quality = observed ? ("observed" as const) : ("interpolated" as const);
    if (cur && cur.quality === quality) cur.points.push(b);
    else {
      cur = { quality, points: [a, b] };
      spans.push(cur);
    }
  }
  return spans;
}

function SmallMultiples({
  clipped,
  start,
  now,
  width,
  hovered,
  onHover,
  estimatedModels,
  ranges,
}: PriceHistoryChartProps & { clipped: ClippedSeries[]; start: number | null }) {
  const cols = width >= 1100 ? 5 : width >= 760 ? 4 : width >= 560 ? 3 : 2;
  const panelW = Math.floor(width / cols);
  const x0 = start ?? Math.min(...clipped.map((s) => s.clipped[0].t));
  const x1 = now;

  return (
    <div className="flex flex-wrap" data-testid="ni-history-grid">
      {clipped.map((s) => (
        <Panel
          key={s.model}
          series={s}
          x0={x0}
          x1={x1}
          width={panelW}
          height={PANEL_HEIGHT}
          dim={hovered !== null && hovered !== s.model}
          onHover={onHover}
          est={estimatedModels.has(s.model)}
          range={ranges[s.model] ?? null}
        />
      ))}
    </div>
  );
}

function Panel({
  series: s,
  x0,
  x1,
  width,
  height,
  dim,
  onHover,
  est,
  range,
}: {
  series: ClippedSeries;
  x0: number;
  x1: number;
  width: number;
  height: number;
  dim: boolean;
  onHover: (m: string | null) => void;
  est: boolean;
  range: { low: number; high: number } | null;
}) {
  const innerW = Math.max(20, width - GRID_MARGIN.left - GRID_MARGIN.right);
  const innerH = height - GRID_MARGIN.top - GRID_MARGIN.bottom;
  const xScale = scaleUtc({ domain: [x0, x1], range: [0, innerW] });
  // Domain includes the observed marketplace range so the band gives every
  // panel real spread context even when the line itself is sparse.
  const domainVals = [
    ...s.clipped.map((p) => p.price),
    ...(range && range.low > 0 && range.high > 0 ? [range.low, range.high] : []),
  ];
  const yDomain = logDomain(domainVals);
  const yScale = scaleLog({ domain: yDomain, range: [innerH, 0] });
  const yTicks = logTicks125(yDomain[0], yDomain[1]).filter((_, i, a) => a.length <= 3 || i % 2 === 0);
  const ticks = xTicks(x0, x1, innerW).filter((_, i, a) => a.length <= 3 || i % Math.ceil(a.length / 3) === 0);
  const spans = spansFromClipped(s.clipped);
  const last = s.clipped[s.clipped.length - 1];
  const realPoints = s.clipped.filter((p) => !p.edge);
  // Sparse series annotate every point - the panel reads as data, not gaps.
  const labelPoints = realPoints.length <= 5 ? realPoints : [];
  const isLive = !est && last.kind === "recorded";

  return (
    <div
      className="relative"
      style={{ width, height, opacity: dim ? 0.35 : 1, transition: "opacity 120ms" }}
      onPointerEnter={() => onHover(s.model)}
      onPointerLeave={() => onHover(null)}
      data-testid={`ni-panel-${s.model}`}
    >
      <div className="absolute top-1 left-9 flex items-baseline gap-1.5 text-10 font-mono">
        <span className="font-semibold" style={{ color: s.color }}>{s.model}</span>
        <span className="text-ink-secondary tabular-nums">${last.price.toFixed(2)}</span>
        {est && <span className="text-8 text-estimate">est.</span>}
        {isLive && <span className="text-8 text-positive" title="latest point observed live from provider APIs">live</span>}
      </div>
      <svg width={width} height={height} role="img" aria-label={`${s.model} price history`}>
        <Group left={GRID_MARGIN.left} top={GRID_MARGIN.top}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={0} x2={innerW} y1={yScale(v)} y2={yScale(v)} stroke={chartTheme.grid.stroke} strokeDasharray="2 3" />
              <text x={-4} y={yScale(v)} dy="0.32em" textAnchor="end" fill={chartTheme.axis.tickFill} fontSize={8} fontFamily={chartTheme.axis.fontFamily}>
                ${v >= 10 ? v.toFixed(0) : v}
              </text>
            </g>
          ))}
          {ticks.map((d) => (
            <text key={+d} x={xScale(d)} y={innerH + 12} textAnchor="middle" fill={chartTheme.axis.tickFill} fontSize={8} fontFamily={chartTheme.axis.fontFamily}>
              {fmtDate(+d, false)}
            </text>
          ))}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={chartTheme.axis.stroke} />
          {/* observed marketplace range: real spread context behind the line */}
          {range && range.low > 0 && range.high > 0 && (
            <g pointerEvents="none">
              <rect
                x={0}
                width={innerW}
                y={yScale(range.high)}
                height={Math.max(0, yScale(range.low) - yScale(range.high))}
                fill={s.color}
                opacity={0.07}
              />
              <text x={innerW - 2} y={yScale(range.high) + 7} textAnchor="end" fill={s.color} opacity={0.55} fontSize={7} fontFamily={chartTheme.axis.fontFamily}>
                mkt ${range.low}–${range.high}
              </text>
            </g>
          )}
          {spans.map((span, i) => {
            const st = spanDash(span.quality);
            return (
              <LinePath<ClippedPoint>
                key={i}
                data={span.points}
                x={(p) => xScale(p.t)}
                y={(p) => yScale(p.price)}
                stroke={s.color}
                strokeWidth={1.6}
                strokeOpacity={st.opacity}
                strokeDasharray={st.dash}
                strokeLinecap="round"
              />
            );
          })}
          {realPoints.map((p) => (
            <circle
              key={p.t}
              cx={xScale(p.t)}
              cy={yScale(p.price)}
              r={p.kind === "anchor" ? 2.4 : 1.5}
              fill={p.kind === "anchor" ? s.color : SURFACE.raised}
              stroke={s.color}
              strokeWidth={p.kind === "anchor" ? 0 : 1.2}
            />
          ))}
          {/* sparse-series value labels: every real point annotated */}
          {labelPoints.map((p, i) => (
            <text
              key={`lbl-${p.t}`}
              x={Math.min(Math.max(xScale(p.t), 12), innerW - 12)}
              y={yScale(p.price) + (i % 2 === 0 ? -6 : 12)}
              textAnchor="middle"
              fill={INK.secondary}
              fontSize={8}
              fontFamily={chartTheme.axis.fontFamily}
              pointerEvents="none"
            >
              ${p.price >= 10 ? p.price.toFixed(0) : p.price.toFixed(2)}
            </text>
          ))}
        </Group>
      </svg>
    </div>
  );
}
