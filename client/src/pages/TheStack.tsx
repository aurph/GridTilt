import { useQuery } from "@tanstack/react-query";
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
} from "recharts";
import { Cpu, Server, Zap, TrendingUp, TrendingDown, Info, Minus } from "lucide-react";

interface StockData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  pe: number | null;
  revenueGrowth: number | null;
  sparkline: number[];
  marketCap?: string;
  powerMW?: number;
  vs_sp500?: number;
}

interface CorrelationPoint {
  uranium: number;
  ceg: number;
}

interface StackData {
  compute: StockData[];
  infrastructure: StockData[];
  power: StockData[];
  correlation: CorrelationPoint[];
  correlationCoeff: number;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function StockCard({ stock, showPower, showVsSP500 }: { stock: StockData; showPower?: boolean; showVsSP500?: boolean }) {
  const isUp = stock.changePercent >= 0;
  return (
    <Card className="p-4 border-card-border hover-elevate" data-testid={`stock-card-${stock.ticker}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-foreground">{stock.ticker}</span>
            <Badge className={`text-xs px-1.5 py-0 ${isUp ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
              {isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[160px]">{stock.name}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm text-foreground">${stock.price.toFixed(2)}</p>
          <p className={`text-xs ${isUp ? "text-green-400" : "text-red-400"}`}>
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
          <p className="font-semibold text-foreground">{stock.pe ? stock.pe.toFixed(1) : "N/A"}</p>
        </div>
        <div className="bg-muted/40 rounded-sm p-2">
          <p className="text-muted-foreground mb-0.5">Rev Growth YoY</p>
          <p className={`font-semibold ${stock.revenueGrowth && stock.revenueGrowth > 0 ? "text-green-400" : "text-red-400"}`}>
            {stock.revenueGrowth ? `${stock.revenueGrowth > 0 ? "+" : ""}${stock.revenueGrowth.toFixed(1)}%` : "N/A"}
          </p>
        </div>
        {showPower && stock.powerMW && (
          <div className="bg-muted/40 rounded-sm p-2 col-span-2">
            <p className="text-muted-foreground mb-0.5">Power / Facility</p>
            <p className="font-semibold text-[#F0A500]">{stock.powerMW} MW avg</p>
          </div>
        )}
        {showVsSP500 && stock.vs_sp500 !== undefined && (
          <div className="bg-muted/40 rounded-sm p-2 col-span-2">
            <p className="text-muted-foreground mb-0.5">vs S&P 500 (1Y)</p>
            <p className={`font-semibold flex items-center gap-1 ${stock.vs_sp500 > 0 ? "text-green-400" : "text-red-400"}`}>
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
        <p className="text-muted-foreground">Uranium: <span className="text-foreground font-medium">${payload[0]?.value?.toFixed(2)}/lb</span></p>
        <p className="text-muted-foreground">CEG: <span className="text-foreground font-medium">${payload[1]?.value?.toFixed(2)}</span></p>
      </div>
    );
  }
  return null;
};

export default function TheStack() {
  const { data, isLoading } = useQuery<StackData>({
    queryKey: ["/api/stack"],
  });

  const layerConfig = [
    {
      key: "compute",
      title: "Compute Layer",
      icon: Cpu,
      color: "#1E90FF",
      description: "GPU & semiconductor companies powering the AI workload",
      tooltip: "Why This Matters: These companies supply the physical compute substrate for AI. NVDA's H100 GPUs consume ~700W each — a single training cluster can use as much power as a small city.",
      showPower: false,
      showVsSP500: false,
    },
    {
      key: "infrastructure",
      title: "Infrastructure Layer",
      icon: Server,
      color: "#a855f7",
      description: "Data center REITs and colocation operators",
      tooltip: "Why This Matters: These companies own the physical buildings that house AI compute. Their power contracts, PUE efficiency, and land-bank position them as direct proxies for AI demand growth.",
      showPower: true,
      showVsSP500: true,
    },
    {
      key: "power",
      title: "Power Layer",
      icon: Zap,
      color: "#F0A500",
      description: "Nuclear utilities and uranium supply chain",
      tooltip: "Why This Matters: AI needs 24/7 baseload power — only nuclear can provide it. Microsoft signed a deal to restart Three Mile Island. Google inked the first commercial SMR contract. This layer captures that narrative.",
      showPower: false,
      showVsSP500: false,
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">The Stack</h1>
            <p className="text-muted-foreground text-sm mt-1">Data center supply chain — from silicon to socket. Real-time market data.</p>
          </div>
          <Badge className="bg-[#1E90FF]/15 text-[#1E90FF] border-[#1E90FF]/30">
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
                        <p className="text-xs">{layer.tooltip}</p>
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

        {/* Correlation scatter plot */}
        <div>
          <Card className="p-6 border-card-border">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="font-semibold text-foreground">Uranium → CEG Correlation</h2>
                  <UITooltip>
                    <TooltipTrigger>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Why This Matters: Constellation Energy (CEG) owns the largest nuclear fleet in the US. As uranium spot prices rise, so does CEG's implied asset value — but the relationship isn't linear. This scatter reveals regime shifts in the correlation.</p>
                    </TooltipContent>
                  </UITooltip>
                </div>
                <p className="text-xs text-muted-foreground">12-month uranium spot price ($/lb) vs. CEG stock price</p>
              </div>
              {data?.correlationCoeff !== undefined && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Pearson r</p>
                  <p className="text-2xl font-bold text-[#F0A500]">{data.correlationCoeff.toFixed(3)}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.correlationCoeff > 0.7 ? "Strong positive" : data.correlationCoeff > 0.4 ? "Moderate" : "Weak"} correlation
                  </p>
                </div>
              )}
            </div>

            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="uranium"
                    name="Uranium"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                    label={{ value: "Uranium Spot ($/lb)", position: "insideBottom", offset: -10, fill: "#6b7280", fontSize: 11 }}
                  />
                  <YAxis
                    dataKey="ceg"
                    name="CEG"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    label={{ value: "CEG ($)", angle: -90, position: "insideLeft", offset: 10, fill: "#6b7280", fontSize: 11 }}
                  />
                  <Tooltip content={<CustomScatterTooltip />} />
                  <Scatter
                    data={data?.correlation ?? []}
                    fill="#F0A500"
                    opacity={0.7}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            )}

            <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
              Each dot represents one week. The tighter the cluster along the diagonal, the stronger the relationship — meaning uranium price movements are likely being priced into nuclear utility stocks.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
