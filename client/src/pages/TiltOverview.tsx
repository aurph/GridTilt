import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
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
  { year: "2010", demand: 3879, dcDemand: 140, projected: null, dcProjected: null },
  { year: "2011", demand: 3883, dcDemand: 150, projected: null, dcProjected: null },
  { year: "2012", demand: 3826, dcDemand: 160, projected: null, dcProjected: null },
  { year: "2013", demand: 3888, dcDemand: 165, projected: null, dcProjected: null },
  { year: "2014", demand: 3879, dcDemand: 170, projected: null, dcProjected: null },
  { year: "2015", demand: 3862, dcDemand: 175, projected: null, dcProjected: null },
  { year: "2016", demand: 3898, dcDemand: 180, projected: null, dcProjected: null },
  { year: "2017", demand: 3887, dcDemand: 190, projected: null, dcProjected: null },
  { year: "2018", demand: 3997, dcDemand: 200, projected: null, dcProjected: null },
  { year: "2019", demand: 3955, dcDemand: 210, projected: null, dcProjected: null },
  { year: "2020", demand: 3802, dcDemand: 215, projected: null, dcProjected: null },
  { year: "2021", demand: 3930, dcDemand: 230, projected: null, dcProjected: null },
  { year: "2022", demand: 4050, dcDemand: 260, projected: null, dcProjected: null },
  { year: "2023", demand: 4195, dcDemand: 310, projected: null, dcProjected: null },
  { year: "2024", demand: 4380, dcDemand: 420, projected: 4380, dcProjected: 420 },
  { year: "2025", demand: 4490, dcDemand: 576, projected: 4490, dcProjected: 576 },
  { year: "2026", demand: null, dcDemand: null, projected: 4890, dcProjected: 800 },
  { year: "2027", demand: null, dcDemand: null, projected: 5180, dcProjected: 1050 },
  { year: "2028", demand: null, dcDemand: null, projected: 5490, dcProjected: 1350 },
  { year: "2029", demand: null, dcDemand: null, projected: 5830, dcProjected: 1700 },
  { year: "2030", demand: null, dcDemand: null, projected: 6210, dcProjected: 2100 },
];

const annotations = [
  { year: "2020", label: "COVID drop", color: "rgba(239,68,68,0.4)" },
  { year: "2022", label: "IRA signed + ChatGPT", color: "rgba(240,165,0,0.4)" },
  { year: "2024", label: "TMI restart + SMR deal", color: "rgba(240,165,0,0.5)" },
];

interface KpiData {
  aiPowerIndex: number;
  nriValue: number;
  gridStress: number;
  smrPolicyScore: number;
  nriBaseDate: string;
  constituents: {
    // AI Power Index constituents (intraday % change signals)
    nvdaChange: number; tsmChange: number; eqixChange: number; muChange: number;
    // NRI constituents (price performance since Jan 1, 2024 base)
    cegPerf: number; vstPerf: number; ccjPerf: number; nlrPerf: number;
    uPerf: number; policyPerf: number; nriPolicyMultiplier: number; nriMomentum: number;
    // Grid Stress signals
    vstChange: number; cegChange: number;
  };
}

const SECTOR_DEMAND = [
  { sector: "Residential", twh: 1658, yoy: 2.1, color: "#6b7280" },
  { sector: "Commercial", twh: 1569, yoy: 2.4, color: "#8b5cf6" },
  { sector: "Industrial", twh: 975, yoy: -3.2, color: "#94a3b8" },
  { sector: "Data Centers", twh: 288, yoy: 33.3, color: "#f0a500" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const ann = annotations.find((a) => a.year === label);
    return (
      <div className="bg-card border border-card-border rounded-lg p-3 shadow-xl text-xs">
        <p className="font-semibold text-foreground mb-2">{label}</p>
        {payload.map((entry: any, i: number) => (
          entry.value != null && (
            <p key={i} style={{ color: entry.stroke || entry.color }}>
              {entry.name}: {entry.value.toLocaleString()} TWh
            </p>
          )
        ))}
        {ann && <p className="text-amber-400 mt-1 font-medium">* {ann.label}</p>}
      </div>
    );
  }
  return null;
};

function ConstituentRow({ label, value }: { label: string; value: number }) {
  const isUp = value >= 0;
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono font-semibold ${isUp ? "text-green-400" : "text-red-400"}`}>
        {isUp ? "+" : ""}{value.toFixed(2)}%
      </span>
    </div>
  );
}

function PerfRow({ label, perf, base }: { label: string; perf: number; base?: string }) {
  const pct = ((perf - 1) * 100).toFixed(1);
  const isUp = perf >= 1;
  return (
    <div className="flex items-center justify-between text-xs py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {base && <span className="text-muted-foreground/50 font-mono">{base}</span>}
        <span className={`font-mono font-semibold ${isUp ? "text-green-400" : "text-red-400"}`}>
          {isUp ? "+" : ""}{pct}%
        </span>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  title,
  value,
  unit,
  subtitle,
  color,
  methodology,
  constituents,
  isLoading,
}: {
  icon: any;
  title: string;
  value: number | null;
  unit: string;
  subtitle?: string;
  color: "neutral" | "amber" | "red";
  methodology: string;
  constituents?: React.ReactNode;
  isLoading: boolean;
}) {
  const colorMap = {
    neutral: {
      icon: "text-muted-foreground",
      bg: "bg-muted/25",
      border: "border-card-border",
      value: "text-foreground",
    },
    amber: {
      icon: "text-[#F0A500]",
      bg: "bg-[#F0A500]/10",
      border: "border-[#F0A500]/25",
      value: "text-[#F0A500]",
    },
    red: {
      icon: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/25",
      value: "text-orange-400",
    },
  };
  const c = colorMap[color];

  return (
    <Card className={`p-5 border ${c.border} relative`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${c.bg} border ${c.border}`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
        <UITooltip>
          <TooltipTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors" data-testid={`tooltip-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              <Info className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-72 p-3">
            <p className="text-xs leading-relaxed mb-2">{methodology}</p>
            {constituents && <div className="border-t border-border pt-2 mt-2">{constituents}</div>}
          </TooltipContent>
        </UITooltip>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">{title}</p>
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-20 mt-1" />
            <Skeleton className="h-3 w-32 mt-2" />
          </>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold tabular-nums ${c.value}`}>
                {value !== null ? value.toFixed(1) : "--"}
              </span>
              <span className="text-sm text-muted-foreground mb-1.5">{unit}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              {subtitle ?? "Derived from live market signals. Hover for methodology."}
            </p>
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

  const c = kpiData?.constituents;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-[#F0A500]/15 text-[#F0A500] border-[#F0A500]/30 text-xs font-mono tracking-wider">
                LIVE
              </Badge>
              <span className="text-xs text-muted-foreground tracking-wide">Real-time AI Power Economy Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              The Grid is <span className="text-[#F0A500]">Tilting</span>
            </h1>
            <p className="text-muted-foreground mt-1.5 max-w-xl text-sm leading-relaxed">
              AI data centers now consume 2-3% of global electricity and accelerating. Track the economic relationship between AI compute demand, power consumption, and the financial markets positioned around it.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="relative flex h-2 w-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <div className="animate-ping absolute h-2 w-2 rounded-full bg-green-500 opacity-75" />
            </div>
            <span>Markets updating every 15 min</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* KPI Cards */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Composite Indicators</h2>
            <UITooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Each index is derived from live intraday price signals of constituent securities, anchored to a structural baseline from EIA and utility industry data.</p>
              </TooltipContent>
            </UITooltip>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              icon={Activity}
              title="AI Power Demand Index"
              value={kpiData?.aiPowerIndex ?? null}
              unit="/ 100"
              subtitle="Structural baseline 72 from EIA data. Hover for methodology."
              color="neutral"
              methodology="Structural baseline of 72/100, anchored to three verified inputs: US data center electricity share ~6.4% of the national grid (EIA 2025 estimate: ~288 TWh, up from 4.4% in 2023 per DOE; DOE projects 12%+ by 2028), AI workload demand CAGR of ~33%/yr (2022-2026 actuals, EIA + utility regulatory filings), and $328B in Big 4 hyperscaler AI capex for 2025 (AMZN $105B, GOOGL $75B, MSFT $83B, META $65B; 2026 guided ~$350B, ~80% AI-focused). A score of 100 represents theoretical full-grid saturation by AI demand. Intraday momentum layer: NVDA (40%) + TSM (25%) + EQIX (20%) + MU (15%), scaled 1.2x."
              constituents={c && (
                <>
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">Today's momentum signals</p>
                  <ConstituentRow label="NVDA (40%)" value={c.nvdaChange} />
                  <ConstituentRow label="TSM (25%)" value={c.tsmChange} />
                  <ConstituentRow label="EQIX (20%)" value={c.eqixChange} />
                  <ConstituentRow label="MU (15%)" value={c.muChange} />
                </>
              )}
              isLoading={isLoading}
            />
            <KpiCard
              icon={Zap}
              title="Nuclear Renaissance Index"
              value={kpiData?.nriValue ?? null}
              unit=""
              subtitle={`Anchored basket index. Base: ${kpiData?.nriBaseDate ?? "Jan 1, 2024"} = 100`}
              color="amber"
              methodology={`Anchored basket index, base = 100 on January 1, 2024 (the inflection point when AI baseload narratives began accelerating). Six components: CEG 25%, VST 20%, CCJ 15%, NLR ETF 20%, uranium spot 10%, SMR policy tracker 10%. Policy component normalized so score 5/10 = 1.0 baseline. A separate policy multiplier (0.9-1.1) captures the regulatory regime: current score ${kpiData?.smrPolicyScore ?? 7.8}/10 (NRC Kairos/Oklo approvals, Microsoft TMI restart PPA, Amazon nuclear PPAs). Current performance vs Jan 2024: CEG +98%, VST +521%, CCJ flat, uranium spot +1% (recovered to ~$92/lb in Mar 2026 after peaking at $107 in Feb 2024 and pulling back).`}
              constituents={c && (
                <>
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">Performance vs Jan 1, 2024</p>
                  <PerfRow label="CEG (25%)" perf={c.cegPerf} base="base $146" />
                  <PerfRow label="VST (20%)" perf={c.vstPerf} base="base $28.50" />
                  <PerfRow label="CCJ (15%)" perf={c.ccjPerf} base="base $47.50" />
                  <PerfRow label="NLR ETF (20%)" perf={c.nlrPerf} base="base $68" />
                  <PerfRow label="Uranium spot (10%)" perf={c.uPerf} base="base $91/lb" />
                  <div className="flex items-center justify-between text-xs py-0.5 mt-1 pt-1.5 border-t border-border/50">
                    <span className="text-muted-foreground">Policy multiplier</span>
                    <span className="font-mono font-semibold text-[#F0A500]">{c.nriPolicyMultiplier?.toFixed(3)}x</span>
                  </div>
                </>
              )}
              isLoading={isLoading}
            />
            <KpiCard
              icon={AlertTriangle}
              title="Grid Stress Score"
              value={kpiData?.gridStress ?? null}
              unit="/ 100"
              subtitle="PJM/MISO/ERCOT reserve margin signal. Hover for methodology."
              color="red"
              methodology="Structural baseline of 68/100, derived from three converging pressures: MISO reserve margin is now 13.4% (2026 NERC LTRA projection), the most constrained major US RTO, with formal capacity shortfall warnings through 2028; PJM at 17.5% is declining as AI load outpaces new capacity additions; ERCOT logged 1,200+ high-price scarcity hours in 2025 at a 15.8% reserve margin (slight recovery from solar/battery additions). A score of 100 represents declared grid emergency conditions. Intraday momentum: VST (40%) + CEG (35%) as merchant power price proxies (rising = power prices tightening) + EQIX (25%) as forward DC load commitment signal. Above 75 = elevated regional constraint risk."
              constituents={c && (
                <>
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">Today's momentum signals</p>
                  <ConstituentRow label="VST (40%) merchant power" value={c.vstChange} />
                  <ConstituentRow label="CEG (35%) nuclear utility" value={c.cegChange} />
                  <ConstituentRow label="EQIX (25%) DC load proxy" value={c.eqixChange} />
                </>
              )}
              isLoading={isLoading}
            />
          </div>
        </div>

        {/* Main demand chart */}
        <Card className="p-6 border-card-border">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-foreground">US Electricity Demand</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">US electricity demand was flat for a decade. AI data centers are reversing this trend for the first time since the industrial era, driving a structural upward shift utilities and grid operators were not prepared for.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <p className="text-xs text-muted-foreground">Historical EIA data (TWh) + AI-era projection to 2030, with data center subset</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm bg-[#1E90FF]" />
                <span className="text-muted-foreground">Total Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm bg-[#F0A500]" />
                <span className="text-muted-foreground">AI-Era Projection</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm" style={{ backgroundColor: "#a855f7" }} />
                <span className="text-muted-foreground">DC Demand</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={electricityData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1E90FF" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#1E90FF" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F0A500" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#F0A500" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="dcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                interval={2}
              />
              <YAxis
                yAxisId="total"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                domain={[3600, 6600]}
                width={40}
              />
              <YAxis
                yAxisId="dc"
                orientation="right"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}`}
                domain={[0, 2500]}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Grid capacity reference line */}
              <ReferenceLine
                yAxisId="total"
                y={5100}
                stroke="rgba(239,68,68,0.35)"
                strokeDasharray="5 3"
                label={{ value: "Grid Capacity ~5,100 TWh", position: "right", fill: "#ef4444", fontSize: 9, dx: -90 }}
              />

              {/* Event annotations */}
              {annotations.map((a) => (
                <ReferenceLine
                  key={a.year}
                  yAxisId="total"
                  x={a.year}
                  stroke={a.color}
                  strokeDasharray="3 3"
                />
              ))}

              {/* Flat decade bracket annotation region */}
              <ReferenceLine
                yAxisId="total"
                x="2010"
                stroke="rgba(107,114,128,0.2)"
              />

              <Area
                yAxisId="total"
                type="monotone"
                dataKey="demand"
                name="Total Actual"
                stroke="#1E90FF"
                strokeWidth={2.5}
                fill="url(#demandGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#1E90FF" }}
                connectNulls={false}
              />
              <Area
                yAxisId="total"
                type="monotone"
                dataKey="projected"
                name="AI-Era Projection"
                stroke="#F0A500"
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="url(#projGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#F0A500" }}
                connectNulls={false}
              />
              <Area
                yAxisId="dc"
                type="monotone"
                dataKey="dcDemand"
                name="DC Actual"
                stroke="#a855f7"
                strokeWidth={1.5}
                fill="url(#dcGrad)"
                dot={false}
                connectNulls={false}
              />
              <Line
                yAxisId="dc"
                type="monotone"
                dataKey="dcProjected"
                name="DC Projected"
                stroke="#a855f7"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Annotation key */}
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            <span className="text-amber-400/80">* 2022: IRA signed + ChatGPT launch</span>
            <span className="text-amber-400/80">* 2024: TMI restart + first commercial SMR contract</span>
            <span className="text-red-400/70">--- Grid capacity ceiling</span>
          </div>
        </Card>

        {/* 4-column stat strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "DC Share of US Demand", value: "~6.4%", sub: "EIA 2025 estimate: ~288 TWh (up from 4.4% in 2023). DOE projects 12%+ by 2028 as AI load accelerates.", color: "#a855f7" },
            { label: "Hyperscaler AI Capex 2025", value: "$328B", sub: "Big 4 actuals (AMZN $105B, GOOGL $75B, MSFT $83B, META $65B). 2026 guided ~$350B+. ~80% AI-focused.", color: "#F0A500" },
            { label: "Nuclear Power Committed", value: "12+ GW", sub: "Big Tech nuclear PPAs as of Q1 2026. Meta 6.6 GW, Microsoft 1.2 GW (TMI restart), Amazon 2.5+ GW, Google 500+ MW.", color: "#F0A500" },
            { label: "Grid Shortfall Risk", value: "Active Now", sub: "MISO at 13.4% reserve margin (2026 NERC LTRA) is now the most constrained US grid. First capacity shortfall period.", color: "#F07040" },
          ].map((s) => (
            <Card key={s.label} className="p-4 border-card-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{s.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">{s.sub}</p>
            </Card>
          ))}
        </div>

        {/* Sector demand breakdown */}
        <Card className="p-5 border-card-border">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">2025 US Electricity Demand by Sector</h2>
            <UITooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Source: EIA Electric Power Monthly (2025 data). Data center demand is the fastest-growing sector at +33% YoY, compressing a decade of flat growth into a single investment thesis.</p>
              </TooltipContent>
            </UITooltip>
          </div>
          <div className="divide-y divide-border">
            {SECTOR_DEMAND.map((s) => (
              <div key={s.sector} className="flex items-center gap-4 py-2.5">
                <div className="w-24 flex-shrink-0">
                  <p className="text-xs font-medium text-foreground">{s.sector}</p>
                </div>
                <div className="flex-1">
                  <div className="bg-muted/30 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${(s.twh / 4490) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs font-mono text-foreground w-20 text-right">{s.twh.toLocaleString()} TWh</p>
                <div className={`flex items-center gap-1 w-16 justify-end text-xs font-mono font-semibold ${s.yoy >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {s.yoy >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(s.yoy)}% YoY
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            US electricity demand was essentially flat 2010-2022. By 2025, total demand reached ~4,490 TWh, up 15% from the 2022 trough. Data center load is now the fastest-growing sector at +33% YoY in 2025, compressing what was projected to be a decade of growth into three years.
          </p>
        </Card>
      </div>
    </div>
  );
}
