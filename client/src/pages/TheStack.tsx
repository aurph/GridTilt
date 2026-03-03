import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
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
  sparkline: number[];
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
  infrastructure: StockData[];
  power: StockData[];
  correlation: CorrelationPoint[];
  correlationCoeff: number;
  cegCorrelationCoeff: number;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
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

export default function TheStack() {
  const { data, isLoading } = useQuery<StackData>({
    queryKey: ["/api/stack"],
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
      description: "GPU and semiconductor companies powering AI workloads. Ranked by market cap.",
      tooltip: "These companies supply the physical compute substrate for AI. NVIDIA's H100 GPUs consume approximately 700W each; a single training cluster can draw as much power as a small city. TSMC manufactures virtually all advanced AI chips - its capital intensity is the single largest determinant of AI compute supply.",
      showPower: false,
      showVsSP500: false,
    },
    {
      key: "infrastructure",
      title: "Infrastructure Layer",
      icon: Server,
      color: "#a855f7",
      description: "Data center REITs and colocation operators. Direct proxies for AI capacity build-out.",
      tooltip: "These companies own the physical facilities housing AI compute. Their power contracts, PUE efficiency ratings, and land-bank position them as high-conviction proxies for AI demand growth. Vertiv is the fastest-growing operator in the sector by organic revenue.",
      showPower: true,
      showVsSP500: true,
    },
    {
      key: "power",
      title: "Power Layer",
      icon: Zap,
      color: "#F0A500",
      description: "Nuclear utilities and uranium supply chain. AI needs 24/7 baseload - only nuclear delivers it.",
      tooltip: "AI requires uninterruptible power - wind and solar cannot provide it. Microsoft signed a deal to restart Three Mile Island for 20 years. Google inked the first commercial SMR contract. NexGen Energy's Rook I deposit in Saskatchewan is the world's highest-grade undeveloped uranium resource, providing speculative leverage to the nuclear renaissance.",
      showPower: false,
      showVsSP500: false,
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
                  : stocks?.map((stock) => (
                      <StockCard
                        key={stock.ticker}
                        stock={stock}
                        showPower={layer.showPower}
                        showVsSP500={layer.showVsSP500}
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
