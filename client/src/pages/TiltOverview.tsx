import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap, TrendingUp, Activity, AlertTriangle, Info, ArrowUp, ArrowDown } from "lucide-react";

const electricityData = [
  { year: "2019", demand: 3955, projected: null },
  { year: "2020", demand: 3802, projected: null, event: "COVID demand drop" },
  { year: "2021", demand: 3930, projected: null },
  { year: "2022", demand: 4050, projected: null, event: "ChatGPT launch" },
  { year: "2023", demand: 4195, projected: null, event: "AI boom begins" },
  { year: "2024", demand: 4380, projected: 4380 },
  { year: "2025", demand: null, projected: 4620, event: "Major DC expansion" },
  { year: "2026", demand: null, projected: 4890 },
  { year: "2027", demand: null, projected: 5180, event: "Nuclear Renaissance" },
  { year: "2028", demand: null, projected: 5490 },
  { year: "2029", demand: null, projected: 5830 },
  { year: "2030", demand: null, projected: 6210, event: "2030 AI-Power Nexus" },
];

interface KpiData {
  aiPowerIndex: number;
  aiPowerChange: number;
  nuclearIndex: number;
  nuclearChange: number;
  gridStress: number;
  gridStressChange: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = electricityData.find((d) => d.year === label);
    return (
      <div className="bg-card border border-card-border rounded-lg p-3 shadow-xl">
        <p className="text-sm font-semibold text-foreground mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs" style={{ color: entry.color }}>
            {entry.name === "demand" ? "Actual" : "Projected"}: {entry.value ? `${entry.value.toLocaleString()} TWh` : "—"}
          </p>
        ))}
        {dataPoint?.event && (
          <p className="text-xs text-amber-400 mt-1 font-medium">★ {dataPoint.event}</p>
        )}
      </div>
    );
  }
  return null;
};

function KpiCard({
  icon: Icon,
  title,
  value,
  change,
  unit,
  color,
  tooltip,
  isLoading,
}: {
  icon: any;
  title: string;
  value: number | null;
  change: number | null;
  unit: string;
  color: "blue" | "amber" | "red";
  tooltip: string;
  isLoading: boolean;
}) {
  const colorMap = {
    blue: {
      icon: "text-[#1E90FF]",
      bg: "bg-[#1E90FF]/10",
      border: "border-[#1E90FF]/20",
      glow: "glow-blue",
      badge: "bg-[#1E90FF]/15 text-[#1E90FF]",
    },
    amber: {
      icon: "text-[#F0A500]",
      bg: "bg-[#F0A500]/10",
      border: "border-[#F0A500]/20",
      glow: "glow-amber",
      badge: "bg-[#F0A500]/15 text-[#F0A500]",
    },
    red: {
      icon: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      glow: "",
      badge: "bg-red-500/15 text-red-400",
    },
  };
  const c = colorMap[color];

  return (
    <Card className={`p-5 border ${c.border} relative`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${c.bg} ${c.border} border`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
        <UITooltip>
          <TooltipTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors" data-testid={`tooltip-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              <Info className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs">
            <p className="text-xs leading-relaxed">{tooltip}</p>
          </TooltipContent>
        </UITooltip>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-16" />
          </>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-foreground tabular-nums">
                {value !== null ? value.toFixed(1) : "—"}
              </span>
              <span className="text-sm text-muted-foreground mb-1">{unit}</span>
            </div>
            {change !== null && (
              <div className={`flex items-center gap-1 text-xs font-medium ${change >= 0 ? "text-green-400" : "text-red-400"}`}>
                {change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                <span>{Math.abs(change).toFixed(1)}% vs last month</span>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default function TiltOverview() {
  const { data: kpiData, isLoading } = useQuery<KpiData>({
    queryKey: ["/api/kpis"],
  });

  const annotationYears = electricityData.filter((d) => d.event);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Hero header */}
      <div className="grid-bg border-b border-border px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-[#1E90FF]/15 text-[#1E90FF] border-[#1E90FF]/30 text-xs">
                LIVE
              </Badge>
              <span className="text-xs text-muted-foreground">Real-time AI Power Economy Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground">
              The Grid is <span className="text-[#1E90FF]">Tilting</span>
            </h1>
            <p className="text-muted-foreground mt-1.5 max-w-xl text-sm leading-relaxed">
              AI data centers now consume 2–3% of global electricity and accelerating. Track the economic relationship between AI compute demand, power consumption, and the financial markets positioned around it.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="relative flex h-2 w-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <div className="animate-ping absolute h-2 w-2 rounded-full bg-green-500 opacity-75" />
            </div>
            <span>Markets updating every 15min</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* KPI Cards */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Live Indicators</h2>
            <UITooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Composite metrics tracking the AI-power nexus in real time.</p>
              </TooltipContent>
            </UITooltip>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              icon={Activity}
              title="AI Power Demand Index"
              value={kpiData?.aiPowerIndex ?? null}
              change={kpiData?.aiPowerChange ?? null}
              unit="pts"
              color="blue"
              tooltip="Why This Matters: Composite metric derived from data center construction rates, hyperscaler capex, and GPU shipment data. A rising index means AI is consuming more of the grid."
              isLoading={isLoading}
            />
            <KpiCard
              icon={Zap}
              title="Nuclear Renaissance Index"
              value={kpiData?.nuclearIndex ?? null}
              change={kpiData?.nuclearChange ?? null}
              unit="pts"
              color="amber"
              tooltip="Why This Matters: Tracks uranium spot price + weighted performance of top nuclear utility stocks (CEG, VST, ETR). Tech giants are signing nuclear PPAs because AI needs 24/7 baseload power."
              isLoading={isLoading}
            />
            <KpiCard
              icon={AlertTriangle}
              title="Grid Stress Score"
              value={kpiData?.gridStress ?? null}
              change={kpiData?.gridStressChange ?? null}
              unit="/ 100"
              color="red"
              tooltip="Why This Matters: Based on EIA demand trends vs. grid capacity. Above 65 indicates structural supply constraints. High stress = higher electricity prices = margin pressure on data center operators."
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Main demand chart */}
        <Card className="p-6 border-card-border">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-foreground">US Electricity Demand</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Why This Matters: US electricity demand was flat for a decade — AI data centers are reversing this trend for the first time since the industrial era, driving a structural upward shift that utilities and grid operators weren't prepared for.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <p className="text-xs text-muted-foreground">Historical usage (TWh) with AI-era projection to 2030</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm bg-[#1E90FF]" />
                <span className="text-muted-foreground">Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm bg-[#F0A500]/60" style={{ backgroundImage: "repeating-linear-gradient(90deg, #F0A500 0px, #F0A500 4px, transparent 4px, transparent 8px)" }} />
                <span className="text-muted-foreground">AI-Era Projection</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#F0A500]">★</span>
                <span className="text-muted-foreground">Key Events</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={electricityData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1E90FF" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#1E90FF" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F0A500" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#F0A500" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                domain={[3600, 6500]}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Event annotations */}
              {annotationYears.map((d) => (
                <ReferenceLine
                  key={d.year}
                  x={d.year}
                  stroke="rgba(240, 165, 0, 0.3)"
                  strokeDasharray="3 3"
                />
              ))}

              <Area
                type="monotone"
                dataKey="demand"
                name="demand"
                stroke="#1E90FF"
                strokeWidth={2.5}
                fill="url(#demandGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "#1E90FF" }}
                connectNulls={false}
              />
              <Area
                type="monotone"
                dataKey="projected"
                name="projected"
                stroke="#F0A500"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="url(#projGrad)"
                dot={false}
                activeDot={{ r: 5, fill: "#F0A500" }}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>

          <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3">
            US electricity demand was essentially flat from 2010–2022. The AI boom, led by hyperscaler data center expansion, is projected to add +57% in demand by 2030 — the largest structural shift since industrialization.
          </p>
        </Card>

        {/* Bottom info cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 border-card-border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-[#1E90FF]" />
              <span className="text-xs font-semibold text-foreground">Data Center Growth</span>
            </div>
            <p className="text-2xl font-bold text-foreground">+400%</p>
            <p className="text-xs text-muted-foreground mt-1">Global data center capacity growth projected by 2030 vs 2023 baseline</p>
          </Card>
          <Card className="p-4 border-card-border">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-[#F0A500]" />
              <span className="text-xs font-semibold text-foreground">Nuclear PPAs Signed</span>
            </div>
            <p className="text-2xl font-bold text-foreground">23+</p>
            <p className="text-xs text-muted-foreground mt-1">Power Purchase Agreements between Big Tech and nuclear operators in 2024 alone</p>
          </Card>
          <Card className="p-4 border-card-border">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-xs font-semibold text-foreground">Grid Shortfall Risk</span>
            </div>
            <p className="text-2xl font-bold text-foreground">2026</p>
            <p className="text-xs text-muted-foreground mt-1">Year analysts project the first regional grid capacity crises in the US from AI demand</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
