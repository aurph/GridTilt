import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import PriceHistoryChart, { type ScaleMode } from "@/components/neocloud/PriceHistoryChart";
import {
  RANGE_KEYS,
  buildSeries,
  rangeAvailability,
  sparklineDomain,
  type ChartSeries,
  type RangeKey,
} from "@/lib/gpu-series";
import { useMeasuredWidth } from "@/lib/use-measured-width";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpDown } from "lucide-react";
import { AsOf, ErrorState, SrChartTable } from "@/components/Freshness";
import { ToolTabs, useToolTabs } from "@/components/ToolTabs";
import { PageHeader, HeaderStat } from "@/components/PageHeader";
import GpuEconomics from "@/pages/gpu-economics";
import FrontierModels from "@/pages/frontier-models";
import { BORDER, BRAND, DATA_QUALITY, FONT, INK, SEMANTIC, SERIES } from "@/lib/tokens";

// ─── Types (mirror /api/gpu-prices/metrics) ────────────────────────────────

interface GpuChanges { w1: number | null; m1: number | null; ytd: number | null; y1: number | null; }
interface SeriesPoint {
  date: string;
  price: number;
  low?: number;
  high?: number;
  sources?: string[];
  n?: number;
}
interface ProviderCounts { requests: number; succeeded: number; failed: number; observations: number; }
interface GpuSweepSummary {
  date: string;
  ok: boolean;
  perProvider: { runpod: ProviderCounts; vast: ProviderCounts };
  usableModels: number;
}
interface GpuPipelineHealth {
  recordedDays: number;
  lastRecordedDate: string | null;
  lastSweep: GpuSweepSummary | null;
  curatedLastRefreshed: string | null;
}
interface GpuRow {
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
  series: SeriesPoint[];
  liveSources?: string[] | null;
  liveDate?: string | null;
}
interface GpuMetrics {
  asOf: string;
  modelCount: number;
  rows: GpuRow[];
  fleetAvg: number;
  fleetAvg1yChange: number | null;
  unit: string | null;
  methodology: string | null;
  lastRefreshed: string | null;
  health: GpuPipelineHealth;
}

// Maker colors — the primary "who made this" signal (orange vs cyan, colorblind-safe).
const VENDOR_COLOR: Record<string, string> = { NVIDIA: BRAND.primary, AMD: SERIES[5] };
const vendorColor = (v: string) => VENDOR_COLOR[v] ?? INK.muted;

// Per-model accent for the card stripe + row dot (categorical SERIES slots, fixed order).
const MODEL_COLOR: Record<string, string> = {
  GB200: SERIES[0], B300: SERIES[1], B200: SERIES[2], H200: SERIES[3], GH200: SERIES[4],
  H100: SERIES[5], A100: SERIES[6], MI355X: SERIES[7], MI325X: SERIES[8], MI300X: SERIES[9],
};
const colorFor = (m: string) => MODEL_COLOR[m] ?? INK.muted;

const CONF_COLOR: Record<string, string> = { high: SEMANTIC.positive, medium: SEMANTIC.warning, low: SEMANTIC.negative };

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtChange = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
// Standard market direction coloring (up green, down red), same as every other
// module. Direction needs no legend; the renter's cost framing lives in copy.
const changeColor = (v: number | null): string => (v === null ? INK.faint : v > 0 ? SEMANTIC.positive : v < 0 ? SEMANTIC.negative : INK.muted);

type SortKey = "current" | "model" | "w1" | "m1" | "ytd" | "y1";
type ViewKey = "overlay" | "grid";
const DEFAULT_VISIBLE_MODELS = ["H100", "H200", "B200", "A100"];

// GPU Prices tool tabs (consolidation): rental prices + cost-of-compute.
const GPU_TABS = [
  { id: "prices", label: "Prices" },
  { id: "economics", label: "Economics" },
  { id: "frontier", label: "Frontier" },
];

// ─── URL-persisted chart state (?gpus=A,B&view=grid&range=1Y) ──────────────

// Grid (small multiples) is the default view - owner call at the Lake 2 review.
function readChartParams(): { gpus: string[] | null; view: ViewKey; range: RangeKey; scale: ScaleMode } {
  const sp = new URLSearchParams(window.location.search);
  const gpusRaw = sp.get("gpus");
  const view = sp.get("view") === "overlay" ? "overlay" : "grid";
  const rangeRaw = sp.get("range");
  const range = (RANGE_KEYS as readonly string[]).includes(rangeRaw ?? "") ? (rangeRaw as RangeKey) : "ALL";
  const scale = sp.get("scale") === "linear" ? "linear" : "log";
  return { gpus: gpusRaw ? gpusRaw.split(",").filter(Boolean) : null, view, range, scale };
}

function writeChartParams(gpus: string[] | null, view: ViewKey, range: RangeKey, scale: ScaleMode) {
  const sp = new URLSearchParams(window.location.search);
  if (gpus) sp.set("gpus", gpus.join(","));
  else sp.delete("gpus");
  if (view !== "grid") sp.set("view", view);
  else sp.delete("view");
  if (range !== "ALL") sp.set("range", range);
  else sp.delete("range");
  if (scale !== "log") sp.set("scale", scale);
  else sp.delete("scale");
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}


export default function NeocloudIntel() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tab, setTab] = useToolTabs(GPU_TABS, "prices");

  const rows = data?.rows ?? [];
  const now = useMemo(() => Date.now(), [data?.asOf]);

  // ── Price-history chart state (persisted in URL params) ──
  const initial = useMemo(readChartParams, []);
  const [visibleModels, setVisibleModels] = useState<string[] | null>(initial.gpus); // null = preferred four
  const [view, setView] = useState<ViewKey>(initial.view);
  const [range, setRange] = useState<RangeKey>(initial.range);
  const [scaleMode, setScaleMode] = useState<ScaleMode>(initial.scale);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  useEffect(() => {
    writeChartParams(visibleModels, view, range, scaleMode);
  }, [visibleModels, view, range, scaleMode]);

  const allSeries: ChartSeries[] = useMemo(
    () => buildSeries(rows.map((r) => ({ model: r.model, vendor: r.vendor, series: r.series })), colorFor),
    [rows],
  );
  const defaultVisibleModels = useMemo(() => {
    const available = new Set(rows.map((row) => row.model));
    const preferred = DEFAULT_VISIBLE_MODELS.filter((model) => available.has(model));
    return preferred.length > 0 ? preferred : rows.slice(0, 4).map((row) => row.model);
  }, [rows]);
  const effectiveVisibleModels = useMemo(() => {
    const available = new Set(rows.map((row) => row.model));
    const requested = (visibleModels ?? defaultVisibleModels).filter((model) => available.has(model));
    return requested.length > 0 ? requested : defaultVisibleModels;
  }, [defaultVisibleModels, rows, visibleModels]);
  const visibleSet = useMemo(
    () => new Set(effectiveVisibleModels),
    [effectiveVisibleModels],
  );
  const chartSeries = useMemo(() => allSeries.filter((s) => visibleSet.has(s.model)), [allSeries, visibleSet]);
  const availableRanges = useMemo(() => rangeAvailability(chartSeries, now), [chartSeries, now]);
  useEffect(() => {
    if (!availableRanges[range].enabled) setRange("ALL");
  }, [availableRanges, range]);

  const chipClick = (model: string) => {
    const selected = new Set(effectiveVisibleModels);
    if (selected.has(model)) {
      if (selected.size === 1) return;
      selected.delete(model);
    } else selected.add(model);
    const next = rows.map((row) => row.model).filter((candidate) => selected.has(candidate));
    const isDefault = next.length === defaultVisibleModels.length && next.every((candidate) => defaultVisibleModels.includes(candidate));
    setVisibleModels(isDefault ? null : next);
  };

  const [chartRef, chartWidth] = useMeasuredWidth<HTMLDivElement>();
  const [dispRef, dispWidth] = useMeasuredWidth<HTMLDivElement>();

  // Dispersion chart: every model, sorted by blended price desc.
  const dispersionRows = useMemo(
    () => [...rows]
      .sort((a, b) => b.current - a.current)
      .map((r) => ({
        model: r.model,
        vendor: r.vendor,
        current: r.current,
        low: r.low,
        high: r.high,
        est: r.estimated.includes("currentUsdPerHr"),
      })),
    [rows],
  );

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "model") cmp = a.model.localeCompare(b.model);
      else if (sortKey === "current") cmp = a.current - b.current;
      else cmp = (a.changes[sortKey] ?? -Infinity) - (b.changes[sortKey] ?? -Infinity);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "model" ? "asc" : "desc"); }
  };

  // Cards grouped by maker.
  const byVendor = useMemo(() => {
    const groups: Record<string, GpuRow[]> = {};
    for (const r of [...rows].sort((a, b) => b.current - a.current)) (groups[r.vendor] = groups[r.vendor] ?? []).push(r);
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [rows]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="GPU Prices"
        testId="ni-header"
        about={
          <>
            On-demand GPU rental prices ($/GPU/hr) blended across the major neoclouds and marketplaces (Lambda,
            RunPod, Vast.ai, CoreWeave, TensorWave, Vultr, Nebius) and the getdeploying.com / Silicon Data trackers.
            Models covered by live provider prices (RunPod, Vast.ai marketplace) show an observed daily price and
            drop the est. flag; the rest are curated, source-verified estimates flagged est. Low and high are the
            observed marketplace range. Prices move constantly and vary widely by provider, term, and availability.
            Open any table row for sources.
          </>
        }
        stats={
          data ? (
            <>
              <HeaderStat label="Fleet avg" value={`${fmtUsd(data.fleetAvg)}/hr`} />
              {data.fleetAvg1yChange !== null && (
                <span className="font-mono text-11 tabular-nums" style={{ color: changeColor(data.fleetAvg1yChange) }}>
                  {fmtChange(data.fleetAvg1yChange)} 1Y
                </span>
              )}
              <span className="font-mono text-11 text-muted-foreground">{data.modelCount} models</span>
            </>
          ) : undefined
        }
        right={
          <>
            {data?.lastRefreshed && <span className="text-11 font-mono text-muted-foreground/60">source data {data.lastRefreshed}</span>}
            <AsOf updatedAt={dataUpdatedAt} />
            <Link href="/compute-frontier" className="text-11 text-brand hover:text-brand-2 font-medium">Compute Frontier →</Link>
          </>
        }
        controls={<ToolTabs tabs={GPU_TABS} active={tab} onChange={setTab} />}
      />

      <div className="flex-1 p-4 sm:p-6 space-y-5">
        {tab === "frontier" ? (
          <FrontierModels embedded />
        ) : tab === "economics" ? (
          <GpuEconomics embedded />
        ) : (
        <>
        {/* Price cards grouped by maker */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : isError ? (
          <Card className="border-card-border">
            <ErrorState label="GPU price index unavailable" onRetry={() => refetch()} />
          </Card>
        ) : (
          byVendor.map(([vendor, vrows]) => (
            <div key={vendor} className="space-y-2" data-testid={`ni-group-${vendor}`}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: vendorColor(vendor) }} />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{vendor}</span>
                <span className="text-10 font-mono text-muted-foreground/40">{vrows.length} GPUs</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {vrows.map((r) => (
                  <Card key={r.model} className="border-card-border p-3 relative overflow-hidden" data-testid={`ni-card-${r.model}`}>
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: colorFor(r.model) }} />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-semibold" style={{ color: colorFor(r.model) }}>{r.model}</span>
                      {r.confidence && (
                        <span className="flex items-center gap-1 text-8 font-mono uppercase text-muted-foreground/50" title={`price confidence: ${r.confidence}`}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: CONF_COLOR[r.confidence] ?? INK.faint }} />
                          {r.confidence}
                        </span>
                      )}
                    </div>
                    <div className="text-9 font-mono text-muted-foreground/55 mt-0.5 leading-tight">
                      {[r.architecture, r.vramGB ? `${r.vramGB}GB ${r.vramType ?? ""}`.trim() : null, r.launchYear ? `'${String(r.launchYear).slice(2)}` : null].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xl font-semibold tabular-nums text-foreground mt-1.5">
                      {fmtUsd(r.current)}
                      {r.estimated.includes("currentUsdPerHr") && <span className="ml-1 text-8 font-mono uppercase text-estimate align-top">est.</span>}
                      <span className="text-10 font-normal text-muted-foreground/50"> /hr</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-10 font-mono text-muted-foreground/45">${r.low}–${r.high}</span>
                      <span className="text-10 font-mono" style={{ color: changeColor(r.changes.y1) }}>
                        {r.changes.y1 === null ? "1Y —" : `${fmtChange(r.changes.y1)} 1Y`}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Price history: recorded days and estimated anchors remain separate evidence classes. */}
        <Card className="border-card-border p-3" data-testid="ni-history">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">
                Price history · $/GPU/hr
              </span>
              {data?.health && <PipelineHealthLine health={data.health} />}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5 text-10 font-mono">
              {RANGE_KEYS.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    if (availableRanges[r].enabled) setRange(r);
                  }}
                  aria-disabled={!availableRanges[r].enabled}
                  aria-pressed={range === r}
                  title={availableRanges[r].enabled ? `${availableRanges[r].pointCount} points in this window` : "no data in this window"}
                  className={`px-2 py-0.5 rounded border ${
                    range === r
                      ? "border-brand/60 text-brand bg-brand/10"
                      : availableRanges[r].enabled
                        ? "border-subtle text-muted-foreground hover:text-foreground"
                        : "border-subtle text-muted-foreground/30 cursor-not-allowed"
                  }`}
                  data-testid={`ni-range-${r}`}
                >
                  {r}
                </button>
              ))}
              <span className="w-px h-4 bg-border mx-1" />
              {(["log", "linear"] as ScaleMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setScaleMode(mode)}
                  aria-pressed={scaleMode === mode}
                  className={`px-2 py-0.5 rounded border ${
                    scaleMode === mode
                      ? "border-brand/60 text-brand bg-brand/10"
                      : "border-subtle text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`ni-scale-${mode}`}
                >
                  {mode}
                </button>
              ))}
              <span className="w-px h-4 bg-border mx-1" />
              {(["grid", "overlay"] as ViewKey[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`px-2 py-0.5 rounded border ${
                    view === v
                      ? "border-brand/60 text-brand bg-brand/10"
                      : "border-subtle text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`ni-view-${v}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Model chips toggle visibility. The default set is the four densest series. */}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="ni-chips">
              <button
                onClick={() => setVisibleModels(visibleSet.size === rows.length ? null : rows.map((row) => row.model))}
                aria-pressed={visibleSet.size === rows.length}
                className={`px-2 py-0.5 rounded border text-10 font-mono ${
                  visibleSet.size === rows.length
                    ? "border-brand/60 text-brand bg-brand/10"
                    : "border-subtle text-muted-foreground hover:text-foreground"
                }`}
                data-testid="ni-chip-all"
              >
                All
              </button>
              {rows.map((r) => {
                const on = visibleSet.has(r.model);
                return (
                  <button
                    key={r.model}
                    onClick={() => chipClick(r.model)}
                    onPointerEnter={() => setHoveredModel(r.model)}
                    onPointerLeave={() => setHoveredModel(null)}
                    aria-pressed={on}
                    title={on && visibleSet.size === 1 ? "At least one model must remain visible" : `Toggle ${r.model}`}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded border text-10 font-mono ${
                      on ? "border-strong text-foreground" : "border-subtle text-muted-foreground/50 hover:text-muted-foreground"
                    }`}
                    data-testid={`ni-chip-${r.model}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorFor(r.model), opacity: on ? 1 : 0.35 }} />
                    {r.model}
                  </button>
                );
              })}
            </div>
          )}

          <div ref={chartRef}>
            {isLoading ? (
              <Skeleton className="h-[380px] w-full" />
            ) : isError ? (
              <div className="h-[240px] flex items-center justify-center">
                <ErrorState label="Price index unavailable" onRetry={() => refetch()} />
              </div>
            ) : (
              <PriceHistoryChart
                series={chartSeries}
                range={range}
                now={now}
                view={view}
                scaleMode={scaleMode}
                width={chartWidth}
                hovered={hoveredModel}
                onHover={setHoveredModel}
              />
            )}
          </div>
          <p className="text-10 text-muted-foreground/50 mt-1 font-mono">
            Only plotted points are data. Dashed spans connect unobserved time and are never treated as recorded price action.
          </p>
        </Card>

        {/* Marketplace dispersion: observed low-high per model on one scale, dot = blended price */}
        <Card className="border-card-border p-3" data-testid="ni-chart">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Marketplace dispersion · $/GPU/hr</span>
            <div className="flex items-center gap-3 text-10 font-mono">
              <span className="flex items-center gap-1 text-muted-foreground/60"><span className="h-2 w-2 rounded-sm" style={{ background: VENDOR_COLOR.NVIDIA }} />NVIDIA</span>
              <span className="flex items-center gap-1 text-muted-foreground/60"><span className="h-2 w-2 rounded-sm" style={{ background: VENDOR_COLOR.AMD }} />AMD</span>
            </div>
          </div>

          <div ref={dispRef}>
            {isLoading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : isError || dispersionRows.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground" data-testid="ni-chart-empty">
                {isError ? <ErrorState label="Price index unavailable" onRetry={() => refetch()} /> : "No price data."}
              </div>
            ) : (
              <DispersionChart rows={dispersionRows} width={dispWidth} hovered={hoveredModel} onHover={setHoveredModel} />
            )}
          </div>
        </Card>

        {/* Price index table (fleet avg is a plain mean; "weighted" would be a lie) */}
        <Card className="border-card-border overflow-hidden" data-testid="ni-table">
          <div className="px-4 py-2 bg-surface-base border-b border-border">
            <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">On-Demand Price Index</span>
            <span className="text-10 font-mono text-muted-foreground/40 ml-2">hover a row for sources</span>
          </div>
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-base border-b border-border text-10 font-mono uppercase tracking-wider text-muted-foreground">
            <SortHeader label="Model" k="model" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-3" />
            <span className="col-span-2">History</span>
            <SortHeader label="Avg" k="current" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <SortHeader label="1W" k="w1" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <SortHeader label="1M" k="m1" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <SortHeader label="YTD" k="ytd" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <SortHeader label="1Y" k="y1" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <span className="col-span-2 text-right">Range</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
          ) : isError ? (
            <ErrorState label="Price index unavailable" onRetry={() => refetch()} />
          ) : (
            sortedRows.map((r) => (
              <UITooltip key={r.model}>
                <TooltipTrigger asChild>
                  <div
                    className={`grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs cursor-help items-center transition-colors ${
                      hoveredModel === r.model ? "bg-brand/5" : "hover:bg-brand/5"
                    }`}
                    onPointerEnter={() => setHoveredModel(r.model)}
                    onPointerLeave={() => setHoveredModel(null)}
                    data-testid={`ni-row-${r.model}`}
                  >
                    <span className="col-span-3 font-mono font-semibold flex items-center gap-1.5" style={{ color: colorFor(r.model) }}>
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: colorFor(r.model) }} />
                      {r.model}
                      <span className="text-8 font-normal px-1 rounded-sm" style={{ color: vendorColor(r.vendor), border: `1px solid ${vendorColor(r.vendor)}55` }}>{r.vendor}</span>
                    </span>
                    <span className="col-span-2">
                      <MiniSpark series={allSeries.find((s) => s.model === r.model)} />
                    </span>
                    <span className="col-span-1 font-mono text-foreground text-right tabular-nums">
                      {fmtUsd(r.current)}{r.estimated.includes("currentUsdPerHr") && <span className="ml-0.5 text-8 text-estimate">e</span>}
                    </span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.w1) }}>{fmtChange(r.changes.w1)}</span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.m1) }}>{fmtChange(r.changes.m1)}</span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.ytd) }}>{fmtChange(r.changes.ytd)}</span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.y1) }}>{fmtChange(r.changes.y1)}</span>
                    <span className="col-span-2 font-mono text-muted-foreground text-right tabular-nums text-11">${r.low}–${r.high}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md p-3">
                  <div className="text-xs font-semibold mb-1" style={{ color: colorFor(r.model) }}>
                    {r.model} · {r.vendor} {r.architecture ? `· ${r.architecture}` : ""} {r.vramGB ? `· ${r.vramGB}GB ${r.vramType ?? ""}` : ""} {r.launchYear ? `· ${r.launchYear}` : ""}
                  </div>
                  {r.liveSources && r.liveSources.length > 0 && (
                    <p className="text-10 font-mono text-positive mb-1">
                      live price · {r.liveSources.join(" + ")} · {r.liveDate}
                    </p>
                  )}
                  {r.oneYearTrend && <p className="text-11 text-muted-foreground mb-1.5">{r.oneYearTrend}</p>}
                  {r.sources.length > 0 && (
                    <div className="text-10 font-mono text-muted-foreground/70 break-all space-y-0.5">
                      <div className="uppercase tracking-wider text-muted-foreground/50 mb-0.5">Sources</div>
                      {r.sources.slice(0, 4).map((s) => <div key={s}>{s.replace(/^https?:\/\//, "")}</div>)}
                    </div>
                  )}
                  <p className="text-10 text-muted-foreground/50 mt-1.5">1W/1M/YTD read "—" until the daily recorder accrues history; 1Y is from sourced anchors.</p>
                </TooltipContent>
              </UITooltip>
            ))
          )}
        </Card>

        <p className="text-11 text-muted-foreground/60 leading-relaxed px-1" data-testid="ni-methodology">
          {data?.methodology ?? "Blended on-demand rental prices from public neocloud and marketplace listings and the getdeploying.com / Silicon Data trackers."}
          {" "}Prices vary widely by provider, term, and availability; treat these as indicative, not quotes.
        </p>
        </>
        )}
      </div>
    </div>
  );
}

function PipelineHealthLine({ health }: { health: GpuPipelineHealth }) {
  const sweep = health.lastSweep;
  const failed = sweep ? sweep.perProvider.runpod.failed + sweep.perProvider.vast.failed : 0;
  return (
    <p className="mt-1 max-w-3xl text-10 font-mono leading-relaxed text-muted-foreground" data-testid="ni-pipeline-health">
      Live observations: {health.recordedDays} days, last {health.lastRecordedDate ?? "none"}. Curated reprice: {health.curatedLastRefreshed ?? "unknown"}.
      {sweep ? (
        <span className={failed > 0 ? "text-warning" : "text-muted-foreground/70"}>
          {` Last sweep ${sweep.date}: ${failed > 0 ? `${failed} provider request${failed === 1 ? "" : "s"} failed` : `${sweep.usableModels} models recorded`} (RunPod ${sweep.perProvider.runpod.succeeded}/${sweep.perProvider.runpod.requests}, Vast ${sweep.perProvider.vast.succeeded}/${sweep.perProvider.vast.requests}).`}
        </span>
      ) : (
        <span className="text-muted-foreground/60"> Live prices update shortly.</span>
      )}
    </p>
  );
}

interface DispersionRow {
  model: string;
  vendor: string;
  current: number;
  low: number;
  high: number;
  est: boolean;
}

/**
 * Same-scale dispersion strips: the observed low-high marketplace range per
 * model with a dot at the blended price. The spread multiple on the right is
 * the point of the chart: on-demand GPU rent is not one price.
 */
function DispersionChart({
  rows,
  width,
  hovered,
  onHover,
}: {
  rows: DispersionRow[];
  width: number;
  hovered: string | null;
  onHover: (m: string | null) => void;
}) {
  const M = { top: 18, right: 108, left: 56 };
  const ROW_H = 30;
  const height = M.top + rows.length * ROW_H + 6;
  if (width <= 0) return null;

  const innerW = Math.max(40, width - M.left - M.right);
  const max = Math.max(...rows.map((r) => r.high), 1) * 1.05;
  const x = (v: number) => M.left + (v / max) * innerW;
  const tickStep = max > 8 ? 2 : 1;
  const ticks: number[] = [];
  // stop ticks short of the right rail so labels never collide with its captions
  for (let t = tickStep; t < max; t += tickStep) if (x(t) < width - M.right - 16) ticks.push(t);

  return (
    <>
      <svg width={width} height={height} className="block" role="img" aria-label="On-demand price dispersion by GPU model">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={M.top - 4} x2={x(t)} y2={height - 4} stroke={BORDER.subtle} />
            <text x={x(t)} y={M.top - 8} textAnchor="middle" fontSize={9} fontFamily={FONT.mono} fill={INK.faint}>${t}</text>
          </g>
        ))}
        <text x={width - M.right + 44} y={M.top - 8} textAnchor="end" fontSize={9} fontFamily={FONT.mono} fill={INK.faint}>blended</text>
        <text x={width - 8} y={M.top - 8} textAnchor="end" fontSize={9} fontFamily={FONT.mono} fill={INK.faint}>spread</text>
        {rows.map((r, i) => {
          const cy = M.top + i * ROW_H + ROW_H / 2;
          const dim = hovered !== null && hovered !== r.model;
          const spread = r.low > 0 ? r.high / r.low : null;
          return (
            <g
              key={r.model}
              opacity={dim ? 0.35 : 1}
              onPointerEnter={() => onHover(r.model)}
              onPointerLeave={() => onHover(null)}
              data-testid={`ni-disp-${r.model}`}
            >
              <title>
                {`${r.model} · $${r.current.toFixed(2)}/hr blended${r.est ? " (est.)" : ""} · observed $${r.low}-$${r.high}${spread ? ` · ${spread.toFixed(1)}x spread` : ""}`}
              </title>
              <rect x={0} y={cy - ROW_H / 2} width={width} height={ROW_H} fill="transparent" />
              <text x={M.left - 8} y={cy + 3.5} textAnchor="end" fontSize={11} fontWeight={600} fontFamily={FONT.mono} fill={colorFor(r.model)}>{r.model}</text>
              <rect x={x(r.low)} y={cy - 2} width={Math.max(2, x(r.high) - x(r.low))} height={4} rx={2} fill={vendorColor(r.vendor)} opacity={0.3} />
              <circle cx={x(r.current)} cy={cy} r={hovered === r.model ? 5 : 4} fill={vendorColor(r.vendor)} />
              <text x={width - M.right + 44} y={cy + 3.5} textAnchor="end" fontSize={11} fontFamily={FONT.mono} fill={INK.secondary}>
                {fmtUsd(r.current)}
                {r.est && <tspan fontSize={8} fill={DATA_QUALITY.estimateFlag} dy={-3}> e</tspan>}
              </text>
              <text x={width - 8} y={cy + 3.5} textAnchor="end" fontSize={10} fontFamily={FONT.mono} fill={INK.faint}>
                {spread ? `${spread.toFixed(1)}×` : "—"}
              </text>
            </g>
          );
        })}
      </svg>
      <SrChartTable
        caption="On-demand GPU price dispersion ($/GPU/hr): observed low, blended price, observed high"
        columns={["Model", "Low", "Blended", "High"]}
        rows={rows.map((r) => [r.model, `$${r.low}`, `$${r.current.toFixed(2)}${r.est ? " est." : ""}`, `$${r.high}`])}
      />
    </>
  );
}

/**
 * Table sparkline with the same honesty treatment as the main chart:
 * per-series [min, max] domain with 10% padding, dashed interpolated spans,
 * hollow anchor dots and solid recorded dots. A single point renders as a
 * dot, not a fake line.
 */
function MiniSpark({ series }: { series: ChartSeries | undefined }) {
  const W = 104;
  const H = 22;
  if (!series || series.points.length === 0) {
    return <span className="text-10 font-mono text-muted-foreground/40">no data</span>;
  }
  const pts = series.points;
  const geom = sparklineDomain(pts.map((p) => p.price));
  if (!geom) return <span className="text-10 font-mono text-muted-foreground/40">no data</span>;
  const [d0, d1] = geom.domain;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const x = (t: number) => (t1 === t0 ? W / 2 : 2 + ((t - t0) / (t1 - t0)) * (W - 4));
  const y = (v: number) => H - 3 - ((v - d0) / (d1 - d0)) * (H - 6);

  return (
    <svg width={W} height={H} className="block" role="img" aria-label={`${series.model} price history sparkline`}>
      {series.spans.map((span, i) => (
        <polyline
          key={i}
          points={span.points.map((p) => `${x(p.t)},${y(p.price)}`).join(" ")}
          fill="none"
          stroke={series.color}
          strokeWidth={1.4}
          strokeOpacity={span.quality === "observed" ? 1 : 0.55}
          strokeDasharray={span.quality === "observed" ? undefined : "3 3"}
          strokeLinecap="round"
        />
      ))}
      {pts.map((p) => (
        <circle
          key={p.t}
          cx={x(p.t)}
          cy={y(p.price)}
          r={p.kind === "anchor" ? 2 : 1.3}
          fill={p.kind === "anchor" ? "hsl(var(--card))" : series.color}
          stroke={series.color}
          strokeWidth={p.kind === "anchor" ? 1 : 0}
        />
      ))}
    </svg>
  );
}

function SortHeader({ label, k, cur, dir, onClick, className = "" }: { label: string; k: SortKey; cur: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void; className?: string }) {
  const active = cur === k;
  return (
    <button onClick={() => onClick(k)} className={`flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-brand" : ""} ${className}`} data-testid={`ni-sort-${k}`}>
      {label}
      <ArrowUpDown className="h-3 w-3" style={{ opacity: active ? 1 : 0.3 }} />
    </button>
  );
}
