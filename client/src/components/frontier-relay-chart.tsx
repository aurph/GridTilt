import { useMemo, useState, type KeyboardEvent } from "react";
import {
  frontierTimeDomain,
  modelAriaLabel,
  scoreDomain,
  solveFrontierLabels,
  type BenchmarkDefinition,
  type BenchmarkPoint,
  type FrontierLab,
  type FrontierLens,
  type FrontierModel,
  type FrontierRegistry,
  type ReleaseRow,
} from "@/lib/frontier-series";
import { BRAND, CHART_CHROME, FONT, INK, SURFACE } from "@/lib/tokens";

export interface FrontierRelayChartProps {
  width: number;
  height: number;
  registry: FrontierRegistry;
  lens: FrontierLens;
  releaseRows: ReleaseRow[];
  benchmarkPoints: BenchmarkPoint[];
  benchmark: BenchmarkDefinition | null;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

const LABEL_RAIL = 112;
const RIGHT = 28;
const TOP = 34;
const BOTTOM = 34;
const LANE = 48;
const ERA_BOUNDARIES = [
  { date: "2019-02-14", label: "scale-up" },
  { date: "2022-11-30", label: "assistant era" },
  { date: "2024-05-13", label: "native multimodal" },
  { date: "2024-09-12", label: "inference reasoning" },
  { date: "2025-01-01", label: "agent frontier" },
] as const;

function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function pathForGlyph(glyph: FrontierLab["glyph"], x: number, y: number, size: number) {
  if (glyph === "diamond") return <path d={`M${x} ${y - size}L${x + size} ${y}L${x} ${y + size}L${x - size} ${y}Z`} />;
  if (glyph === "triangle") return <path d={`M${x} ${y - size}L${x + size} ${y + size}L${x - size} ${y + size}Z`} />;
  if (glyph === "hex") {
    const points = Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI / 3 * index - Math.PI / 2;
      return `${x + Math.cos(angle) * size},${y + Math.sin(angle) * size}`;
    }).join(" ");
    return <polygon points={points} />;
  }
  if (glyph === "square") return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} rx={1} />;
  return <circle cx={x} cy={y} r={size} />;
}

function formatScore(score: number, benchmark: BenchmarkDefinition): string {
  if (benchmark.unit === "percent") return `${score}%`;
  return `${score} ${benchmark.unit}`;
}

function activate(event: KeyboardEvent<SVGGElement>, modelId: string, onSelect: (id: string) => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect(modelId);
  }
}

function Stamp({ model, lab, x, y, selected, fillMode = "solid", onSelect, onHover }: {
  model: FrontierModel;
  lab: FrontierLab;
  x: number;
  y: number;
  selected: boolean;
  fillMode?: "solid" | "hollow" | "hatched";
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={modelAriaLabel(model, lab)}
      onClick={() => onSelect(model.id)}
      onKeyDown={(event) => activate(event, model.id, onSelect)}
      onMouseEnter={() => onHover(model.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(model.id)}
      onBlur={() => onHover(null)}
      style={{ cursor: "pointer", outline: "none" }}
      data-testid={`frontier-stamp-${model.id}`}
    >
      <circle cx={x} cy={y} r={selected ? 9 : 8} fill="transparent" />
      {selected && <circle cx={x} cy={y} r={7} fill="none" stroke={BRAND.primary} strokeWidth={2} opacity={0.95} />}
      <g
        fill={fillMode === "solid" ? lab.color : fillMode === "hatched" ? "url(#frontier-hatch)" : SURFACE.base}
        stroke={lab.color}
        strokeWidth={fillMode === "hollow" ? 1.7 : 1.2}
      >
        {pathForGlyph(lab.glyph, x, y, selected ? 4.4 : 3.8)}
      </g>
    </g>
  );
}

export default function FrontierRelayChart({
  width,
  height,
  registry,
  lens,
  releaseRows,
  benchmarkPoints,
  benchmark,
  selectedModelId,
  onSelectModel,
}: FrontierRelayChartProps): JSX.Element {
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);
  const domain = frontierTimeDomain(registry.models, registry.asOf);
  const plotWidth = Math.max(1, width - LABEL_RAIL - RIGHT);
  const x = (timestamp: number) => LABEL_RAIL + ((timestamp - domain.start) / (domain.end - domain.start || 1)) * plotWidth;
  const years = Array.from({ length: 8 }, (_, index) => 2019 + index);
  const effectiveHeight = lens === "releases" ? Math.max(height, TOP + releaseRows.length * LANE + BOTTOM) : height;

  const releaseLabels = useMemo(() => {
    const visible = new Set<string>();
    for (const row of releaseRows) {
      const candidates = row.models
        .filter((model) => model.milestone || model.id === selectedModelId)
        .map((model) => ({ id: model.id, x: x(utc(model.releaseDate)), width: Math.max(38, model.name.length * 6.1), priority: model.id === selectedModelId ? 3 : 1 }));
      for (const label of solveFrontierLabels(candidates, LABEL_RAIL, width - RIGHT, 7)) visible.add(label.id);
    }
    return visible;
  }, [releaseRows, selectedModelId, width]);

  const selectedModel = registry.models.find((model) => model.id === selectedModelId);
  const cursorX = selectedModel ? x(utc(selectedModel.releaseDate)) : null;

  const score = benchmark ? scoreDomain(benchmarkPoints, benchmark.unit, benchmark.higherIsBetter) : null;
  const scoreY = (value: number) => TOP + ((score!.max - value) / (score!.max - score!.min || 1)) * (effectiveHeight - TOP - BOTTOM);
  const benchmarkByLab = useMemo(() => {
    const groups = new Map<string, BenchmarkPoint[]>();
    for (const point of benchmarkPoints) groups.set(point.lab.id, [...(groups.get(point.lab.id) ?? []), point]);
    return Array.from(groups.values()).map((points) => points.sort((a, b) => a.t - b.t));
  }, [benchmarkPoints]);

  return (
    <svg width={width} height={effectiveHeight} role="img" aria-label={lens === "releases" ? "Frontier model release timeline by lab" : `${benchmark?.name ?? "Benchmark"} results over time`} className="block overflow-visible">
      <defs>
        <pattern id="frontier-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill={SURFACE.base} />
          <line x1="0" y1="0" x2="0" y2="4" stroke={INK.muted} strokeWidth="1" />
        </pattern>
        <filter id="frontier-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {lens === "releases" && ERA_BOUNDARIES.map((era, index) => {
        const startX = x(utc(era.date));
        const next = ERA_BOUNDARIES[index + 1];
        const endX = next ? x(utc(next.date)) : width - RIGHT;
        return (
          <g key={era.date}>
            <rect x={startX} y={TOP} width={Math.max(0, endX - startX)} height={effectiveHeight - TOP - BOTTOM} fill={index % 2 === 0 ? "rgba(255,255,255,0.012)" : "rgba(240,120,0,0.018)"} />
            {endX - startX > 72 && <text x={startX + 7} y={effectiveHeight - 10} fill={INK.faint} fontFamily={FONT.mono} fontSize={8} letterSpacing="0.08em">{era.label.toUpperCase()}</text>}
          </g>
        );
      })}

      {years.map((year) => {
        const tickX = x(Date.UTC(year, 0, 1));
        if (tickX < LABEL_RAIL || tickX > width - RIGHT) return null;
        return (
          <g key={year}>
            <line x1={tickX} y1={TOP - 5} x2={tickX} y2={effectiveHeight - BOTTOM} stroke={CHART_CHROME.grid} />
            <text x={tickX} y={20} textAnchor="middle" fill={CHART_CHROME.tick} fontFamily={FONT.mono} fontSize={9}>{year}</text>
          </g>
        );
      })}

      {cursorX !== null && <line x1={cursorX} y1={TOP - 4} x2={cursorX} y2={effectiveHeight - BOTTOM + 4} stroke={BRAND.primary} strokeWidth={1.25} opacity={0.78} filter="url(#frontier-glow)" />}

      {lens === "releases" ? releaseRows.map((row, rowIndex) => {
        const laneY = TOP + rowIndex * LANE + LANE / 2;
        return (
          <g key={row.lab.id}>
            <text x={LABEL_RAIL - 12} y={laneY + 3} textAnchor="end" fill={INK.secondary} fontFamily={FONT.mono} fontSize={9}>{row.lab.name}</text>
            <line x1={LABEL_RAIL} y1={laneY} x2={width - RIGHT} y2={laneY} stroke={CHART_CHROME.grid} />
            {row.models.map((model) => {
              const modelX = x(utc(model.releaseDate));
              const showLabel = releaseLabels.has(model.id) || hoveredModelId === model.id;
              return (
                <g key={model.id}>
                  {showLabel && (
                    <g pointerEvents="none">
                      <rect x={modelX - Math.max(38, model.name.length * 6.1) / 2 - 4} y={laneY - 20} width={Math.max(38, model.name.length * 6.1) + 8} height={13} rx={3} fill={SURFACE.overlay} stroke={model.id === selectedModelId ? BRAND.primary : "rgba(255,255,255,0.1)"} />
                      <text x={modelX} y={laneY - 11} textAnchor="middle" fill={model.id === selectedModelId ? BRAND.secondary : INK.secondary} fontFamily={FONT.mono} fontSize={8}>{model.name}</text>
                    </g>
                  )}
                  <Stamp model={model} lab={row.lab} x={modelX} y={laneY} selected={model.id === selectedModelId} onSelect={onSelectModel} onHover={setHoveredModelId} />
                </g>
              );
            })}
          </g>
        );
      }) : benchmark && score ? (
        <>
          {score.ticks.map((tick) => {
            const tickY = scoreY(tick);
            return (
              <g key={tick}>
                <line x1={LABEL_RAIL} y1={tickY} x2={width - RIGHT} y2={tickY} stroke={CHART_CHROME.grid} />
                <text x={LABEL_RAIL - 12} y={tickY + 3} textAnchor="end" fill={CHART_CHROME.tick} fontFamily={FONT.mono} fontSize={9}>{formatScore(tick, benchmark)}</text>
              </g>
            );
          })}
          {benchmark.introducedAt && utc(benchmark.introducedAt) >= domain.start && utc(benchmark.introducedAt) <= domain.end && (
            <g>
              <line x1={x(utc(benchmark.introducedAt))} y1={TOP} x2={x(utc(benchmark.introducedAt))} y2={effectiveHeight - BOTTOM} stroke={CHART_CHROME.refLine} strokeDasharray="3 4" />
              <text x={x(utc(benchmark.introducedAt)) + 5} y={TOP + 10} fill={INK.faint} fontFamily={FONT.mono} fontSize={8}>benchmark introduced</text>
            </g>
          )}
          {benchmarkByLab.map((points) => points.length > 1 && (
            <polyline key={points[0].lab.id} points={points.map((point) => `${x(point.t)},${scoreY(point.result.score)}`).join(" ")} fill="none" stroke={points[0].lab.color} strokeWidth={1.2} opacity={0.45} />
          ))}
          {benchmarkPoints.map((point) => {
            const pointX = x(point.t);
            const pointY = scoreY(point.result.score);
            const showLabel = point.model.id === selectedModelId || hoveredModelId === point.model.id;
            const fillMode = point.result.provenance === "benchmark-owner" ? "solid" : point.result.provenance === "independent" ? "hatched" : "hollow";
            return (
              <g key={`${point.model.id}-${point.result.comparabilityKey}`}>
                {showLabel && <text x={pointX} y={pointY - 11} textAnchor="middle" fill={INK.primary} fontFamily={FONT.mono} fontSize={8}>{point.model.name} · {formatScore(point.result.score, benchmark)}</text>}
                <Stamp model={point.model} lab={point.lab} x={pointX} y={pointY} selected={point.model.id === selectedModelId} fillMode={fillMode} onSelect={onSelectModel} onHover={setHoveredModelId} />
              </g>
            );
          })}
        </>
      ) : null}
    </svg>
  );
}
