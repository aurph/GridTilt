import { useQuery } from "@tanstack/react-query";
import { Profiler, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Cpu, Server, Zap, TrendingUp, TrendingDown, Info, Clock } from "lucide-react";
import { BRAND, CATEGORY_COLORS, CHART_CHROME, INK, SEMANTIC, SERIES } from "@/lib/tokens";
import { axisProps, gridProps } from "@/lib/chart-theme";

interface StockData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  pe: number | null;
  revenueGrowth: number | null;
  sparkline?: number[];
  marketCapDisplay?: string;
  powerMW?: number;
  vs_sp500?: number;
  stale?: boolean;
}

interface CorrelationPoint {
  uranium: number;
  ccj: number;
}

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
  correlationCoeff: number;
  cegCorrelationCoeff: number;
}

function Sparkline({ data, color }: { data: number[] | undefined; color: string }) {
  if (!data || data.length === 0) return <div className="h-10" />;
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function StaleBadge({ ticker }: { ticker: string }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1 rounded-sm border border-brand-2/30 bg-brand-2/10 px-1.5 py-0 text-10 font-mono text-brand-2/90 leading-4"
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

function StockCard({ stock, showPower, showVsSP500 }: { stock: StockData; showPower?: boolean; showVsSP500?: boolean }) {
  if (!stock || stock.price == null) return null;
  const isStale = stock.stale || stock.changePercent == null;
  const isUp = !isStale && stock.changePercent >= 0;
  const isDown = !isStale && stock.changePercent < -2;
  return (
    <Card
      className={`p-4 border-card-border transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${isDown ? "border-negative-deep/20 bg-negative-deep/5" : ""}`}
      style={{ boxShadow: isDown ? `inset 0 0 20px ${SEMANTIC.negativeDeep}0A` : undefined }}
      data-testid={`stock-card-${stock.ticker}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground font-mono">{stock.ticker}</span>
            {isStale ? (
              <StaleBadge ticker={stock.ticker} />
            ) : (
              <Badge className={`text-xs px-1.5 py-0 font-mono ${isUp ? "bg-positive-deep/15 text-positive" : "bg-negative-deep/15 text-negative"}`}>
                {isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[150px]">{stock.name}</p>
          {stock.marketCapDisplay && (
            <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono">{stock.marketCapDisplay} mkt cap</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-sm text-foreground font-mono">${stock.price.toFixed(2)}</p>
          <p className={`text-xs font-mono ${isStale ? "text-muted-foreground" : isUp ? "text-positive" : "text-negative"}`}>
            {isStale ? "--" : `${isUp ? "+" : ""}${stock.change.toFixed(2)}`}
          </p>
        </div>
      </div>

      <div className="mb-2">
        <Sparkline data={stock.sparkline} color={isUp ? SEMANTIC.positiveDeep : SEMANTIC.negativeDeep} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted/40 rounded-sm p-2">
          <p className="text-muted-foreground mb-0.5">P/E Ratio</p>
          <p className="font-semibold font-mono text-foreground">{stock.pe ? stock.pe.toFixed(1) : "N/A"}</p>
        </div>
        <div className="bg-muted/40 rounded-sm p-2">
          <p className="text-muted-foreground mb-0.5">Rev Growth YoY</p>
          <p className={`font-semibold font-mono ${stock.revenueGrowth && stock.revenueGrowth > 0 ? "text-positive" : stock.revenueGrowth ? "text-negative" : "text-muted-foreground"}`}>
            {stock.revenueGrowth ? `${stock.revenueGrowth > 0 ? "+" : ""}${stock.revenueGrowth.toFixed(1)}%` : "N/A"}
          </p>
        </div>
        {showPower && stock.powerMW && (
          <div className="bg-muted/40 rounded-sm p-2 col-span-2">
            <p className="text-muted-foreground mb-0.5">Power / Facility</p>
            <p className="font-semibold font-mono text-brand-2">{stock.powerMW} MW avg</p>
          </div>
        )}
        {showVsSP500 && stock.vs_sp500 !== undefined && (
          <div className="bg-muted/40 rounded-sm p-2 col-span-2">
            <p className="text-muted-foreground mb-0.5">vs S&P 500 (1Y)</p>
            <p className={`font-semibold font-mono flex items-center gap-1 ${stock.vs_sp500 > 0 ? "text-positive" : "text-negative"}`}>
              {stock.vs_sp500 > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {stock.vs_sp500 > 0 ? "+" : ""}{stock.vs_sp500.toFixed(1)}%
            </p>
          </div>
        )}
      </div>
    </Card>
  );
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
        <p className="text-muted-foreground">Uranium Spot: <span className="text-foreground font-mono font-medium">${payload[0]?.value?.toFixed(2)}/lb</span></p>
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
  if (sortBy === "marketcap") return arr.sort((a, b) => {
    const parseM = (s?: string) => {
      if (!s) return 0;
      const n = parseFloat(s);
      if (s.includes("T")) return n * 1000;
      return n;
    };
    return parseM(b.marketCapDisplay) - parseM(a.marketCapDisplay);
  });
  return arr;
}

export default function TheStack() {
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [sortBy, setSortBy] = useState<SortBy>("change");

  const { data, isLoading, isError } = useQuery<StackData>({
    queryKey: ["/api/stack", timeframe],
    queryFn: () => fetch(`/api/stack?timeframe=${timeframe}`).then((r) => r.json()),
    refetchInterval: 900000,
  });

  const regression = useMemo(
    () => computeRegression(data?.correlation ?? []),
    [data?.correlation]
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
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">The Stack</h1>
            <p className="text-muted-foreground text-sm mt-1">100+ equities across 13 layers of the AI power supply chain. Intraday prices via Yahoo Finance.</p>
          </div>
          <Badge className="bg-brand-2/15 text-brand-2 border-brand-2/30 font-mono text-xs">
            Yahoo Finance · Live
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4">
          {/* Timeframe toggle */}
          <div className="flex items-center gap-1 bg-muted/30 rounded-md p-0.5 border border-card-border">
            {(["1D", "5D", "1M"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                data-testid={`timeframe-${tf.toLowerCase()}`}
                className={`px-3 py-1 text-xs font-mono font-semibold rounded transition-all ${
                  timeframe === tf
                    ? "bg-brand text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-border" />

          {/* Sort toggle */}
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
        </div>
      </div>

      <div className="flex-1 p-6 space-y-8">
        {layerConfig.map((layer) => {
          const stocks = (data as any)?.[layer.key] as StockData[] | undefined;
          return (
            <div key={layer.key}>
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
                  <div className="col-span-full flex items-center gap-2 py-8 justify-center">
                    <Info className="h-4 w-4 text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">Unable to load equities data</p>
                  </div>
                ) : isLoading
                  ? Array(4).fill(null).map((_, i) => <StockCardSkeleton key={i} />)
                  : (stocks ?? []).length === 0 ? (
                    <div className="col-span-full py-4">
                      <p className="text-xs text-muted-foreground text-center">No equities in this layer</p>
                    </div>
                  ) : sortStocks(stocks ?? [], sortBy).map((stock) => (
                      <StockCard
                        key={stock.ticker}
                        stock={stock}
                      />
                    ))}
              </div>
            </div>
          );
        })}

        {/* Uranium vs CCJ Correlation scatter */}
        <div>
          <Card className="p-6 border-card-border">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-semibold text-foreground">Uranium Spot vs. CCJ Correlation</h2>
                  <UITooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs leading-relaxed">CCJ is the largest public uranium miner with the highest direct spot price beta. CEG (utility) is influenced by electricity contracts and regulated returns. CCJ = commodity bet, CEG = infrastructure bet.</p>
                    </TooltipContent>
                  </UITooltip>
                </div>
                <p className="text-xs text-muted-foreground">52-week uranium spot price ($/lb) vs. CCJ stock price. Each dot = one week.</p>
              </div>
              <div className="flex items-center gap-6">
                {data?.correlationCoeff !== undefined && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground font-mono">CCJ Pearson r</p>
                    <p className="text-2xl font-bold font-mono text-brand-2">{data.correlationCoeff.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">
                      {data.correlationCoeff > 0.7 ? "Strong" : data.correlationCoeff > 0.4 ? "Moderate" : "Weak"} correlation
                    </p>
                  </div>
                )}
                {data?.cegCorrelationCoeff !== undefined && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground font-mono">CEG Pearson r</p>
                    <p className="text-2xl font-bold font-mono text-foreground">{data.cegCorrelationCoeff.toFixed(3)}</p>
                    <p className="text-xs text-muted-foreground">Utility beta</p>
                  </div>
                )}
              </div>
            </div>

            {isLoading ? (
              <Skeleton className="h-48 w-full" />
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
                      label={{ value: "Uranium Spot ($/lb)", position: "insideBottom", offset: -10, fill: CHART_CHROME.tick, fontSize: 11 }}
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
