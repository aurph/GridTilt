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
  LineChart,
  Line,
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

// Distinct, dark-mode-friendly line/chip colors per model (GridTilt orange leads).
const MODEL_COLOR: Record<string, string> = {
  GB200: "#F07800",
  B300: "#F0A500",
  B200: "#FFD166",
  H200: "#4dabf7",
  GH200: "#22b8cf",
  H100: "#51cf66",
  A100: "#94d82d",
  MI355X: "#e64980",
  MI325X: "#cc5de8",
  MI300X: "#ff8787",
};
const colorFor = (m: string) => MODEL_COLOR[m] ?? "#9ca3af";

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
function fmtChange(v: number | null): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
// Renter-side convention: pricier = red, cheaper = green.
function changeColor(v: number | null): string {
  if (v === null) return "#6b7280";
  if (v > 0) return "#f87171";
  if (v < 0) return "#4ade80";
  return "#9ca3af";
}

type SortKey = "current" | "model" | "w1" | "m1" | "ytd" | "y1";

export default function NeocloudIntel() {
  const { data, isLoading, isError } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });
  const [visible, setVisible] = useState<Set<string> | null>(null); // null = all
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = data?.rows ?? [];
  const isShown = (m: string) => visible === null || visible.has(m);

  function toggleModel(m: string) {
    setVisible((prev) => {
      const base = prev ?? new Set(rows.map((r) => r.model));
      const next = new Set(base);
      if (next.has(m)) next.delete(m); else next.add(m);
      if (next.size === rows.length) return null; // all selected -> "all"
      return next;
    });
  }

  // Build merged multi-series chart data: one row per date, a price per model.
  const chartData = useMemo(() => {
    const shown = rows.filter((r) => isShown(r.model));
    const dates = Array.from(new Set(shown.flatMap((r) => r.series.map((p) => p.date)))).sort();
    return dates.map((date) => {
      const o: Record<string, number | string | null> = { date };
      for (const r of shown) {
        const p = r.series.find((s) => s.date === date);
        o[r.model] = p ? p.price : null;
      }
      return o;
    });
  }, [rows, visible]);

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
              On-demand GPU rental prices ($/GPU/hr) blended across the major neoclouds and marketplaces.
              The headline price is a sourced blended estimate (flagged <span className="text-[#F0A500]">est.</span>);
              low and high are the observed marketplace range. History is sparse sourced anchor points and fills
              with a consistent daily series over time. Cheaper is <span className="text-[#4ade80]">green</span>, pricier is <span className="text-[#f87171]">red</span>.
            </p>
          </div>
          <div className="text-[11px] text-muted-foreground/70 font-mono tracking-wide text-right space-y-0.5" data-testid="ni-sync">
            {data?.lastRefreshed && <div className="text-muted-foreground/60">last sync {data.lastRefreshed}</div>}
            {data && <div>{data.modelCount} models · fleet avg {fmtUsd(data.fleetAvg)}/hr</div>}
            <Link href="/compute-frontier" className="text-[#F07800] hover:text-[#F0A500]">Compute Frontier →</Link>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-4">
        {/* Headline price cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="ni-cards">
          {isLoading
            ? Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-20" />)
            : sortedRows.map((r) => (
                <Card key={r.model} className="border-card-border p-3 relative overflow-hidden" data-testid={`ni-card-${r.model}`}>
                  <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: colorFor(r.model) }} />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold" style={{ color: colorFor(r.model) }}>{r.model}</span>
                    <span className="text-[9px] font-mono text-muted-foreground/50">{r.vendor}</span>
                  </div>
                  <div className="text-lg font-semibold tabular-nums text-foreground mt-1">
                    {fmtUsd(r.current)}
                    {r.estimated.includes("currentUsdPerHr") && <span className="ml-1 text-[8px] font-mono uppercase text-[#F0A500]/80 align-top">est.</span>}
                  </div>
                  <div className="text-[10px] font-mono" style={{ color: changeColor(r.changes.y1) }}>
                    {r.changes.y1 === null ? <span className="text-muted-foreground/40">1Y —</span> : `${fmtChange(r.changes.y1)} 1Y`}
                  </div>
                </Card>
              ))}
        </div>

        {/* Model filter chips */}
        {data && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="ni-chips">
            <button
              onClick={() => setVisible(null)}
              className={`px-2.5 py-1 rounded text-xs font-mono border transition-colors ${visible === null ? "border-[#F07800] text-[#F07800] bg-[#F07800]/10" : "border-white/[0.08] text-muted-foreground hover:text-foreground"}`}
              data-testid="ni-chip-all"
            >
              All
            </button>
            {rows.map((r) => {
              const on = isShown(r.model);
              return (
                <button
                  key={r.model}
                  onClick={() => toggleModel(r.model)}
                  className="px-2.5 py-1 rounded text-xs font-mono border transition-colors"
                  style={{
                    borderColor: on ? colorFor(r.model) : "rgba(255,255,255,0.08)",
                    color: on ? colorFor(r.model) : "#777",
                    background: on ? `${colorFor(r.model)}14` : "transparent",
                  }}
                  data-testid={`ni-chip-${r.model}`}
                >
                  {r.model}
                </button>
              );
            })}
          </div>
        )}

        {/* Chart */}
        <Card className="border-card-border p-3" data-testid="ni-chart">
          {isLoading ? (
            <Skeleton className="h-[360px] w-full" />
          ) : isError || rows.length === 0 ? (
            <div className="h-[360px] flex items-center justify-center text-xs text-muted-foreground" data-testid="ni-chart-empty">
              {isError ? "Price index unavailable." : "No price data."}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#999" }} stroke="#333" minTickGap={24} />
                <YAxis
                  scale="log"
                  domain={[0.5, "auto"]}
                  allowDataOverflow
                  ticks={[0.5, 1, 2, 3, 5, 10, 20]}
                  tick={{ fontSize: 10, fill: "#777" }}
                  stroke="#333"
                  tickFormatter={(v) => `$${v}`}
                  width={40}
                />
                <RTooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--card-border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [`$${v.toFixed(2)}/hr`, name]}
                />
                {rows.filter((r) => isShown(r.model)).map((r) => (
                  <Line key={r.model} type="monotone" dataKey={r.model} stroke={colorFor(r.model)} strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">$/GPU/hr, log scale · history = sparse sourced anchors, fills daily forward</p>
        </Card>

        {/* Weighted price index table */}
        <Card className="border-card-border overflow-hidden" data-testid="ni-table">
          <div className="px-4 py-2 bg-[#0E0E0C] border-b border-border">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Weighted Price Index</span>
          </div>
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-[#0E0E0C]/60 border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <SortHeader label="Model" k="model" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-3" />
            <SortHeader label="Avg" k="current" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2 justify-end" />
            <SortHeader label="1W" k="w1" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <SortHeader label="1M" k="m1" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <SortHeader label="YTD" k="ytd" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2 justify-end" />
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
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs hover:bg-[#F07800]/5 cursor-help" data-testid={`ni-row-${r.model}`}>
                    <span className="col-span-3 font-mono font-semibold flex items-center gap-1.5" style={{ color: colorFor(r.model) }}>
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: colorFor(r.model) }} />
                      {r.model}
                    </span>
                    <span className="col-span-2 font-mono text-foreground text-right tabular-nums">
                      {fmtUsd(r.current)}{r.estimated.includes("currentUsdPerHr") && <span className="ml-0.5 text-[8px] text-[#F0A500]/70">est.</span>}
                    </span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.w1) }}>{fmtChange(r.changes.w1)}</span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.m1) }}>{fmtChange(r.changes.m1)}</span>
                    <span className="col-span-2 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.ytd) }}>{fmtChange(r.changes.ytd)}</span>
                    <span className="col-span-1 font-mono text-right tabular-nums" style={{ color: changeColor(r.changes.y1) }}>{fmtChange(r.changes.y1)}</span>
                    <span className="col-span-2 font-mono text-muted-foreground text-right tabular-nums text-[11px]">${r.low}-${r.high}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md p-3">
                  <div className="text-xs font-semibold mb-1">{r.model} · {r.vendor} · {fmtUsd(r.current)}/GPU-hr</div>
                  <p className="text-[11px] text-muted-foreground">
                    Short-window changes (1W/1M/YTD) read "—" until the daily recorder accrues enough history; 1Y is from sourced anchors.
                  </p>
                </TooltipContent>
              </UITooltip>
            ))
          )}
        </Card>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed px-1" data-testid="ni-methodology">
          {data?.methodology ?? "Blended on-demand rental prices from public neocloud and marketplace listings and the getdeploying.com / Silicon Data trackers."}
          {" "}Sources are listed per model in <span className="font-mono">server/data/gpu-rental-prices.json</span>. Prices move constantly and vary widely by provider, term, and availability; treat these as indicative, not quotes.
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
