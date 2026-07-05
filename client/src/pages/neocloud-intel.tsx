import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import PriceHistoryChart from "@/components/neocloud/PriceHistoryChart";
import { buildSeries, sparklineDomain, type ChartSeries, type RangeKey } from "@/lib/gpu-series";
import { useMeasuredWidth } from "@/lib/use-measured-width";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";
import { Cpu, ArrowUpDown } from "lucide-react";
import { AsOf, ErrorState } from "@/components/Freshness";
import { ToolTabs, useToolTabs } from "@/components/ToolTabs";
import { PageHeader, HeaderStat } from "@/components/PageHeader";
import GpuEconomics from "@/pages/gpu-economics";
import { BORDER, BRAND, FONT, INK, SEMANTIC, SERIES } from "@/lib/tokens";
import { axisProps, gridProps, tooltipContentStyle } from "@/lib/chart-theme";

// ─── Types (mirror /api/gpu-prices/metrics) ────────────────────────────────

interface GpuChanges { w1: number | null; m1: number | null; ytd: number | null; y1: number | null; }
interface SeriesPoint { date: string; price: number; }
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
// Renter-side convention: pricier = red, cheaper = green.
const changeColor = (v: number | null): string => (v === null ? INK.faint : v > 0 ? SEMANTIC.negative : v < 0 ? SEMANTIC.positive : INK.muted);

type SortKey = "current" | "model" | "w1" | "m1" | "ytd" | "y1";
type ViewKey = "overlay" | "grid";

const RANGE_KEYS: RangeKey[] = ["3M", "6M", "1Y", "ALL"];

// GPU Prices tool tabs (consolidation): rental prices + cost-of-compute.
const GPU_TABS = [
  { id: "prices", label: "Prices" },
  { id: "economics", label: "Economics" },
];

// ─── URL-persisted chart state (?gpus=A,B&view=grid&range=1Y) ──────────────

// Grid (small multiples) is the default view - owner call at the Lake 2 review.
function readChartParams(): { gpus: string[] | null; view: ViewKey; range: RangeKey } {
  const sp = new URLSearchParams(window.location.search);
  const gpusRaw = sp.get("gpus");
  const view = sp.get("view") === "overlay" ? "overlay" : "grid";
  const rangeRaw = sp.get("range");
  const range = (RANGE_KEYS as string[]).includes(rangeRaw ?? "") ? (rangeRaw as RangeKey) : "ALL";
  return { gpus: gpusRaw ? gpusRaw.split(",").filter(Boolean) : null, view, range };
}

function writeChartParams(gpus: string[] | null, view: ViewKey, range: RangeKey) {
  const sp = new URLSearchParams(window.location.search);
  if (gpus) sp.set("gpus", gpus.join(","));
  else sp.delete("gpus");
  if (view !== "grid") sp.set("view", view);
  else sp.delete("view");
  if (range !== "ALL") sp.set("range", range);
  else sp.delete("range");
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}


export default function NeocloudIntel() {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tab, setTab] = useToolTabs(GPU_TABS, "prices");

  const rows = data?.rows ?? [];

  // ── Price-history chart state (persisted in URL params) ──
  const initial = useMemo(readChartParams, []);
  const [visibleModels, setVisibleModels] = useState<string[] | null>(initial.gpus); // null = all
  const [view, setView] = useState<ViewKey>(initial.view);
  const [range, setRange] = useState<RangeKey>(initial.range);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  useEffect(() => {
    writeChartParams(visibleModels, view, range);
  }, [visibleModels, view, range]);

  const allSeries: ChartSeries[] = useMemo(
    () => buildSeries(rows.map((r) => ({ model: r.model, vendor: r.vendor, series: r.series })), colorFor),
    [rows],
  );
  const visibleSet = useMemo(
    () => new Set(visibleModels ?? rows.map((r) => r.model)),
    [visibleModels, rows],
  );
  const chartSeries = useMemo(() => allSeries.filter((s) => visibleSet.has(s.model)), [allSeries, visibleSet]);
  const estimatedModels = useMemo(
    () => new Set(rows.filter((r) => r.estimated.includes("currentUsdPerHr")).map((r) => r.model)),
    [rows],
  );
  const rangesByModel = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.model, { low: r.low, high: r.high }])),
    [rows],
  );
  // Recorder considered empty while no model has more than one day-granular point
  const recorderEmpty = useMemo(
    () => rows.every((r) => r.series.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date)).length <= 1),
    [rows],
  );
  const now = useMemo(() => Date.now(), [data?.asOf]);

  const chipClick = (model: string, shiftKey: boolean) => {
    if (shiftKey) {
      // toggle within the current selection
      const cur = new Set(visibleModels ?? rows.map((r) => r.model));
      if (cur.has(model)) cur.delete(model);
      else cur.add(model);
      setVisibleModels(cur.size === rows.length ? null : Array.from(cur));
    } else {
      // solo; clicking the only-visible chip resets to all
      const isSolo = visibleModels?.length === 1 && visibleModels[0] === model;
      setVisibleModels(isSolo ? null : [model]);
    }
  };

  const [chartRef, chartWidth] = useMeasuredWidth<HTMLDivElement>();

  // Snapshot bar chart: every model, sorted by price desc.
  const barData = useMemo(
    () => [...rows]
      .sort((a, b) => b.current - a.current)
      .map((r) => ({ model: r.model, current: r.current, low: r.low, high: r.high, vendor: r.vendor })),
    [rows],
  );
  const barMax = barData.length ? Math.max(...barData.map((d) => d.current)) * 1.18 : 1;

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
            Models covered by live provider APIs serve an observed daily price; the rest are sourced blended
            estimates flagged est. Low and high are the observed marketplace range. Open any table row for sources.
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
        {tab === "economics" ? (
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

        {/* Price history chart (Lake 2 rebuild: honest anchors/fill, true time axis) */}
        <Card className="border-card-border p-3" data-testid="ni-history">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">
              Price history · $/GPU/hr
            </span>
            <div className="flex items-center gap-1.5 text-10 font-mono">
              {RANGE_KEYS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    range === r
                      ? "border-brand/60 text-brand bg-brand/10"
                      : "border-subtle text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`ni-range-${r}`}
                >
                  {r}
                </button>
              ))}
              <span className="w-px h-4 bg-border mx-1" />
              {(["grid", "overlay"] as ViewKey[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
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

          {/* model chips: click = solo, shift-click = toggle, All resets */}
          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="ni-chips">
              <button
                onClick={() => setVisibleModels(null)}
                className={`px-2 py-0.5 rounded border text-10 font-mono transition-colors ${
                  visibleModels === null
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
                    onClick={(e) => chipClick(r.model, e.shiftKey)}
                    onPointerEnter={() => setHoveredModel(r.model)}
                    onPointerLeave={() => setHoveredModel(null)}
                    title="click = solo · shift-click = toggle"
                    className={`flex items-center gap-1 px-2 py-0.5 rounded border text-10 font-mono transition-colors ${
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
                width={chartWidth}
                hovered={hoveredModel}
                onHover={setHoveredModel}
                ranges={rangesByModel}
                estimatedModels={estimatedModels}
                recorderEmpty={recorderEmpty}
              />
            )}
          </div>
          <p className="text-10 text-muted-foreground/50 mt-1 font-mono">
            Solid dots = sourced anchors · dashed spans = linear interpolation between anchors (synthetic, not observed
            price action) · ring = first tracked price{chartSeries.length <= 3 ? " · shaded band = current observed marketplace range" : ""}.
          </p>
        </Card>

        {/* Current-price snapshot chart (all models, sorted, colored by maker) */}
        <Card className="border-card-border p-3" data-testid="ni-chart">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Current on-demand price · $/GPU/hr</span>
            <div className="flex items-center gap-3 text-10 font-mono">
              <span className="flex items-center gap-1 text-muted-foreground/60"><span className="h-2 w-2 rounded-sm" style={{ background: VENDOR_COLOR.NVIDIA }} />NVIDIA</span>
              <span className="flex items-center gap-1 text-muted-foreground/60"><span className="h-2 w-2 rounded-sm" style={{ background: VENDOR_COLOR.AMD }} />AMD</span>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : isError || rows.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-xs text-muted-foreground" data-testid="ni-chart-empty">
              {isError ? <ErrorState label="Price index unavailable" onRetry={() => refetch()} /> : "No price data."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, barData.length * 38)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 60, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
                <XAxis {...axisProps} type="number" domain={[0, barMax]} tickFormatter={(v) => `$${v}`} />
                <YAxis {...axisProps} type="category" dataKey="model" width={58} />
                <RTooltip
                  cursor={{ fill: BORDER.subtle }}
                  contentStyle={tooltipContentStyle}
                  formatter={(v: number, _n, p: any) => [`$${v.toFixed(2)}/hr  (range $${p.payload.low}–$${p.payload.high})`, p.payload.model]}
                />
                <Bar dataKey="current" radius={[0, 3, 3, 0]} isAnimationActive={false}
                  label={{ position: "right", formatter: (v: number) => `$${v.toFixed(2)}`, fill: INK.muted, fontSize: 10, fontFamily: FONT.mono }}>
                  {barData.map((d) => <Cell key={d.model} fill={vendorColor(d.vendor)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-10 text-muted-foreground/50 mt-1 font-mono">
            Bar = blended on-demand estimate · color = maker · hover for the marketplace range.
          </p>
        </Card>

        {/* Weighted price index table */}
        <Card className="border-card-border overflow-hidden" data-testid="ni-table">
          <div className="px-4 py-2 bg-surface-base border-b border-border">
            <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Weighted Price Index</span>
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
          {" "}Models covered by live provider APIs (RunPod, Vast.ai marketplace) serve an observed daily price - those
          drop the est. flag and show their sources on row hover. The rest carry curated, source-verified estimates.
          Prices move constantly and vary widely by provider, term, and availability; treat these as indicative, not quotes.
        </p>
        </>
        )}
      </div>
    </div>
  );
}

/**
 * Table sparkline with the same honesty treatment as the main chart:
 * per-series [min, max] domain with 10% padding, dashed interpolated spans,
 * solid anchor dots. A single point renders as a dot, not a fake line.
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
          fill={p.kind === "anchor" ? series.color : "transparent"}
          stroke={series.color}
          strokeWidth={p.kind === "anchor" ? 0 : 1}
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
