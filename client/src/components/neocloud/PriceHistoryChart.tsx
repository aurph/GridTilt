/**
 * GPU rental price history with two explicit evidence classes:
 * recorded marketplace days and estimated monthly anchors.
 *
 * Straight segments only. A solid segment requires consecutive recorded
 * days. Every anchor-involved or gapped span is dashed because the time
 * between those points was not observed. Dispersion bands use recorded
 * snapshot low/high metadata only.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { localPoint } from "@visx/event";
import { Group } from "@visx/group";
import { scaleLinear, scaleLog, scaleUtc } from "@visx/scale";
import { Area, LinePath } from "@visx/shape";
import { SrChartTable } from "@/components/Freshness";
import { CHART_CHROME, FONT, INK, SURFACE } from "@/lib/tokens";
import { CONTEXT, timeTicks } from "@/lib/chart-theme";
import {
  type ChartPoint,
  type ChartSeries,
  type ClippedPoint,
  type RangeKey,
  buildDispersionRuns,
  buildSpans,
  clipSeries,
  coverageCaption,
  fmtDate,
  isSparseSeries,
  logDomain,
  logTicks125,
  nearestPoint,
  rangeStart,
  solveLabelCollisions,
  sparklineDomain,
} from "@/lib/gpu-series";

export type ScaleMode = "log" | "linear";

export interface PriceHistoryChartProps {
  series: ChartSeries[];
  range: RangeKey;
  now: number;
  view: "overlay" | "grid";
  scaleMode: ScaleMode;
  width: number;
  hovered: string | null;
  onHover: (model: string | null) => void;
}

type ClippedSeries = ChartSeries & { clipped: ClippedPoint[] };

const GRID_STROKE = CHART_CHROME.grid;
const AXIS_FILL = CHART_CHROME.axis;
const DATA_FONT = FONT.sans;
const MARGIN = { top: 18, right: 114, bottom: 30, left: 48 };
const GRID_MARGIN = { top: 24, right: 14, bottom: 24, left: 42 };
const OVERLAY_HEIGHT = 390;
const PANEL_PLOT_HEIGHT = 184;
const LABEL_GAP = 16;

interface TooltipState {
  t: number;
  x: number;
}

interface PanelTooltipState {
  point: ChartPoint;
  x: number;
}

interface ScaleBundle {
  project: (value: number) => number;
  ticks: number[];
}

function yScaleBundle(values: number[], height: number, mode: ScaleMode): ScaleBundle {
  if (mode === "log") {
    const domain = logDomain(values);
    const scale = scaleLog({ domain, range: [height, 0] });
    return {
      project: (value) => scale(value),
      ticks: logTicks125(domain[0], domain[1]),
    };
  }
  const domain = sparklineDomain(values, 0.1)?.domain ?? [0, 1];
  const scale = scaleLinear({ domain, range: [height, 0] });
  return {
    project: (value) => scale(value),
    ticks: scale.ticks(5),
  };
}

function realPoints(points: ClippedPoint[]): ChartPoint[] {
  return points.filter((point) => !point.edge);
}

function seriesOpacity(model: string, hovered: string | null): number {
  if (!hovered) return 1;
  return model === hovered ? 1 : 0.2;
}

/**
 * Editorial chart grammar: when several series share one plot, unhovered
 * lines read in warm context gray; the hovered (or only) series takes its
 * assigned categorical slot. Direct end-of-line labels carry identity while
 * everything is gray.
 */
function seriesStroke(item: ChartSeries, hovered: string | null, seriesCount: number): string {
  if (seriesCount === 1 || hovered === item.model) return item.color;
  return CONTEXT;
}

function valuesWithDispersion(series: ClippedSeries[]): number[] {
  const values: number[] = [];
  for (const item of series) {
    for (const point of item.clipped) {
      values.push(point.price);
      if (!point.edge && point.kind === "recorded" && point.low != null && point.high != null) {
        values.push(point.low, point.high);
      }
    }
  }
  return values;
}

function provenance(point: ChartPoint): string {
  return point.kind === "recorded" ? "recorded daily" : "monthly anchor (estimated)";
}

export default function PriceHistoryChart(props: PriceHistoryChartProps) {
  const { series, range, now, view, width } = props;
  const start = rangeStart(range, now);
  const clipped = useMemo(
    () => series
      .map((item) => ({ ...item, clipped: clipSeries(item.points, start, now) }))
      .filter((item) => realPoints(item.clipped).length > 0),
    [series, start, now],
  );
  const srRows = useMemo(
    () => clipped.flatMap((item) => realPoints(item.clipped).map((point) => [
      item.model,
      fmtDate(point.t, point.kind === "recorded"),
      `$${point.price.toFixed(2)}`,
      provenance(point),
      point.low != null && point.high != null ? `$${point.low.toFixed(2)}-$${point.high.toFixed(2)}` : "none",
    ])),
    [clipped],
  );

  if (width <= 0) return null;
  if (clipped.length === 0) {
    return (
      <div className="min-h-[260px] flex flex-col items-center justify-center gap-2 text-center" data-testid="ni-history-empty">
        <span className="text-[14px] text-ink">No price points in this window.</span>
        <span className="max-w-md text-[12.5px] leading-relaxed text-ink-muted">
          {series.length === 0
            ? "No GPU models are selected. Use All to restore the chart."
            : "This range has no plotted evidence. Choose All to see the available recorded days and estimated anchors."}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <EvidenceLegend />
      {view === "overlay" ? (
        <Overlay {...props} clipped={clipped} start={start} />
      ) : (
        <SmallMultiples {...props} clipped={clipped} start={start} />
      )}
      <SrChartTable
        caption={`GPU rental price history ($/GPU/hr), ${range} range, ${clipped.length} series`}
        columns={["Model", "Date", "Price", "Evidence", "Observed spread"]}
        rows={srRows}
      />
    </div>
  );
}

function EvidenceLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-ink-muted" data-testid="ni-history-legend">
      <span className="flex items-center gap-2">
        <span className="relative block h-2 w-7" aria-hidden="true">
          <span className="absolute left-0 right-0 top-1 h-px bg-ink/70" />
          <span className="absolute left-3 top-0.5 h-1.5 w-1.5 rounded-full bg-ink" />
        </span>
        recorded daily
      </span>
      <span className="flex items-center gap-2">
        <span className="relative block h-2 w-7" aria-hidden="true">
          <span className="absolute left-0 right-0 top-1 border-t border-dashed border-ink-muted/60" />
          <span className="absolute left-3 top-0 h-2 w-2 rounded-full border border-ink-muted bg-paper" />
        </span>
        monthly anchor (estimated)
      </span>
      <span className="flex items-center gap-2">
        <span className="block h-2 w-7 rounded-sm bg-ink-faint/40 border-y border-ink-faint/60" aria-hidden="true" />
        recorded low-high spread
      </span>
    </div>
  );
}

function Overlay({
  clipped,
  start,
  now,
  width,
  hovered,
  onHover,
  scaleMode,
}: PriceHistoryChartProps & { clipped: ClippedSeries[]; start: number | null }) {
  const compact = width < 640;
  const margin = compact ? { ...MARGIN, right: 72 } : MARGIN;
  const innerW = Math.max(48, width - margin.left - margin.right);
  const innerH = OVERLAY_HEIGHT - margin.top - margin.bottom;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<TooltipState | null>(null);
  const x0 = start ?? Math.min(...clipped.map((item) => item.clipped[0].t));
  const x1 = now;
  const xScale = useMemo(() => scaleUtc({ domain: [x0, x1], range: [0, innerW] }), [x0, x1, innerW]);
  const yBundle = useMemo(
    () => yScaleBundle(valuesWithDispersion(clipped), innerH, scaleMode),
    [clipped, innerH, scaleMode],
  );
  const xAxisTicks = timeTicks(x0, x1, innerW);
  const snapPoints = useMemo(
    () => clipped.flatMap((item) => realPoints(item.clipped).map((point) => ({ model: item.model, point }))),
    [clipped],
  );
  const labels = useMemo(
    () => solveLabelCollisions(
      clipped.map((item) => ({
        id: item.model,
        y: yBundle.project(item.clipped[item.clipped.length - 1].price),
      })),
      4,
      innerH - 4,
      LABEL_GAP,
    ),
    [clipped, innerH, yBundle],
  );
  const labelById = new Map(labels.map((label) => [label.id, label.labelY]));

  const handleMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || snapPoints.length === 0) return;
    const point = localPoint(svgRef.current, event);
    if (!point) return;
    const graphX = point.x - margin.left;
    if (graphX < 0 || graphX > innerW) {
      setTip(null);
      return;
    }
    const target = xScale.invert(graphX).getTime();
    let nearest = snapPoints[0].point;
    for (const candidate of snapPoints) {
      if (Math.abs(candidate.point.t - target) < Math.abs(nearest.t - target)) nearest = candidate.point;
    }
    setTip({ t: nearest.t, x: xScale(nearest.t) });
  }, [innerW, margin.left, snapPoints, xScale]);

  const tipRows = useMemo(() => {
    if (!tip) return [];
    return clipped
      .map((item) => {
        const point = realPoints(item.clipped).find((candidate) => candidate.t === tip.t);
        return point ? { model: item.model, color: item.color, point } : null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.point.price - a.point.price);
  }, [clipped, tip]);

  const sparse = clipped.filter((item) => isSparseSeries(item.clipped));

  return (
    <div data-testid="ni-history-overlay">
      <div className="relative">
        <svg
          ref={svgRef}
          width={width}
          height={OVERLAY_HEIGHT}
          onPointerMove={handleMove}
          onPointerLeave={() => {
            setTip(null);
            onHover(null);
          }}
          role="img"
          aria-label={`GPU rental price history, ${scaleMode} scale, ${clipped.length} series`}
        >
          <Group left={margin.left} top={margin.top}>
            {yBundle.ticks.map((value) => (
              <g key={value}>
                <line x1={0} x2={innerW} y1={yBundle.project(value)} y2={yBundle.project(value)} stroke={GRID_STROKE} />
                <text x={-8} y={yBundle.project(value)} dy="0.32em" textAnchor="end" fill={AXIS_FILL} fontSize={10} fontFamily={DATA_FONT}>
                  ${value >= 10 ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}
                </text>
              </g>
            ))}
            {xAxisTicks.map((date) => (
              <g key={+date}>
                <line x1={xScale(date)} x2={xScale(date)} y1={innerH} y2={innerH + 4} stroke={AXIS_FILL} opacity={0.35} />
                <text x={xScale(date)} y={innerH + 17} textAnchor="middle" fill={AXIS_FILL} fontSize={10} fontFamily={DATA_FONT}>
                  {fmtDate(+date, false)}
                </text>
              </g>
            ))}
            <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={AXIS_FILL} opacity={0.35} />

            {clipped.map((item) => (
              <Group key={`bands-${item.model}`} opacity={seriesOpacity(item.model, hovered)}>
                {buildDispersionRuns(item.clipped).map((run, index) => (
                  <Area<ChartPoint>
                    key={index}
                    data={run}
                    x={(point) => xScale(point.t)}
                    y0={(point) => yBundle.project(point.high!)}
                    y1={(point) => yBundle.project(point.low!)}
                    fill={seriesStroke(item, hovered, clipped.length)}
                    fillOpacity={0.14}
                    stroke="none"
                    pointerEvents="none"
                  />
                ))}
              </Group>
            ))}

            {clipped.map((item) => {
              const opacity = seriesOpacity(item.model, hovered);
              const stroke = seriesStroke(item, hovered, clipped.length);
              return (
                <Group key={item.model} opacity={opacity}>
                  {buildSpans(item.clipped).map((span, index) => (
                    <LinePath<ChartPoint>
                      key={index}
                      data={span.points}
                      x={(point) => xScale(point.t)}
                      y={(point) => yBundle.project(point.price)}
                      stroke={stroke}
                      strokeWidth={span.quality === "observed" ? 2.2 : 1.4}
                      strokeOpacity={span.quality === "observed" ? 0.95 : 0.45}
                      strokeDasharray={span.quality === "observed" ? undefined : "4 5"}
                      strokeLinecap="round"
                    />
                  ))}
                  {realPoints(item.clipped).map((point) => (
                    <circle
                      key={`${point.date}-${point.price}`}
                      cx={xScale(point.t)}
                      cy={yBundle.project(point.price)}
                      r={point.kind === "anchor" ? 4 : 2.4}
                      fill={point.kind === "anchor" ? SURFACE.raised : stroke}
                      stroke={stroke}
                      strokeWidth={point.kind === "anchor" ? 1.6 : 0}
                    />
                  ))}
                  <LinePath<ClippedPoint>
                    data={item.clipped}
                    x={(point) => xScale(point.t)}
                    y={(point) => yBundle.project(point.price)}
                    stroke="transparent"
                    strokeWidth={14}
                    onPointerEnter={() => onHover(item.model)}
                    style={{ cursor: "crosshair" }}
                  />
                </Group>
              );
            })}

            {tip && (
              <line x1={tip.x} x2={tip.x} y1={0} y2={innerH} stroke={AXIS_FILL} strokeWidth={1} strokeDasharray="2 3" opacity={0.55} pointerEvents="none" />
            )}

            {clipped.map((item) => {
              const labelY = labelById.get(item.model);
              if (labelY == null) return null;
              const last = item.clipped[item.clipped.length - 1];
              const active = hovered === item.model || clipped.length === 1;
              return (
                <g key={`label-${item.model}`} opacity={seriesOpacity(item.model, hovered)} onPointerEnter={() => onHover(item.model)}>
                  <line x1={innerW} x2={innerW + 7} y1={yBundle.project(last.price)} y2={labelY} stroke={seriesStroke(item, hovered, clipped.length)} opacity={0.6} />
                  <text x={innerW + 10} y={labelY} dy="0.32em" fill={active ? item.color : INK.secondary} fontSize={11} fontFamily={DATA_FONT} fontWeight={600}>
                    {item.model}
                    {!compact && <tspan fill={INK.muted} fontWeight={400}>{` $${last.price.toFixed(2)}`}</tspan>}
                  </text>
                </g>
              );
            })}
          </Group>
        </svg>

        <div className="absolute top-0 left-12 text-[11px] text-ink-muted select-none" data-testid="ni-scale-label">
          {scaleMode} scale
        </div>
        {tip && tipRows.length > 0 && (
          <EvidenceTooltip
            rows={tipRows}
            left={Math.min(Math.max(tip.x + margin.left + 12, 0), Math.max(0, width - 228))}
            top={8}
          />
        )}
      </div>

      {sparse.length > 0 && (
        <div className="grid gap-x-5 gap-y-1 border-t border-rule pt-2 sm:grid-cols-2" data-testid="ni-sparse-coverage">
          {sparse.map((item) => (
            <p key={item.model} className="flex gap-2 text-[12px] leading-relaxed text-ink-muted">
              <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full" style={{ background: item.color }} />
              <span><strong className="font-semibold text-ink">{item.model}</strong> {coverageCaption(item.clipped)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceTooltip({
  rows,
  left,
  top,
}: {
  rows: Array<{ model: string; color: string; point: ChartPoint }>;
  left: number;
  top: number;
}) {
  const datePoint = rows[0].point;
  const dayPrecision = rows.some((row) => row.point.kind === "recorded");
  return (
    <div
      className="absolute z-20 min-w-[216px] rounded-sm border border-rule px-3 py-2 pointer-events-none shadow-md"
      style={{ left, top, background: SURFACE.overlay, fontFamily: DATA_FONT }}
      data-testid="ni-history-tooltip"
    >
      <div className="mb-1.5 text-[11px] text-ink-muted">{fmtDate(datePoint.t, dayPrecision)}</div>
      {rows.map(({ model, color, point }) => (
        <div key={model} className="border-t border-rule/60 py-1.5 first:border-0 first:pt-0">
          <div className="flex items-center justify-between gap-4 text-[12px]">
            <span className="font-semibold" style={{ color }}>{model}</span>
            <span className="tnum text-ink">${point.price.toFixed(2)}/hr</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-4 text-[11px] text-ink-muted">
            <span>{provenance(point)}</span>
            {point.low != null && point.high != null && (
              <span className="tnum">${point.low.toFixed(2)}-${point.high.toFixed(2)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SmallMultiples({
  clipped,
  start,
  now,
  width,
  hovered,
  onHover,
  scaleMode,
}: PriceHistoryChartProps & { clipped: ClippedSeries[]; start: number | null }) {
  const columns = width >= 1120 ? 4 : width >= 760 ? 3 : width >= 520 ? 2 : 1;
  const panelWidth = Math.floor((width - (columns - 1) * 12) / columns);
  const x0 = start ?? Math.min(...clipped.map((item) => item.clipped[0].t));
  return (
    <div className="grid gap-x-3 gap-y-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} data-testid="ni-history-grid">
      {clipped.map((item) => (
        <Panel
          key={item.model}
          series={item}
          x0={x0}
          x1={now}
          width={panelWidth}
          dim={hovered !== null && hovered !== item.model}
          active={hovered === item.model}
          onHover={onHover}
          scaleMode={scaleMode}
        />
      ))}
    </div>
  );
}

function Panel({
  series,
  x0,
  x1,
  width,
  dim,
  active,
  onHover,
  scaleMode,
}: {
  series: ClippedSeries;
  x0: number;
  x1: number;
  width: number;
  dim: boolean;
  active: boolean;
  onHover: (model: string | null) => void;
  scaleMode: ScaleMode;
}) {
  const innerW = Math.max(40, width - GRID_MARGIN.left - GRID_MARGIN.right);
  const innerH = PANEL_PLOT_HEIGHT - GRID_MARGIN.top - GRID_MARGIN.bottom;
  const xScale = scaleUtc({ domain: [x0, x1], range: [0, innerW] });
  const yBundle = yScaleBundle(valuesWithDispersion([series]), innerH, scaleMode);
  const yTicks = yBundle.ticks.filter((_, index, ticks) => ticks.length <= 3 || index % Math.ceil(ticks.length / 3) === 0);
  const xAxisTicks = timeTicks(x0, x1, innerW).filter((_, index, ticks) => ticks.length <= 3 || index % Math.ceil(ticks.length / 3) === 0);
  const points = realPoints(series.clipped);
  const last = points.at(-1)!;
  const sparse = isSparseSeries(points);
  const labelPoints = points.length <= 4 ? points : [];
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<PanelTooltipState | null>(null);

  const handleMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const local = localPoint(svgRef.current, event);
    if (!local) return;
    const graphX = Math.min(Math.max(local.x - GRID_MARGIN.left, 0), innerW);
    const point = nearestPoint(points, xScale.invert(graphX).getTime());
    if (point) setTip({ point, x: xScale(point.t) + GRID_MARGIN.left });
  }, [innerW, points, xScale]);

  // Panels default to context gray; the hovered panel takes its slot color.
  const stroke = active ? series.color : CONTEXT;

  return (
    <div
      className="relative min-w-0 border-t border-rule pt-1"
      style={{ opacity: dim ? 0.35 : 1 }}
      onPointerEnter={() => onHover(series.model)}
      onPointerLeave={() => {
        setTip(null);
        onHover(null);
      }}
      data-testid={`ni-panel-${series.model}`}
    >
      <div className="absolute left-10 top-2 z-10 flex items-baseline gap-1.5 text-[11px]">
        <span className="font-semibold text-ink">{series.model}</span>
        <span className="tnum text-ink-secondary">${last.price.toFixed(2)}</span>
        <span className={last.kind === "recorded" ? "text-positive" : "text-estimate"}>
          {last.kind === "recorded" ? "recorded" : "est. anchor"}
        </span>
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={PANEL_PLOT_HEIGHT}
        onPointerMove={handleMove}
        role="img"
        aria-label={`${series.model} price history, ${scaleMode} scale`}
      >
        <Group left={GRID_MARGIN.left} top={GRID_MARGIN.top}>
          {yTicks.map((value) => (
            <g key={value}>
              <line x1={0} x2={innerW} y1={yBundle.project(value)} y2={yBundle.project(value)} stroke={GRID_STROKE} />
              <text x={-5} y={yBundle.project(value)} dy="0.32em" textAnchor="end" fill={AXIS_FILL} fontSize={9} fontFamily={DATA_FONT}>
                ${value >= 10 ? value.toFixed(0) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}
              </text>
            </g>
          ))}
          {xAxisTicks.map((date) => (
            <text key={+date} x={xScale(date)} y={innerH + 15} textAnchor="middle" fill={AXIS_FILL} fontSize={9} fontFamily={DATA_FONT}>
              {fmtDate(+date, false)}
            </text>
          ))}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={AXIS_FILL} opacity={0.35} />

          {buildDispersionRuns(series.clipped).map((run, index) => (
            <Area<ChartPoint>
              key={index}
              data={run}
              x={(point) => xScale(point.t)}
              y0={(point) => yBundle.project(point.high!)}
              y1={(point) => yBundle.project(point.low!)}
              fill={stroke}
              fillOpacity={0.14}
              stroke="none"
            />
          ))}
          {buildSpans(series.clipped).map((span, index) => (
            <LinePath<ChartPoint>
              key={index}
              data={span.points}
              x={(point) => xScale(point.t)}
              y={(point) => yBundle.project(point.price)}
              stroke={stroke}
              strokeWidth={span.quality === "observed" ? 1.9 : 1.2}
              strokeOpacity={span.quality === "observed" ? 0.95 : 0.45}
              strokeDasharray={span.quality === "observed" ? undefined : "4 5"}
              strokeLinecap="round"
            />
          ))}
          {points.map((point) => (
            <circle
              key={`${point.date}-${point.price}`}
              cx={xScale(point.t)}
              cy={yBundle.project(point.price)}
              r={point.kind === "anchor" ? 3.5 : 2.1}
              fill={point.kind === "anchor" ? SURFACE.raised : stroke}
              stroke={stroke}
              strokeWidth={point.kind === "anchor" ? 1.4 : 0}
            />
          ))}
          {labelPoints.map((point, index) => (
            <text
              key={`value-${point.date}`}
              x={Math.min(Math.max(xScale(point.t), 16), innerW - 16)}
              y={yBundle.project(point.price) + (index % 2 === 0 ? -8 : 14)}
              textAnchor="middle"
              fill={INK.secondary}
              fontSize={9}
              fontFamily={DATA_FONT}
              pointerEvents="none"
            >
              ${point.price >= 10 ? point.price.toFixed(0) : point.price.toFixed(2)}
            </text>
          ))}
          {tip && (
            <line x1={xScale(tip.point.t)} x2={xScale(tip.point.t)} y1={0} y2={innerH} stroke={AXIS_FILL} strokeDasharray="2 3" opacity={0.5} />
          )}
        </Group>
      </svg>

      {tip && (
        <EvidenceTooltip
          rows={[{ model: series.model, color: series.color, point: tip.point }]}
          left={Math.min(Math.max(tip.x + 8, 0), Math.max(0, width - 224))}
          top={26}
        />
      )}
      <p className={`min-h-8 px-2 pb-1 text-[11px] leading-relaxed ${sparse ? "text-ink-muted" : "text-ink-faint"}`}>
        {sparse ? coverageCaption(points) : `${points.length} plotted points in range.`}
      </p>
    </div>
  );
}
