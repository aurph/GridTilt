import { useQuery } from "@tanstack/react-query";
import { Profiler, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMeasuredWidth } from "@/lib/use-measured-width";

// Supply-chain flow view (consolidation): lazy so the d3 sim only loads
// when the flow tab is opened.
const SupplyChainFlow = lazy(() => import("@/pages/SupplyChain"));
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Cpu, Server, Zap, TrendingUp, TrendingDown, Info, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { AsOf, ErrorState } from "@/components/Freshness";
import { PageHeader, HeaderStat } from "@/components/PageHeader";
import { BRAND, CATEGORY_COLORS, CHART_CHROME, INK, SEMANTIC } from "@/lib/tokens";
import { axisProps, gridProps } from "@/lib/chart-theme";
import { sparklineDomain } from "@/lib/gpu-series";
import { fetchJson } from "@/lib/queryClient";
import { SortableTh } from "@/components/sortable-table";
import { nextSort } from "@/lib/table-sort";
import {
  buildHeatmapInput,
  heatColor,
  heatTextColor,
  layoutHeatmap,
  marketCapOf,
  pctFromSparkline,
  sortTableRows,
  windowDirection,
  type HeatGroupRect,
  type HeatRect,
  type TableSortKey,
} from "@/lib/stack-transforms";

interface StockData {
  ticker: string;
  name: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  pe: number | null;
  revenueGrowth: number | null;
  sparkline?: number[];
  marketCapDisplay?: string;
  marketCap?: number | null;
  marketState?: string | null;
  previousClose?: number | null;
  powerMW?: number;
  vs_sp500?: number;
  stale?: boolean;
}

interface CorrelationPoint {
  uranium: number;
  ccj: number;
}

const LAYER_KEYS = [
  "compute", "nuclear", "uranium", "powerHardware", "utilities", "dataCenters",
  "construction", "rawMaterialsMining", "rawMaterialsNatGas", "renewableGeneration",
  "transmissionGrid", "cryptoAIDC", "etfsBenchmarks",
] as const;

interface StackData {
  compute: StockData[];
  nuclear: StockData[];
  uranium: StockData[];
  powerHardware: StockData[];
  utilities: StockData[];
  dataCenters: StockData[];
  construction: StockData[];
  rawMaterialsMining: StockData[];
  rawMaterialsNatGas: StockData[];
  renewableGeneration: StockData[];
  transmissionGrid: StockData[];
  cryptoAIDC: StockData[];
  etfsBenchmarks: StockData[];
  correlation: CorrelationPoint[];
  correlationCoeff: number | null;
  cegCorrelationCoeff: number | null;
  correlationMeta: { weeks: number; proxyTicker: string; asOf: string } | null;
}

/**
 * Honest sparkline (Lake 3A), raw SVG - no Recharts instance per card.
 * - y-domain = [windowLow, windowHigh] of the sparkline's own window with
 *   10% padding. Never zero-based, never global.
 * - Color = net direction of the window itself, not today's quote change.
 * - Faint reference line at prior close (1D) / window open (5D, 1M) so shape
 *   reads as above/below the baseline. Clamped to the edge with a marker
 *   when the whole window sits beyond it.
 * - Defined empty state - no decorative flat lines for missing data.
 */
function Sparkline({ data, refValue, refLabel, height = 40 }: { data: number[] | undefined; refValue: number | null; refLabel: string; height?: number }) {
  const W = 220; // viewBox units; SVG stretches to container width
  const H = height;
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-sm border border-dashed border-subtle text-9 text-muted-foreground/50 select-none"
        style={{ height }}
        data-testid="sparkline-empty"
      >
        no intraday data
      </div>
    );
  }
  const values = data.filter((v) => Number.isFinite(v));
  const geom = sparklineDomain(values);
  if (!geom) return <div style={{ height }} />;
  const [d0, d1] = geom.domain;
  const dir = windowDirection(values);
  const color = dir === "up" ? SEMANTIC.positiveDeep : dir === "down" ? SEMANTIC.negativeDeep : INK.muted;
  const x = (i: number) => (values.length === 1 ? W / 2 : (i / (values.length - 1)) * W);
  const y = (v: number) => H - 2 - ((v - d0) / (d1 - d0)) * (H - 4);
  const refInside = refValue !== null && refValue >= d0 && refValue <= d1;
  const refY = refValue === null ? null : refInside ? y(refValue) : refValue > d1 ? 2 : H - 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="w-full block"
      style={{ height }}
      role="img"
      aria-label={`price sparkline, window ${dir ?? "unknown"}`}
    >
      {refY !== null && (
        <line
          x1={0}
          x2={W}
          y1={refY}
          y2={refY}
          stroke={INK.muted}
          strokeWidth={1}
          strokeDasharray="3 4"
          opacity={refInside ? 0.45 : 0.25}
          vectorEffect="non-scaling-stroke"
        >
          <title>{refLabel}{refInside ? "" : refValue! > d1 ? " (above window)" : " (below window)"}</title>
        </line>
      )}
      {values.length === 1 ? (
        <circle cx={W / 2} cy={y(values[0])} r={2.5} fill={color} />
      ) : (
        <polyline
          points={values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

/** Reference value + label for the sparkline baseline by timeframe. */
function sparkRef(stock: StockData, timeframe: Timeframe): { value: number | null; label: string } {
  if (timeframe === "1D") {
    const prev =
      stock.previousClose ??
      (typeof stock.change === "number" && Number.isFinite(stock.price) ? stock.price - stock.change : null);
    return { value: prev, label: `prior close ${prev !== null ? `$${prev.toFixed(2)}` : ""}` };
  }
  const first = stock.sparkline?.find((v) => Number.isFinite(v)) ?? null;
  return { value: first, label: `window open ${first !== null ? `$${first.toFixed(2)}` : ""}` };
}

function StaleBadge({ ticker }: { ticker: string }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1 rounded-sm border border-brand-2/30 bg-brand-2/10 px-1.5 py-0 text-10 text-brand-2/90 leading-4"
          data-testid={`stale-indicator-${ticker}`}
        >
          <Clock className="h-2.5 w-2.5" />
          delayed
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[220px]">
        Live quote temporarily unavailable, retrying
      </TooltipContent>
    </UITooltip>
  );
}

function marketStateLabel(state: string): string {
  if (state.startsWith("PRE")) return "pre-market";
  if (state.startsWith("POST")) return "after-hours";
  if (state === "CLOSED") return "market closed";
  return "live";
}

/**
 * Per-ticker market-state marker, shown ONLY when a ticker's state differs
 * from the page majority - the majority state renders once in the header
 * instead of repeating on every row.
 */
function MarketStateBadge({ state, majority }: { state: string | null | undefined; majority: string | null }) {
  if (!state || state === majority) return null;
  const label = state.startsWith("PRE") ? "pre" : state.startsWith("POST") ? "post" : state === "REGULAR" ? "live" : "closed";
  return (
    <span className="text-8 px-1 rounded-sm border border-subtle text-muted-foreground/70" title={`this ticker: ${marketStateLabel(state)} (differs from the rest of the page)`}>
      {label}
    </span>
  );
}

/** Most common marketState across all tickers, for the page-level chip. */
function majorityMarketState(data: StackData | undefined, layerKeys: readonly string[]): string | null {
  if (!data) return null;
  const counts = new Map<string, number>();
  for (const k of layerKeys) {
    for (const s of ((data as any)[k] as StockData[] | undefined) ?? []) {
      if (s.marketState) counts.set(s.marketState, (counts.get(s.marketState) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let n = 0;
  counts.forEach((v, k) => {
    if (v > n) { best = k; n = v; }
  });
  return best;
}

/** P/E cell contents with defined states: N/A and negative are explicit. */
function peCell(pe: number | null): { text: string; className: string; title: string } {
  if (pe === null || !Number.isFinite(pe)) return { text: "—", className: "text-muted-foreground/50", title: "No P/E: unprofitable or not reported" };
  if (pe < 0) return { text: pe.toFixed(1), className: "text-negative", title: "Negative P/E: trailing earnings are negative" };
  return { text: pe.toFixed(1), className: "text-foreground", title: "Trailing P/E" };
}

function revGrowthCell(rg: number | null): { text: string; className: string; title: string } {
  if (rg === null || !Number.isFinite(rg)) return { text: "—", className: "text-muted-foreground/50", title: "Revenue growth not reported" };
  const cls = rg > 0 ? "text-positive" : rg < 0 ? "text-negative" : "text-muted-foreground";
  return { text: `${rg > 0 ? "+" : ""}${rg.toFixed(1)}%`, className: cls, title: "Revenue growth YoY" };
}

function StockCard({ stock, timeframe, majorityState }: { stock: StockData; timeframe: Timeframe; majorityState: string | null }) {
  if (!stock || stock.price == null) return null;
  const isStale = stock.stale || stock.changePercent == null;
  const isUp = !isStale && (stock.changePercent as number) >= 0;
  const isDown = !isStale && (stock.changePercent as number) < -2;
  const pe = peCell(stock.pe);
  const rg = revGrowthCell(stock.revenueGrowth);
  const ref = sparkRef(stock, timeframe);
  const liveCapB = marketCapOf(stock);
  return (
    <Card
      // sharp losers (< -2%) get a red left rail; card surface stays clean (the old bg wash + inset glow read muddy)
      className={`p-4 border-card-border transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${isDown ? "border-l-2 border-l-negative/70" : ""} ${isStale ? "opacity-80" : ""}`}
      data-testid={`stock-card-${stock.ticker}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground font-mono">{stock.ticker}</span>
            {isStale ? (
              <StaleBadge ticker={stock.ticker} />
            ) : (
              <span className={`font-mono text-xs font-semibold tabular-nums ${isUp ? "text-positive" : "text-negative"}`}>
                {isUp ? "+" : ""}{(stock.changePercent as number).toFixed(2)}%
              </span>
            )}
            <MarketStateBadge state={stock.marketState} majority={majorityState} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[150px]">{stock.name}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono">
            {liveCapB !== null ? `$${fmtCapB(liveCapB)}` : stock.marketCapDisplay ?? "—"} mkt cap
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-sm text-foreground font-mono">${stock.price.toFixed(2)}</p>
          <p className={`text-xs font-mono ${isStale ? "text-muted-foreground" : isUp ? "text-positive" : "text-negative"}`}>
            {isStale || stock.change === null ? "—" : `${isUp ? "+" : ""}${stock.change.toFixed(2)}`}
          </p>
        </div>
      </div>

      <div className="mb-2">
        <Sparkline data={stock.sparkline} refValue={ref.value} refLabel={ref.label} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted/40 rounded-sm p-2">
          <p className="text-muted-foreground mb-0.5">P/E Ratio</p>
          <p className={`font-semibold font-mono ${pe.className}`} title={pe.title}>{pe.text}</p>
        </div>
        <div className="bg-muted/40 rounded-sm p-2">
          <p className="text-muted-foreground mb-0.5">Rev Growth YoY</p>
          <p className={`font-semibold font-mono ${rg.className}`} title={rg.title}>{rg.text}</p>
        </div>
      </div>
    </Card>
  );
}

/** $B number -> "3.2T" / "850B" / "500M" style display. */
function fmtCapB(capB: number): string {
  if (capB >= 1000) return `${(capB / 1000).toFixed(1)}T`;
  if (capB >= 1) return `${capB.toFixed(0)}B`;
  return `${Math.round(capB * 1000)}M`;
}

function StockCardSkeleton() {
  return (
    <Card className="p-4 border-card-border space-y-3">
      <div className="flex justify-between">
        <div className="space-y-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-16" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12 w-full rounded-sm" />
        <Skeleton className="h-12 w-full rounded-sm" />
      </div>
    </Card>
  );
}

const CustomScatterTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-card-border rounded-lg p-3 text-xs shadow-xl">
        <p className="text-muted-foreground">SRUUF: <span className="text-foreground font-mono font-medium">${payload[0]?.value?.toFixed(2)}</span></p>
        <p className="text-muted-foreground">CCJ: <span className="text-foreground font-mono font-medium">${payload[1]?.value?.toFixed(2)}</span></p>
      </div>
    );
  }
  return null;
};

// Compute OLS regression line + confidence band from scatter data
function computeRegression(points: { uranium: number; ccj: number }[]) {
  if (!points || points.length < 3) return { line: [], upper: [], lower: [] };
  const n = points.length;
  const xs = points.map((p) => p.uranium);
  const ys = points.map((p) => p.ccj);
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  const sxy = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const residuals = xs.map((x, i) => ys[i] - (slope * x + intercept));
  const se = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (n - 2));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const steps = 30;
  const line = [];
  const upper = [];
  const lower = [];
  for (let i = 0; i <= steps; i++) {
    const x = minX + ((maxX - minX) * i) / steps;
    const fit = slope * x + intercept;
    line.push({ uranium: parseFloat(x.toFixed(2)), ccj: parseFloat(fit.toFixed(2)) });
    upper.push({ uranium: parseFloat(x.toFixed(2)), ccj: parseFloat((fit + 1.5 * se).toFixed(2)) });
    lower.push({ uranium: parseFloat(x.toFixed(2)), ccj: parseFloat((fit - 1.5 * se).toFixed(2)) });
  }
  return { line, upper, lower };
}

type Timeframe = "1D" | "5D" | "1M";
type SortBy = "change" | "marketcap" | "alpha";

/**
 * ?perf=1 harness: accumulates React commit durations for this page into
 * data-stack-render-ms on <html>, so headless Chrome can read the number
 * via --dump-dom. Used for the Lake 3 before/after perf audit.
 */
function PerfProfiler({ children }: { children: ReactNode }) {
  const enabled = typeof window !== "undefined" && window.location.search.includes("perf=1");
  if (!enabled) return <>{children}</>;
  return (
    <Profiler
      id="stack"
      onRender={(_id, _phase, actualDuration) => {
        const w = window as unknown as { __stackRenderMs?: number };
        w.__stackRenderMs = (w.__stackRenderMs ?? 0) + actualDuration;
        document.documentElement.dataset.stackRenderMs = String(Math.round(w.__stackRenderMs));
      }}
    >
      {children}
    </Profiler>
  );
}

function sortStocks(stocks: StockData[], sortBy: SortBy): StockData[] {
  if (!stocks) return [];
  const arr = [...stocks];
  if (sortBy === "change") return arr.sort((a, b) => {
    const av = typeof a.changePercent === "number" ? a.changePercent : -Infinity;
    const bv = typeof b.changePercent === "number" ? b.changePercent : -Infinity;
    return bv - av;
  });
  if (sortBy === "alpha") return arr.sort((a, b) => a.ticker.localeCompare(b.ticker));
  // marketCapOf fixes the old parseM bug where $50M sorted equal to $50B
  if (sortBy === "marketcap") return arr.sort((a, b) => (marketCapOf(b) ?? -1) - (marketCapOf(a) ?? -1));
  return arr;
}

type ViewMode = "cards" | "table" | "heatmap" | "flow";
const VIEW_LS_KEY = "gridtilt.stack.view";
const VIEW_MODES: ViewMode[] = ["heatmap", "cards", "table", "flow"];

function readStoredView(): ViewMode {
  // URL param wins (the /supply-chain redirect lands on /stack?view=flow),
  // then the persisted preference.
  try {
    const q = new URLSearchParams(window.location.search).get("view");
    if (q && (VIEW_MODES as string[]).includes(q)) return q as ViewMode;
    const v = window.localStorage.getItem(VIEW_LS_KEY);
    return v && (VIEW_MODES as string[]).includes(v) ? (v as ViewMode) : "heatmap";
  } catch {
    return "heatmap";
  }
}

const fetchStack = (tf: string) => () => fetchJson<StackData>(`/api/stack?timeframe=${tf}`);

export default function TheStack() {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [sortBy, setSortBy] = useState<SortBy>("change");
  const [view, setView] = useState<ViewMode>(readStoredView);
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_LS_KEY, view);
    } catch {}
  }, [view]);

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<StackData>({
    queryKey: ["/api/stack", timeframe],
    queryFn: fetchStack(timeframe),
    refetchInterval: 900000,
  });

  // Table view shows 1D/5D/1M side by side; the extra windows fetch lazily
  // (same endpoint the timeframe toggle already hits; server caches 10 min).
  const { data: data5D } = useQuery<StackData>({
    queryKey: ["/api/stack", "5D"],
    queryFn: fetchStack("5D"),
    refetchInterval: 900000,
    enabled: view === "table",
  });
  const { data: data1M } = useQuery<StackData>({
    queryKey: ["/api/stack", "1M"],
    queryFn: fetchStack("1M"),
    refetchInterval: 900000,
    enabled: view === "table",
  });

  const regression = useMemo(
    () => computeRegression(data?.correlation ?? []),
    [data?.correlation]
  );

  const majorityState = useMemo(
    () => majorityMarketState(data, LAYER_KEYS),
    [data],
  );

  const layerConfig = [
    {
      key: "compute",
      title: "Compute Layer",
      icon: Cpu,
      color: CATEGORY_COLORS.compute,
      description: "AI chips, hyperscalers, and the foundries powering model training.",
      tooltip: "NVIDIA's H100/B200 GPUs power virtually every major AI training cluster. TSMC manufactures all advanced AI chips. Hyperscalers (MSFT, GOOGL, META, AMZN) are both the largest compute consumers and primary drivers of data center power demand.",
    },
    {
      key: "nuclear",
      title: "Nuclear Power",
      icon: Zap,
      color: CATEGORY_COLORS.nuclear,
      description: "Nuclear operators, SMR developers, and advanced reactor companies.",
      tooltip: "AI requires uninterruptible clean baseload. Microsoft restarted Three Mile Island. Amazon co-located with Talen's Susquehanna plant. Oklo has a 14 GW DC customer pipeline. BWXT is the sole US naval reactor manufacturer.",
    },
    {
      key: "uranium",
      title: "Uranium & Fuel Cycle",
      icon: Zap,
      color: CATEGORY_COLORS.uranium,
      description: "Uranium miners and fuel cycle companies supplying the nuclear renaissance.",
      tooltip: "Uranium spot ~$92/lb (Mar 2026). Cameco is the largest public miner with direct spot beta. NexGen's Rook I is the highest-grade undeveloped uranium deposit. Centrus is the only US-licensed HALEU producer.",
    },
    {
      key: "powerHardware",
      title: "Power Hardware",
      icon: Server,
      color: CATEGORY_COLORS.power,
      description: "Transformers, switchgear, cooling, and electrical equipment.",
      tooltip: "GE Vernova's turbine order book leads DC buildout pace. Eaton is at max switchgear/transformer capacity. Vertiv is the fastest-growing power/cooling infrastructure company. Transformer shortages remain the primary bottleneck on DC energization.",
    },
    {
      key: "utilities",
      title: "Utilities",
      icon: Zap,
      color: CATEGORY_COLORS.utilities,
      description: "Utilities signing long-term power agreements with hyperscalers.",
      tooltip: "Dominion serves Northern Virginia (70% of global internet traffic). NextEra signed a 2.5 GW deal with Meta. Southern Company's Georgia territory is the center of Southeast DC growth. Regulated utilities benefit from structurally rising electricity demand.",
    },
    {
      key: "dataCenters",
      title: "Data Centers",
      icon: Server,
      color: CATEGORY_COLORS.datacenters,
      description: "REITs and colocation operators. Direct proxies for AI capacity buildout.",
      tooltip: "Equinix operates 273 data centers across 77 markets. Digital Realty has 300+ facilities globally. IREN is pivoting from Bitcoin mining to GPU-as-a-Service. Power contracts and land-bank are the critical metrics.",
    },
    {
      key: "construction",
      title: "Construction & EPC",
      icon: Server,
      color: CATEGORY_COLORS.construction,
      description: "Electrical contractors and engineers building grid connections for AI campuses.",
      tooltip: "Quanta is the largest electrical utility contractor in North America, building transmission lines and substations for DC campuses. EMCOR has a record $4.3B backlog. Sterling Infrastructure has 125% YoY DC revenue growth.",
    },
    {
      key: "rawMaterialsMining",
      title: "Raw Materials - Mining & Metals",
      icon: Server,
      color: INK.secondary, // periphery tier: gray = supporting layer, hues are reserved for the 10 thesis layers
      description: "Copper, steel, and rare earth producers supplying data center and grid buildout.",
      tooltip: "Copper is the essential conductor in every transformer, busbar, and cable connecting grid to rack. Steel is the structural backbone of data center campuses. Rare earths power wind turbines and EV motors in the energy transition.",
    },
    {
      key: "rawMaterialsNatGas",
      title: "Raw Materials - Natural Gas",
      icon: Zap,
      color: CATEGORY_COLORS.gas,
      description: "Natural gas producers fueling bridge power generation for data centers.",
      tooltip: "Gas-fired generation is the bridge fuel while nuclear and renewables scale. Appalachian and Haynesville producers benefit from rising gas demand as hyperscalers seek reliable, dispatchable power generation capacity.",
    },
    {
      key: "renewableGeneration",
      title: "Renewable Generation",
      icon: Zap,
      color: CATEGORY_COLORS.renewables,
      description: "Solar manufacturers and renewable energy companies powering clean data center commitments.",
      tooltip: "Hyperscalers have committed to 100% renewable energy targets. First Solar is the largest US panel maker. AES has signed multi-GW PPAs with Google and Microsoft. Solar and wind are the fastest-growing power sources for data center operations.",
    },
    {
      key: "transmissionGrid",
      title: "Transmission & Grid Hardware",
      icon: Server,
      color: CATEGORY_COLORS.grid,
      description: "Wire, generators, and grid equipment connecting power to data center campuses.",
      tooltip: "Every data center requires extensive copper wiring (Encore Wire), backup generators (Generac), and electrical infrastructure. Grid interconnection is the bottleneck for new data center energization timelines.",
    },
    {
      key: "cryptoAIDC",
      title: "Crypto/AI DC Operators",
      icon: Cpu,
      color: INK.secondary, // periphery tier (non-adjacent to mining in display order, always labeled)
      description: "Bitcoin miners pivoting infrastructure and power contracts toward AI/HPC hosting.",
      tooltip: "CleanSpark and MARA Holdings are the largest public Bitcoin miners exploring AI/HPC hosting. Their existing power contracts, cooling infrastructure, and facility footprints are directly transferable to GPU-as-a-Service operations.",
    },
    {
      key: "etfsBenchmarks",
      title: "ETF Benchmarks",
      icon: TrendingUp,
      color: INK.muted, // benchmarks are neutral, not a category
      description: "Sector ETFs for uranium, data centers, grid infrastructure, and utilities.",
      tooltip: "URA and URNM track uranium mining. DTCR tracks data center/digital infrastructure. GRID tracks smart grid companies. XLU tracks utilities. Compare individual picks against these benchmarks.",
    },
  ];

  return (
    <PerfProfiler>
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="Equity Heatmap"
        testId="stack-header"
        about="100+ equities across 13 layers of the AI power supply chain, with intraday prices from Yahoo Finance. Cards, table, heatmap, and supply-chain flow views."
        stats={<HeaderStat label="Equities" value="100" valueClass="text-foreground" />}
        right={
          <>
            {majorityState && majorityState !== "REGULAR" && (
              <Badge className="bg-muted/40 text-muted-foreground border-border text-xs" data-testid="market-state-chip">
                {marketStateLabel(majorityState)}
              </Badge>
            )}
            <Badge className="bg-brand-2/15 text-brand-2 border-brand-2/30 text-xs">
              Yahoo Finance{majorityState === "REGULAR" ? " · Live" : ""}
            </Badge>
            <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
          </>
        }
        controls={
          <div className="flex flex-wrap items-center gap-4">
          {/* View toggle (persisted per user) */}
          <div className="flex items-center gap-1 bg-muted/30 rounded-md p-0.5 border border-card-border">
            {VIEW_MODES.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                data-testid={`view-${v}`}
                className={`px-3 py-1 text-xs font-semibold capitalize rounded transition-all ${
                  view === v ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Timeframe applies to price views, not the supply-chain flow */}
          {view !== "flow" && (
            <>
              <div className="w-px h-5 bg-border" />
              <div className="flex items-center gap-1 bg-muted/30 rounded-md p-0.5 border border-card-border">
                {(["1D", "5D", "1M"] as Timeframe[]).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    data-testid={`timeframe-${tf.toLowerCase()}`}
                    className={`px-3 py-1 text-xs font-semibold capitalize rounded transition-all ${
                      timeframe === tf
                        ? "bg-brand text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Sort toggle - cards view only; table sorts by column, heatmap by size */}
          {view === "cards" && (
            <>
              <div className="w-px h-5 bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sort by</span>
                <div className="flex items-center gap-1 bg-muted/30 rounded-md p-0.5 border border-card-border">
                  {([
                    { id: "change", label: "% Change" },
                    { id: "marketcap", label: "Mkt Cap" },
                    { id: "alpha", label: "Alphabetical" },
                  ] as { id: SortBy; label: string }[]).map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setSortBy(opt.id)}
                      data-testid={`sort-${opt.id}`}
                      className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                        sortBy === opt.id
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          </div>
        }
      />

      <div className="flex-1 p-6 space-y-8">
        {view === "cards" &&
          layerConfig.map((layer) => {
            const stocks = (data as any)?.[layer.key] as StockData[] | undefined;
            return (
              // content-visibility virtualizes off-screen layer sections:
              // render/layout/paint are skipped until scrolled near.
              <div key={layer.key} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 560px" }}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${layer.color}18`, border: `1px solid ${layer.color}30` }}
                  >
                    <layer.icon className="h-4 w-4" style={{ color: layer.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-foreground">{layer.title}</h2>
                      <UITooltip>
                        <TooltipTrigger>
                          <Info className="h-3.5 w-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="text-xs leading-relaxed">{layer.tooltip}</p>
                        </TooltipContent>
                      </UITooltip>
                    </div>
                    <p className="text-xs text-muted-foreground">{layer.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {isError ? (
                    <ErrorState label="Unable to load equities data" onRetry={() => refetch()} className="col-span-full" />
                  ) : isLoading
                    ? Array(4).fill(null).map((_, i) => <StockCardSkeleton key={i} />)
                    : (stocks ?? []).length === 0 ? (
                      <div className="col-span-full py-4">
                        <p className="text-xs text-muted-foreground text-center">No equities in this layer</p>
                      </div>
                    ) : sortStocks(stocks ?? [], sortBy).map((stock) => (
                        <StockCard key={stock.ticker} stock={stock} timeframe={timeframe} majorityState={majorityState} />
                      ))}
                </div>
              </div>
            );
          })}

        {view === "table" && (
          <StackTable
            layers={layerConfig}
            data={data}
            data5D={data5D}
            data1M={data1M}
            isLoading={isLoading}
            isError={isError}
            majorityState={majorityState}
            onRetry={() => refetch()}
          />
        )}

        {view === "heatmap" && (
          <StackHeatmap layers={layerConfig} data={data} timeframe={timeframe} isLoading={isLoading} isError={isError} onRetry={() => refetch()} />
        )}

        {view === "flow" && (
          <Suspense fallback={<Skeleton className="h-[560px] w-full" />}>
            <SupplyChainFlow embedded />
          </Suspense>
        )}

        {/* Uranium vs CCJ Correlation scatter (price views only) */}
        <div className={view === "flow" ? "hidden" : undefined}>
          <Card className="p-6 border-card-border">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-semibold text-foreground">Uranium Proxy vs. CCJ Correlation</h2>
                  <UITooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs leading-relaxed">CCJ is the largest public uranium miner with the highest direct spot price beta. CEG (utility) is influenced by electricity contracts and regulated returns. CCJ = commodity bet, CEG = infrastructure bet.</p>
                    </TooltipContent>
                  </UITooltip>
                </div>
                <p className="text-xs text-muted-foreground">Weekly closes, trailing year: SRUUF (Sprott Physical Uranium Trust, a physical uranium fund) vs. CCJ. Each dot = one week.{data?.correlationMeta ? ` ${data.correlationMeta.weeks} weeks paired.` : ""}</p>
              </div>
              <div className="flex items-center gap-6">
                {data?.correlationCoeff !== undefined && data?.correlationCoeff !== null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">CCJ Pearson r</p>
                    <p className="text-2xl font-bold font-mono text-brand-2">{data.correlationCoeff.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.correlationCoeff > 0.7 ? "Strong" : data.correlationCoeff > 0.4 ? "Moderate" : "Weak"} correlation
                    </p>
                  </div>
                )}
                {data?.cegCorrelationCoeff !== undefined && data?.cegCorrelationCoeff !== null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">CEG Pearson r</p>
                    <p className="text-2xl font-bold font-mono text-foreground">{data.cegCorrelationCoeff.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">Utility beta</p>
                  </div>
                )}
              </div>
            </div>

            {isError ? (
              <ErrorState label="Unable to load correlation data" onRetry={() => refetch()} />
            ) : isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (data?.correlation ?? []).length === 0 ? (
              // Real data or nothing: when the weekly-close fetch fails the
              // server sends an empty set, never invented dots.
              <ErrorState label="Correlation data unavailable from the price source. It retries on the next refresh." onRetry={() => refetch()} className="h-[260px]" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={260}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 24, left: 10 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis
                      {...axisProps}
                      dataKey="uranium"
                      type="number"
                      name="Uranium"
                      domain={["auto", "auto"]}
                      label={{ value: "SRUUF weekly close ($)", position: "insideBottom", offset: -10, fill: CHART_CHROME.tick, fontSize: 11 }}
                    />
                    <YAxis
                      {...axisProps}
                      dataKey="ccj"
                      type="number"
                      name="CCJ"
                      domain={["auto", "auto"]}
                      axisLine={false}
                      label={{ value: "CCJ ($)", angle: -90, position: "insideLeft", offset: 10, fill: CHART_CHROME.tick, fontSize: 11 }}
                    />
                    <Tooltip content={<CustomScatterTooltip />} />
                    {/* Upper confidence band */}
                    <Scatter
                      data={regression.upper}
                      fill="none"
                      line={{ stroke: BRAND.secondary, strokeWidth: 1, strokeDasharray: "5 4", strokeOpacity: 0.35 }}
                      shape={() => null as any}
                      legendType="none"
                      name="Upper Band"
                    />
                    {/* Lower confidence band */}
                    <Scatter
                      data={regression.lower}
                      fill="none"
                      line={{ stroke: BRAND.secondary, strokeWidth: 1, strokeDasharray: "5 4", strokeOpacity: 0.35 }}
                      shape={() => null as any}
                      legendType="none"
                      name="Lower Band"
                    />
                    {/* OLS regression line */}
                    <Scatter
                      data={regression.line}
                      fill="none"
                      line={{ stroke: BRAND.secondary, strokeWidth: 2, strokeOpacity: 0.85 }}
                      shape={() => null as any}
                      legendType="none"
                      name="OLS Fit"
                    />
                    {/* Raw scatter dots */}
                    <Scatter
                      data={data?.correlation ?? []}
                      fill={BRAND.secondary}
                      opacity={0.65}
                      r={4}
                      name="Weekly Obs."
                    />
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-5 text-xs text-muted-foreground mt-1 mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-brand-2 opacity-70" />
                    <span>Weekly observation</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 border-t-2 border-brand-2" style={{ opacity: 0.85 }} />
                    <span>OLS trend line</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 border-t border-brand-2 border-dashed" style={{ opacity: 0.45 }} />
                    <span>±1.5σ channel</span>
                  </div>
                </div>
              </>
            )}

            <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
              <p>
                <span className="text-brand-2 font-semibold">CCJ (pure miner)</span> has higher uranium spot beta. Its P&L moves directly with U3O8 pricing.
              </p>
              <p>
                <span className="text-ink-muted font-semibold">CEG (nuclear utility)</span> is influenced by electricity contracts and regulated returns. Smoother, less volatile nuclear exposure.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
    </PerfProfiler>
  );
}

// ─── Table view (Lake 3B) ───────────────────────────────────────────────────

interface LayerDef {
  key: string;
  title: string;
  icon: typeof Cpu;
  color: string;
  description: string;
  tooltip: string;
}

/** ticker -> % change over a StackData's sparkline windows. */
function pctMapOf(sd: StackData | undefined, layerKeys: string[]): Record<string, number | null> {
  const m: Record<string, number | null> = {};
  if (!sd) return m;
  for (const k of layerKeys) {
    for (const s of ((sd as any)[k] as StockData[] | undefined) ?? []) {
      m[s.ticker] = pctFromSparkline(s.sparkline);
    }
  }
  return m;
}

function pctCell(v: number | null): { text: string; className: string } {
  if (v === null || !Number.isFinite(v)) return { text: "—", className: "text-muted-foreground/50" };
  const cls = v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-muted-foreground";
  return { text: `${v > 0 ? "+" : ""}${v.toFixed(2)}%`, className: cls };
}

/** Opens A to Z; every other column is numeric and opens largest-first. */
const TABLE_TEXT_COLS: TableSortKey[] = ["ticker"];

const TABLE_COLS: Array<{ key: TableSortKey; label: string; align: "left" | "right" }> = [
  { key: "ticker", label: "Ticker", align: "left" },
  { key: "price", label: "Price", align: "right" },
  { key: "d1", label: "1D %", align: "right" },
  { key: "d5", label: "5D %", align: "right" },
  { key: "m1", label: "1M %", align: "right" },
  { key: "mktcap", label: "Mkt Cap", align: "right" },
  { key: "pe", label: "P/E", align: "right" },
  { key: "revGrowth", label: "Rev YoY", align: "right" },
];

function StackTable({
  layers,
  data,
  data5D,
  data1M,
  isLoading,
  isError,
  majorityState,
  onRetry,
}: {
  layers: LayerDef[];
  data: StackData | undefined;
  data5D: StackData | undefined;
  data1M: StackData | undefined;
  isLoading: boolean;
  isError: boolean;
  majorityState: string | null;
  onRetry?: () => void;
}) {
  const [sortKey, setSortKey] = useState<TableSortKey>("mktcap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const layerKeys = layers.map((l) => l.key);
  const pct5 = useMemo(() => pctMapOf(data5D, layerKeys), [data5D]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct1m = useMemo(() => pctMapOf(data1M, layerKeys), [data1M]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same rule every other table uses: flip the active column, otherwise open
  // the new one at its natural direction (ticker A-Z, numbers largest first).
  const toggleSort = (k: TableSortKey) => {
    const n = nextSort({ key: sortKey, dir: sortDir }, k, TABLE_TEXT_COLS);
    setSortKey(n.key);
    setSortDir(n.dir);
  };

  if (isError) {
    return (
      <Card className="border-card-border" data-testid="stack-table-error">
        <ErrorState label="Unable to load equities data" onRetry={onRetry} />
      </Card>
    );
  }

  return (
    <Card className="border-card-border overflow-x-auto" data-testid="stack-table">
      <table className="w-full text-xs font-mono min-w-[760px]">
        <thead>
          <tr className="bg-surface-base border-b border-border font-sans text-[11px] text-muted-foreground">
            {TABLE_COLS.map((c) => (
              <SortableTh
                key={c.key}
                label={c.label}
                align={c.align}
                active={sortKey === c.key}
                dir={sortDir}
                onSort={() => toggleSort(c.key)}
                className="px-3 py-2"
                testId={`stack-sort-${c.key}`}
              />
            ))}
          </tr>
        </thead>
        {isLoading ? (
          <tbody>
            {Array(12).fill(null).map((_, i) => (
              <tr key={i} className="border-b border-border/30">
                <td colSpan={TABLE_COLS.length} className="px-3 py-1.5">
                  <Skeleton className="h-5 w-full" />
                </td>
              </tr>
            ))}
          </tbody>
        ) : (
          layers.map((layer) => {
            const stocks = ((data as any)?.[layer.key] as StockData[] | undefined) ?? [];
            const isCollapsed = collapsed[layer.key] ?? false;
            const rows = sortTableRows(
              stocks.map((s) => ({
                ticker: s.ticker,
                price: Number.isFinite(s.price) ? s.price : null,
                d1: s.stale ? null : s.changePercent,
                d5: pct5[s.ticker] ?? null,
                m1: pct1m[s.ticker] ?? null,
                mktcap: marketCapOf(s),
                pe: s.pe,
                revGrowth: s.revenueGrowth,
                stock: s,
              })),
              sortKey,
              sortDir,
            );
            return (
              <tbody key={layer.key} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}>
                <tr
                  className="bg-surface-base/80 border-y border-border cursor-pointer hover:bg-surface-overlay/40 transition-colors"
                  onClick={() => setCollapsed((c) => ({ ...c, [layer.key]: !isCollapsed }))}
                  data-testid={`stack-group-${layer.key}`}
                >
                  <td colSpan={TABLE_COLS.length} className="px-3 py-1.5">
                    <span className="inline-flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      <span className="h-2 w-2 rounded-sm" style={{ background: layer.color }} />
                      <span className="font-semibold text-foreground font-sans">{layer.title}</span>
                      <span className="text-muted-foreground/50">{stocks.length}</span>
                    </span>
                  </td>
                </tr>
                {!isCollapsed &&
                  rows.map((r) => {
                    const d1 = pctCell(r.d1);
                    const d5 = pctCell(r.d5);
                    const m1 = pctCell(r.m1);
                    const pe = peCell(r.pe);
                    const rg = revGrowthCell(r.revGrowth);
                    return (
                      <tr key={r.ticker} className="border-b border-border/20 last:border-0 hover:bg-brand/5 transition-colors" data-testid={`stack-row-${r.ticker}`}>
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">{r.ticker}</span>
                            <span className="text-muted-foreground/50 font-sans truncate max-w-[140px] hidden lg:inline">{r.stock.name}</span>
                            {r.stock.stale && <Clock className="h-2.5 w-2.5 text-brand-2/80" aria-label="delayed quote" />}
                            <MarketStateBadge state={r.stock.marketState} majority={majorityState} />
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{r.price !== null ? `$${r.price.toFixed(2)}` : "—"}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${d1.className}`}>{d1.text}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${d5.className}`}>{d5.text}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${m1.className}`}>{m1.text}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{r.mktcap !== null ? `$${fmtCapB(r.mktcap)}` : "—"}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${pe.className}`} title={pe.title}>{pe.text}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${rg.className}`} title={rg.title}>{rg.text}</td>
                      </tr>
                    );
                  })}
              </tbody>
            );
          })
        )}
      </table>
      <p className="px-3 py-2 text-10 text-muted-foreground/50 border-t border-border">
        5D / 1M columns compute from each window's own price series; a dash means the window has no data yet. Click a layer to collapse it.
      </p>
    </Card>
  );
}

// ─── Heatmap view (Lake 3B) ─────────────────────────────────────────────────

// Two-band heatmap: with one dominant layer (compute is ~70% of drawn cap),
// a single cap-proportional treemap collapses every small layer into an
// unreadable sliver column. Layers under MINOR_SHARE of drawn cap therefore
// leave the treemap and stack underneath as fixed-height panels that never
// go narrower than MIN_PANEL_W. Tile area stays cap-proportional inside the
// treemap and inside each panel.
const MINOR_SHARE = 0.02;
const PANEL_H = 132;
const MIN_PANEL_W = 170;

// Short header labels for narrow treemap columns; the hover title always
// carries the full layer name. Designed short forms, never mid-word ellipsis.
const HEAT_GROUP_SHORT: Record<string, string> = {
  rawMaterialsMining: "Mining",
  rawMaterialsNatGas: "Natural Gas",
  transmissionGrid: "Grid Hardware",
};

function StackHeatmap({
  layers,
  data,
  timeframe,
  isLoading,
  isError,
  onRetry,
}: {
  layers: LayerDef[];
  data: StackData | undefined;
  timeframe: Timeframe;
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();

  const input = useMemo(() => {
    const byLayer: Record<string, Array<{ ticker: string; name: string; changePercent: number | null; stale?: boolean; marketCap?: number | null; marketCapDisplay?: string }>> = {};
    for (const layer of layers) {
      const stocks = ((data as any)?.[layer.key] as StockData[] | undefined) ?? [];
      byLayer[layer.key] = stocks.map((s) => ({
        ticker: s.ticker,
        name: s.name,
        // color = % change over the SELECTED window, from that window's own series
        changePercent: s.stale ? null : timeframe === "1D" ? s.changePercent : pctFromSparkline(s.sparkline),
        stale: s.stale,
        marketCap: s.marketCap,
        marketCapDisplay: s.marketCapDisplay,
      }));
    }
    return buildHeatmapInput(layers, byLayer);
  }, [layers, data, timeframe]);

  const height = Math.max(560, Math.min(880, Math.round(width * 0.62)));
  const { tiles, groups, totalH } = useMemo(() => {
    // sqrt-dampened layer weights: every layer stays legible, order by
    // size holds, tiles inside a layer remain cap-proportional.
    const w = (b: number) => Math.pow(Math.max(b, 0), 0.7);
    const totalB = input.groups.reduce((s, g) => s + w(g.totalB), 0);
    if (width === 0 || totalB <= 0) return { tiles: [] as HeatRect[], groups: [] as HeatGroupRect[], totalH: height };
    const majors = input.groups.filter((g) => w(g.totalB) / totalB >= MINOR_SHARE);
    const minors = majors.length > 0 ? input.groups.filter((g) => w(g.totalB) / totalB < MINOR_SHARE) : [];
    const perRow = minors.length > 0 ? Math.max(1, Math.min(minors.length, Math.floor(width / MIN_PANEL_W))) : 1;
    const rows = minors.length > 0 ? Math.ceil(minors.length / perRow) : 0;
    const stripH = rows * PANEL_H;
    const majorH = Math.max(320, height - stripH);
    const laid = layoutHeatmap({ groups: majors.length > 0 ? majors : input.groups, unsized: [] }, width, majorH);
    const tiles: HeatRect[] = [...laid.tiles];
    const groups: HeatGroupRect[] = [...laid.groups];
    const colW = Math.floor(width / perRow);
    minors.forEach((g, i) => {
      const dx = (i % perRow) * colW;
      const dy = majorH + Math.floor(i / perRow) * PANEL_H;
      const one = layoutHeatmap({ groups: [g], unsized: [] }, colW, PANEL_H);
      for (const t of one.tiles) tiles.push({ ...t, x0: t.x0 + dx, x1: t.x1 + dx, y0: t.y0 + dy, y1: t.y1 + dy });
      for (const gr of one.groups) groups.push({ ...gr, x0: gr.x0 + dx, x1: gr.x1 + dx, y0: gr.y0 + dy, y1: gr.y1 + dy });
    });
    return { tiles, groups, totalH: majorH + stripH };
  }, [input, width, height]);

  if (isError) {
    return (
      <Card className="border-card-border" data-testid="stack-heatmap-error">
        <ErrorState label="Unable to load equities data" onRetry={onRetry} />
      </Card>
    );
  }

  return (
    <Card className="border-card-border p-3" data-testid="stack-heatmap">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-[12px] text-muted-foreground">
        </span>
        <div className="flex items-center gap-1.5 text-9 font-mono text-muted-foreground/70">
          <span>-{4}%</span>
          {[-4, -2, -0.75, 0, 0.75, 2, 4].map((v) => (
            <span key={v} className="h-3 w-5 rounded-[2px]" style={{ background: heatColor(v) }} />
          ))}
          <span>+{4}%</span>
        </div>
      </div>
      <div ref={ref} className="relative w-full bg-surface-base rounded-sm overflow-hidden" style={{ height: totalH }}>
        {isLoading || width === 0 ? (
          <Skeleton className="absolute inset-0" />
        ) : tiles.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">No sized equities.</div>
        ) : (
          <>
            {groups.map((g) => (
              <div
                key={g.key}
                className="absolute text-9 font-medium truncate px-1"
                style={{ left: g.x0 + 2, top: g.y0 + 2, width: g.x1 - g.x0 - 4, color: g.color }}
                title={`${g.title} · $${fmtCapB(g.totalB)} combined`}
              >
                {HEAT_GROUP_SHORT[g.key] ?? g.title}
              </div>
            ))}
            {tiles.map((t) => {
              const w = t.x1 - t.x0;
              const h = t.y1 - t.y0;
              const pct = t.changePercent;
              const showPct = w > 52 && h > 34;
              const showTicker = w > 34 && h > 16;
              return (
                <div
                  key={t.ticker}
                  className={`absolute overflow-hidden rounded-[2px] ${t.stale ? "border border-dashed border-strong" : ""}`}
                  style={{ left: t.x0, top: t.y0, width: w, height: h, background: heatColor(pct) }}
                  title={`${t.ticker} · ${t.name} · ${pct === null ? "no live change (delayed)" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`} · $${fmtCapB(t.sizeB)} cap`}
                  data-testid={`heat-tile-${t.ticker}`}
                >
                  {showTicker && (
                    <div className="px-1 pt-0.5 leading-tight">
                      <div className="text-10 font-mono font-semibold" style={{ color: heatTextColor(pct) }}>
                        {t.ticker}
                      </div>
                      {showPct && (
                        <div className="text-9 font-mono" style={{ color: heatTextColor(pct), opacity: 0.85 }}>
                          {pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
      <p className="mt-2 text-10 text-muted-foreground/50">
        Grouped by layer. ETF benchmarks excluded (fund AUM is not corporate market cap).
        {input.unsized.length > 0 && ` Not sized (no market cap data): ${input.unsized.join(", ")}.`}
        {" "}Gray tiles = delayed quote, change unknown.
        {" "}Layers under 2% of drawn cap sit in the bottom strip at readable width; tile size stays proportional within each layer.
      </p>
    </Card>
  );
}
