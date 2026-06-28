import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
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
const VENDOR_COLOR: Record<string, string> = { NVIDIA: "#F07800", AMD: "#22D3EE" };
const vendorColor = (v: string) => VENDOR_COLOR[v] ?? "#9ca3af";

// Per-model accent for the card stripe + row dot.
const MODEL_COLOR: Record<string, string> = {
  GB200: "#F07800", B300: "#F0A500", B200: "#FFD166", H200: "#4dabf7", GH200: "#22b8cf",
  H100: "#51cf66", A100: "#94d82d", MI355X: "#e64980", MI325X: "#cc5de8", MI300X: "#ff8787",
};
const colorFor = (m: string) => MODEL_COLOR[m] ?? "#9ca3af";

const CONF_COLOR: Record<string, string> = { high: "#4ade80", medium: "#F0A500", low: "#f87171" };

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtChange = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
// Renter-side convention: pricier = red, cheaper = green.
const changeColor = (v: number | null) => (v === null ? "#6b7280" : v > 0 ? "#f87171" : v < 0 ? "#4ade80" : "#9ca3af");

type SortKey = "current" | "model" | "w1" | "m1" | "ytd" | "y1";

// Has the recorder accrued enough real points for any continuous series yet?
// (Anchors are sparse and mixed-methodology, so they don't count.) Until then we
// show the snapshot, not a fake line.
function hasRealSeries(rows: GpuRow[]): boolean {
  // a model with >=4 points where consecutive dates are <=45 days apart somewhere
  return rows.some((r) => r.series.length >= 6);
}

export default function NeocloudIntel() {
  const { data, isLoading, isError } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = data?.rows ?? [];

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
      {/* Header */}
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="ni-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-5 w-5 text-[#F07800]" />
              <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Neocloud Intel <span className="text-muted-foreground/50">/ GPU Rental Price Index</span>
              </h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              On-demand GPU rental prices ($/GPU/hr) blended across the major neoclouds and marketplaces
              (Lambda, RunPod, Vast.ai, CoreWeave, TensorWave, Vultr, Nebius) and the getdeploying.com / Silicon Data
              trackers. Each price is a sourced blended estimate (flagged <span className="text-[#F0A500]">est.</span>);
              low and high are the observed marketplace range. Open any row for its sources. Cheaper is
              <span className="text-[#4ade80]"> green</span>, pricier is <span className="text-[#f87171]">red</span>.
            </p>
          </div>
          <div className="text-[11px] text-muted-foreground/70 font-mono tracking-wide text-right space-y-0.5" data-testid="ni-sync">
            {data?.lastRefreshed && <div className="text-muted-foreground/60">data as of {data.lastRefreshed}</div>}
            {data && <div>{data.modelCount} models · fleet avg {fmtUsd(data.fleetAvg)}/hr</div>}
            {data?.fleetAvg1yChange !== null && data?.fleetAvg1yChange !== undefined && (
              <div style={{ color: changeColor(data.fleetAvg1yChange) }}>fleet {fmtChange(data.fleetAvg1yChange)} 1Y</div>
            )}
            <Link href="/compute-frontier" className="text-[#F07800] hover:text-[#F0A500]">Compute Frontier →</Link>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-5">
        {/* Price cards grouped by maker */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-28" />)}
          </div>
        ) : (
          byVendor.map(([vendor, vrows]) => (
            <div key={vendor} className="space-y-2" data-testid={`ni-group-${vendor}`}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: vendorColor(vendor) }} />
                <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{vendor}</span>
                <span className="text-[10px] font-mono text-muted-foreground/40">{vrows.length} GPUs</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {vrows.map((r) => (
                  <Card key={r.model} className="border-card-border p-3 relative overflow-hidden" data-testid={`ni-card-${r.model}`}>
                    <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: colorFor(r.model) }} />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-semibold" style={{ color: colorFor(r.model) }}>{r.model}</span>
                      {r.confidence && (
                        <span className="flex items-center gap-1 text-[8px] font-mono uppercase text-muted-foreground/50" title={`price confidence: ${r.confidence}`}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: CONF_COLOR[r.confidence] ?? "#777" }} />
                          {r.confidence}
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] font-mono text-muted-foreground/55 mt-0.5 leading-tight">
                      {[r.architecture, r.vramGB ? `${r.vramGB}GB ${r.vramType ?? ""}`.trim() : null, r.launchYear ? `'${String(r.launchYear).slice(2)}` : null].filter(Boolean).join(" · ")}
                    </div>
                    <div className="text-xl font-semibold tabular-nums text-foreground mt-1.5">
                      {fmtUsd(r.current)}
                      {r.estimated.includes("currentUsdPerHr") && <span className="ml-1 text-[8px] font-mono uppercase text-[#F0A500]/80 align-top">est.</span>}
                      <span className="text-[10px] font-normal text-muted-foreground/50"> /hr</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-mono text-muted-foreground/45">${r.low}–${r.high}</span>
                      <span className="text-[10px] font-mono" style={{ color: changeColor(r.changes.y1) }}>
                        {r.changes.y1 === null ? "1Y —" : `${fmtChange(r.changes.y1)} 1Y`}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Current-price snapshot chart (all models, sorted, colored by maker) */}
        <Card className="border-card-border p-3" data-testid="ni-chart">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Current on-demand price · $/GPU/hr</span>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-muted-foreground/60"><span className="h-2 w-2 rounded-sm" style={{ background: VENDOR_COLOR.NVIDIA }} />NVIDIA</span>
              <span className="flex items-center gap-1 text-muted-foreground/60"><span className="h-2 w-2 rounded-sm" style={{ background: VENDOR_COLOR.AMD }} />AMD</span>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : isError || rows.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-xs text-muted-foreground" data-testid="ni-chart-empty">
              {isError ? "Price index unavailable." : "No price data."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, barData.length * 38)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 60, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" domain={[0, barMax]} tickFormatter={(v) => `$${v}`} tick={{ fontSize: 10, fill: "#777" }} stroke="#333" />
                <YAxis type="category" dataKey="model" width={58} tick={{ fontSize: 11, fill: "#ccc" }} stroke="#333" />
                <RTooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, _n, p: any) => [`$${v.toFixed(2)}/hr  (range $${p.payload.low}–$${p.payload.high})`, p.payload.model]}
                />
                <Bar dataKey="current" radius={[0, 3, 3, 0]} isAnimationActive={false}
                  label={{ position: "right", formatter: (v: number) => `$${v.toFixed(2)}`, fill: "#999", fontSize: 10, fontFamily: "monospace" }}>
                  {barData.map((d) => <Cell key={d.model} fill={vendorColor(d.vendor)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">
            Bar = blended on-demand estimate · color = maker · hover for the marketplace range.
            {data && !hasRealSeries(rows) && " A price-history chart will appear here once enough daily points accrue."}
          </p>
        </Card>

        {/* Weighted price index table */}
        <Card className="border-card-border overflow-hidden" data-testid="ni-table">
          <div className="px-4 py-2 bg-[#0E0E0C] border-b border-border">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Weighted Price Index</span>
            <span className="text-[10px] font-mono text-muted-foreground/40 ml-2">hover a row for sources</span>
          </div>
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-[#0E0E0C]/60 border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <SortHeader label="Model" k="model" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-3" />
            <span className="col-span-2">Memory</span>
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
            <div className="p-6 text-center text-xs text-red-400">Price index unavailable.</div>
          ) : (
            sortedRows.map((r) => (
              <UITooltip key={r.model}>
                <TooltipTrigger asChild>
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs hover:bg-[#F07800]/5 cursor-help items-center" data-testid={`ni-row-${r.model}`}>
                    <span className="col-span-3 font-mono font-semibold flex items-center gap-1.5" style={{ color: colorFor(r.model) }}>
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: colorFor(r.model) }} />
                      {r.model}
                      <span className="text-[8px] font-normal px-1 rounded-sm" style={{ color: vendorColor(r.vendor), border: `1px solid ${vendorColor(r.vendor)}55` }}>{r.vendor}</span>
                    </span>
                    <span className="col-span-2 font-mono text-muted-foreground/70 text-[10px]">{r.vramGB ? `${r.vramGB}GB ${r.vramType ?? ""}`.trim() : "—"}</span>
                    <span className="col-span-1 font-mono text-foreground text-right tabular-nums">
                      {fmtUsd(r.current)}{r.estimated.includes("currentUsdPerHr") && <span className="ml-0.5 text-[8px] text-[#F0A500]/70">e</span>}
                    </span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.w1) }}>{fmtChange(r.changes.w1)}</span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.m1) }}>{fmtChange(r.changes.m1)}</span>
                    <span className="col-span-2 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.ytd) }}>{fmtChange(r.changes.ytd)}</span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.y1) }}>{fmtChange(r.changes.y1)}</span>
                    <span className="col-span-2 font-mono text-muted-foreground text-right tabular-nums text-[11px]">${r.low}–${r.high}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md p-3">
                  <div className="text-xs font-semibold mb-1" style={{ color: colorFor(r.model) }}>
                    {r.model} · {r.vendor} {r.architecture ? `· ${r.architecture}` : ""} {r.vramGB ? `· ${r.vramGB}GB ${r.vramType ?? ""}` : ""} {r.launchYear ? `· ${r.launchYear}` : ""}
                  </div>
                  {r.oneYearTrend && <p className="text-[11px] text-muted-foreground mb-1.5">{r.oneYearTrend}</p>}
                  {r.sources.length > 0 && (
                    <div className="text-[10px] font-mono text-muted-foreground/70 break-all space-y-0.5">
                      <div className="uppercase tracking-wider text-muted-foreground/50 mb-0.5">Sources</div>
                      {r.sources.slice(0, 4).map((s) => <div key={s}>{s.replace(/^https?:\/\//, "")}</div>)}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-1.5">1W/1M/YTD read "—" until the daily recorder accrues history; 1Y is from sourced anchors.</p>
                </TooltipContent>
              </UITooltip>
            ))
          )}
        </Card>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed px-1" data-testid="ni-methodology">
          {data?.methodology ?? "Blended on-demand rental prices from public neocloud and marketplace listings and the getdeploying.com / Silicon Data trackers."}
          {" "}Sources are listed per model (hover a table row) and in <span className="font-mono">server/data/gpu-rental-prices.json</span>. Prices move constantly and vary widely by provider, term, and availability; treat these as indicative, not quotes.
        </p>
      </div>
    </div>
  );
}

function SortHeader({ label, k, cur, dir, onClick, className = "" }: { label: string; k: SortKey; cur: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void; className?: string }) {
  const active = cur === k;
  return (
    <button onClick={() => onClick(k)} className={`flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-[#F07800]" : ""} ${className}`} data-testid={`ni-sort-${k}`}>
      {label}
      <ArrowUpDown className="h-3 w-3" style={{ opacity: active ? 1 : 0.3 }} />
    </button>
  );
}
