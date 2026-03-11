import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Cpu, Server, Zap, TrendingUp, TrendingDown, Info } from "lucide-react";

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

function StockCard({ stock, showPower, showVsSP500 }: { stock: StockData; showPower?: boolean; showVsSP500?: boolean }) {
  if (!stock || stock.price == null || stock.changePercent == null) return null;
  const isUp = stock.changePercent >= 0;
  return (
    <Card className="p-4 border-card-border hover-elevate" data-testid={`stock-card-${stock.ticker}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground font-mono">{stock.ticker}</span>
            <Badge className={`text-xs px-1.5 py-0 font-mono ${isUp ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[150px]">{stock.name}</p>
          {stock.marketCapDisplay && (
            <p className="text-xs text-muted-foreground/60 mt-0.5 font-mono">{stock.marketCapDisplay} mkt cap</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold text-sm text-foreground font-mono">${stock.price.toFixed(2)}</p>
          <p className={`text-xs font-mono ${isUp ? "text-green-400" : "text-red-400"}`}>
            {isUp ? "+" : ""}{stock.change.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="mb-2">
        <Sparkline data={stock.sparkline} color={isUp ? "#22c55e" : "#ef4444"} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted/40 rounded-sm p-2">
          <p className="text-muted-foreground mb-0.5">P/E Ratio</p>
          <p className="font-semibold font-mono text-foreground">{stock.pe ? stock.pe.toFixed(1) : "N/A"}</p>
        </div>
        <div className="bg-muted/40 rounded-sm p-2">
          <p className="text-muted-foreground mb-0.5">Rev Growth YoY</p>
          <p className={`font-semibold font-mono ${stock.revenueGrowth && stock.revenueGrowth > 0 ? "text-green-400" : stock.revenueGrowth ? "text-red-400" : "text-muted-foreground"}`}>
            {stock.revenueGrowth ? `${stock.revenueGrowth > 0 ? "+" : ""}${stock.revenueGrowth.toFixed(1)}%` : "N/A"}
          </p>
        </div>
        {showPower && stock.powerMW && (
          <div className="bg-muted/40 rounded-sm p-2 col-span-2">
            <p className="text-muted-foreground mb-0.5">Power / Facility</p>
            <p className="font-semibold font-mono text-[#F0A500]">{stock.powerMW} MW avg</p>
          </div>
        )}
        {showVsSP500 && stock.vs_sp500 !== undefined && (
          <div className="bg-muted/40 rounded-sm p-2 col-span-2">
            <p className="text-muted-foreground mb-0.5">vs S&P 500 (1Y)</p>
            <p className={`font-semibold font-mono flex items-center gap-1 ${stock.vs_sp500 > 0 ? "text-green-400" : "text-red-400"}`}>
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
type SortBy = "change" | "marketcap";

function sortStocks(stocks: StockData[], sortBy: SortBy): StockData[] {
  if (!stocks) return [];
  const arr = [...stocks];
  if (sortBy === "change") return arr.sort((a, b) => b.changePercent - a.changePercent);
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

  const { data, isLoading } = useQuery<StackData>({
    queryKey: ["/api/stack", timeframe],
    queryFn: () => fetch(`/api/stack?timeframe=${timeframe}`).then((r) => r.json()),
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
      color: "#94a3b8",
      description: "AI chips, hyperscalers, and the semiconductor foundries powering every model training run.",
      tooltip: "NVIDIA's H100/B200 GPUs power virtually every major AI training cluster. TSMC manufactures all advanced AI chips. The hyperscalers (MSFT, GOOGL, META, AMZN) are both the largest AI compute consumers and the primary drivers of data center power demand growth.",
    },
    {
      key: "nuclear",
      title: "Nuclear Power",
      icon: Zap,
      color: "#F0A500",
      description: "Nuclear operators, SMR developers, and advanced reactor companies. AI needs 24/7 baseload.",
      tooltip: "AI requires uninterruptible clean power - wind and solar cannot provide it. Microsoft restarted Three Mile Island. Amazon signed a direct co-location deal with Talen Energy's Susquehanna plant. Oklo has a 14 GW data center customer pipeline. BWXT is the sole manufacturer of US naval nuclear reactors.",
    },
    {
      key: "uranium",
      title: "Uranium & Fuel Cycle",
      icon: Zap,
      color: "#fb923c",
      description: "Uranium miners and fuel cycle companies supplying the nuclear renaissance.",
      tooltip: "Uranium spot at ~$92/lb (Mar 2026). Cameco is the largest public uranium miner with direct spot beta. NexGen's Rook I deposit is the world's highest-grade undeveloped uranium resource. Centrus Energy is the only US-licensed HALEU producer for advanced reactors.",
    },
    {
      key: "powerHardware",
      title: "Power Hardware",
      icon: Server,
      color: "#60a5fa",
      description: "Transformers, switchgear, cooling, and electrical equipment. The grid-to-rack supply chain.",
      tooltip: "GE Vernova's gas turbine order book is the leading indicator of data center buildout pace. Eaton is at maximum production capacity for switchgear and transformers. Vertiv is the fastest-growing power/cooling infrastructure company by organic revenue. Transformer shortages are the primary bottleneck on data center energization timelines.",
    },
    {
      key: "utilities",
      title: "Utilities",
      icon: Zap,
      color: "#34d399",
      description: "AI-load beneficiary utilities signing long-term power agreements with hyperscalers.",
      tooltip: "Dominion Energy serves Northern Virginia - home to 70% of global internet traffic. NextEra signed a 2.5 GW deal with Meta. Southern Company's Georgia territory is the epicenter of Southeast data center growth. These regulated utilities benefit from the structural increase in electricity demand that AI is driving.",
    },
    {
      key: "dataCenters",
      title: "Data Centers",
      icon: Server,
      color: "#a855f7",
      description: "Data center REITs and colocation operators. Direct proxies for AI capacity build-out.",
      tooltip: "Equinix operates 273 data centers across 77 markets. Digital Realty has 300+ facilities globally. IREN is pivoting from Bitcoin mining to GPU-as-a-Service. These companies own the physical facilities where AI compute runs, making their power contracts and land-bank critical metrics.",
    },
    {
      key: "construction",
      title: "Construction & EPC",
      icon: Server,
      color: "#f472b6",
      description: "Electrical contractors and engineers building the grid connections for AI campuses.",
      tooltip: "Quanta Services is the largest electrical utility contractor in North America, building the transmission lines and substations connecting data center campuses to the grid. EMCOR has a record $4.3B backlog in network and communications infrastructure. Sterling Infrastructure has 125% YoY data center revenue growth.",
    },
    {
      key: "etfsBenchmarks",
      title: "ETF Benchmarks",
      icon: TrendingUp,
      color: "#6b7280",
      description: "Sector ETFs tracking uranium, data centers, grid infrastructure, and utilities.",
      tooltip: "Use these ETFs to benchmark sector performance. URA and URNM track the uranium mining sector. DTCR tracks data center and digital infrastructure. GRID tracks smart grid companies. XLU tracks the utility sector. Compare individual stock picks against these benchmarks to assess relative performance.",
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">The Stack</h1>
            <p className="text-muted-foreground text-sm mt-1">Data center supply chain from silicon to socket. Live market data across compute, infrastructure, and power.</p>
          </div>
          <Badge className="bg-[#F0A500]/15 text-[#F0A500] border-[#F0A500]/30 font-mono text-xs">
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
                    ? "bg-[#F07800] text-white"
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
                {isLoading
                  ? Array(4).fill(null).map((_, i) => <StockCardSkeleton key={i} />)
                  : sortStocks(stocks ?? [], sortBy).map((stock) => (
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
                      <p className="text-xs leading-relaxed">Cameco (CCJ) is the world's largest publicly traded uranium miner. As a pure miner, its stock price carries the highest direct uranium spot price beta of any large-cap name. The comparison with CEG (utility) below shows this distinction: CCJ's Pearson r is typically tighter because CEG's price is also influenced by electricity contracts, regulated returns, and macro utility factors. Both are valid plays on the nuclear renaissance, but they represent different risk profiles: CCJ is a commodity bet, CEG is an infrastructure bet.</p>
                    </TooltipContent>
                  </UITooltip>
                </div>
                <p className="text-xs text-muted-foreground">52-week uranium spot price ($/lb) vs. CCJ stock price. Each dot = one week.</p>
              </div>
              <div className="flex items-center gap-6">
                {data?.correlationCoeff !== undefined && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground font-mono">CCJ Pearson r</p>
                    <p className="text-2xl font-bold font-mono text-[#F0A500]">{data.correlationCoeff.toFixed(3)}</p>
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="uranium"
                      type="number"
                      name="Uranium"
                      domain={["auto", "auto"]}
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                      label={{ value: "Uranium Spot ($/lb)", position: "insideBottom", offset: -10, fill: "#6b7280", fontSize: 11 }}
                    />
                    <YAxis
                      dataKey="ccj"
                      type="number"
                      name="CCJ"
                      domain={["auto", "auto"]}
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      label={{ value: "CCJ ($)", angle: -90, position: "insideLeft", offset: 10, fill: "#6b7280", fontSize: 11 }}
                    />
                    <Tooltip content={<CustomScatterTooltip />} />
                    {/* Upper confidence band */}
                    <Scatter
                      data={regression.upper}
                      fill="none"
                      line={{ stroke: "#F0A500", strokeWidth: 1, strokeDasharray: "5 4", strokeOpacity: 0.35 }}
                      shape={() => null as any}
                      legendType="none"
                      name="Upper Band"
                    />
                    {/* Lower confidence band */}
                    <Scatter
                      data={regression.lower}
                      fill="none"
                      line={{ stroke: "#F0A500", strokeWidth: 1, strokeDasharray: "5 4", strokeOpacity: 0.35 }}
                      shape={() => null as any}
                      legendType="none"
                      name="Lower Band"
                    />
                    {/* OLS regression line */}
                    <Scatter
                      data={regression.line}
                      fill="none"
                      line={{ stroke: "#F0A500", strokeWidth: 2, strokeOpacity: 0.85 }}
                      shape={() => null as any}
                      legendType="none"
                      name="OLS Fit"
                    />
                    {/* Raw scatter dots */}
                    <Scatter
                      data={data?.correlation ?? []}
                      fill="#F0A500"
                      opacity={0.65}
                      r={4}
                      name="Weekly Obs."
                    />
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-5 text-xs text-muted-foreground mt-1 mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-[#F0A500] opacity-70" />
                    <span>Weekly observation</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 border-t-2 border-[#F0A500]" style={{ opacity: 0.85 }} />
                    <span>OLS trend line</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-6 border-t border-[#F0A500] border-dashed" style={{ opacity: 0.45 }} />
                    <span>±1.5σ channel</span>
                  </div>
                </div>
              </>
            )}

            <div className="mt-3 pt-3 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
              <p>
                <span className="text-[#F0A500] font-semibold">CCJ (pure miner)</span> carries higher uranium spot price beta than CEG. Its P&L moves directly with the U3O8 market, making it the highest-conviction play on uranium scarcity.
              </p>
              <p>
                <span className="text-slate-400 font-semibold">CEG (nuclear utility)</span> is influenced by electricity contract prices, capacity market dynamics, and regulated returns - providing a smoother, less volatile exposure to the nuclear renaissance.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
