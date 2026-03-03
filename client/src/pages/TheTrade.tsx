import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Info, TrendingUp, Zap, Cpu, Server, DollarSign } from "lucide-react";

const BASE_POWER_TWH = 4380;
const BASE_YEAR = 2024;

const TOP_COMPANIES = [
  { ticker: "NVDA", name: "NVIDIA Corporation", segment: "Compute", dcRevenueExposure: 87, color: "#1E90FF" },
  { ticker: "CEG", name: "Constellation Energy", segment: "Power", dcRevenueExposure: 72, color: "#F0A500" },
  { ticker: "EQIX", name: "Equinix Inc", segment: "Infrastructure", dcRevenueExposure: 95, color: "#a855f7" },
  { ticker: "VRT", name: "Vertiv Holdings", segment: "Infrastructure", dcRevenueExposure: 92, color: "#a855f7" },
  { ticker: "CCJ", name: "Cameco Corporation", segment: "Power", dcRevenueExposure: 68, color: "#F0A500" },
  { ticker: "VST", name: "Vistra Corp", segment: "Power", dcRevenueExposure: 61, color: "#F0A500" },
  { ticker: "TSM", name: "Taiwan Semiconductor", segment: "Compute", dcRevenueExposure: 78, color: "#1E90FF" },
  { ticker: "AMD", name: "Advanced Micro Devices", segment: "Compute", dcRevenueExposure: 55, color: "#1E90FF" },
];

const segmentIcons: Record<string, any> = {
  Compute: Cpu,
  Infrastructure: Server,
  Power: Zap,
};

const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-card-border rounded-lg p-3 text-xs shadow-xl">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        <p className="text-muted-foreground">Revenue Exposure: <span className="text-foreground font-mono font-medium">{payload[0]?.value?.toFixed(0)}%</span></p>
        <p className="text-muted-foreground">Segment: <span className="text-foreground font-medium">{payload[0]?.payload?.segment}</span></p>
      </div>
    );
  }
  return null;
};

export default function TheTrade() {
  const [aiGrowth, setAiGrowth] = useState([28]);
  const [pue, setPue] = useState([1.35]);
  const [nuclearShift, setNuclearShift] = useState([15]);

  const projections = useMemo(() => {
    const growth = aiGrowth[0] / 100;
    const years = [2025, 2026, 2027, 2028, 2029, 2030];
    return years.map((year) => {
      const yearsOut = year - BASE_YEAR;
      const compoundedGrowth = Math.pow(1 + growth, yearsOut);
      const aiDemand = BASE_POWER_TWH * 0.045 * compoundedGrowth * pue[0];
      const totalDemand = BASE_POWER_TWH + aiDemand;
      const nuclearContrib = totalDemand * (nuclearShift[0] / 100);
      return {
        year: year.toString(),
        totalDemand: Math.round(totalDemand),
        aiDemand: Math.round(aiDemand),
        nuclearContrib: Math.round(nuclearContrib),
      };
    });
  }, [aiGrowth, nuclearShift, pue]);

  const powerDemandIn2030 = projections[projections.length - 1]?.totalDemand ?? 0;
  const demandGrowthPct = (((powerDemandIn2030 - BASE_POWER_TWH) / BASE_POWER_TWH) * 100).toFixed(1);
  const aiShareIn2030 = ((projections[projections.length - 1]?.aiDemand / powerDemandIn2030) * 100).toFixed(1);
  const nuclearIn2030 = ((projections[projections.length - 1]?.nuclearContrib / powerDemandIn2030) * 100).toFixed(1);

  const rankedCompanies = [...TOP_COMPANIES]
    .map((c) => ({
      ...c,
      adjustedExposure: c.segment === "Power"
        ? c.dcRevenueExposure * (1 + nuclearShift[0] / 100)
        : c.segment === "Compute"
        ? c.dcRevenueExposure * (1 + aiGrowth[0] / 100 * 0.5)
        : c.dcRevenueExposure * (1 + aiGrowth[0] / 100 * 0.3),
    }))
    .sort((a, b) => b.adjustedExposure - a.adjustedExposure)
    .slice(0, 5);

  const aiGrowthLabel = aiGrowth[0] < 20 ? "Base Case" : aiGrowth[0] < 35 ? "Consensus" : "Bull Case";
  const pueLabel = pue[0] < 1.2 ? "Frontier Efficiency" : pue[0] < 1.45 ? "Industry Standard" : "Legacy Infrastructure";
  const nuclearLabel = nuclearShift[0] < 10 ? "Gas-Dominant Mix" : nuclearShift[0] < 25 ? "Balanced Transition" : "Nuclear Renaissance";

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">The Trade</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-xl">
              Parametric demand modeling. Stress-test your macro assumptions and identify the highest-leverage positions across the AI power supply chain.
            </p>
          </div>
          <UITooltip>
            <TooltipTrigger>
              <Badge className="bg-[#F0A500]/15 text-[#F0A500] border-[#F0A500]/30 cursor-help">
                <Info className="h-3 w-3 mr-1" />
                Methodology
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs leading-relaxed">Revenue exposure scores are estimated percentages of each company's forward revenue attributable to AI power infrastructure. Slider adjustments apply segment-specific multipliers: AI growth affects Compute (0.5x leverage) and Infrastructure (0.3x); nuclear shift scales Power names directly. These are scenario estimates, not financial advice.</p>
            </TooltipContent>
          </UITooltip>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
          {/* Left: Model parameters */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Model Parameters</h2>

              <div className="space-y-4">
                {/* Slider 1: AI Workload Growth */}
                <Card className="p-5 border-card-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-[#1E90FF]" />
                      <div>
                        <p className="text-sm font-medium text-foreground">AI Workload CAGR</p>
                        <p className="text-xs text-muted-foreground">Annual growth in AI compute demand, compounded to 2030</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold font-mono text-[#1E90FF]">{aiGrowth[0]}%</p>
                      <Badge className="bg-[#1E90FF]/10 text-[#1E90FF] border-[#1E90FF]/20 text-xs mt-1">
                        {aiGrowthLabel}
                      </Badge>
                    </div>
                  </div>
                  <Slider
                    value={aiGrowth}
                    onValueChange={setAiGrowth}
                    min={5}
                    max={60}
                    step={1}
                    className="mt-2"
                    data-testid="slider-ai-growth"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                    <span>5% Downside</span>
                    <span>60% Hypergrowth</span>
                  </div>
                </Card>

                {/* Slider 2: PUE */}
                <Card className="p-5 border-card-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-purple-400" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Avg Data Center PUE</p>
                        <p className="text-xs text-muted-foreground">Power Usage Effectiveness multiplier on AI load (1.0 = lossless)</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold font-mono text-purple-400">{pue[0].toFixed(2)}x</p>
                      <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs mt-1">
                        {pueLabel}
                      </Badge>
                    </div>
                  </div>
                  <Slider
                    value={pue}
                    onValueChange={setPue}
                    min={1.0}
                    max={1.8}
                    step={0.05}
                    className="mt-2"
                    data-testid="slider-pue"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                    <span>1.0 Frontier</span>
                    <span>1.8 Legacy</span>
                  </div>
                </Card>

                {/* Slider 3: Nuclear shift */}
                <Card className="p-5 border-card-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-[#F0A500]" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Nuclear Power Share</p>
                        <p className="text-xs text-muted-foreground">Percent of incremental DC power sourced from nuclear capacity</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold font-mono text-[#F0A500]">{nuclearShift[0]}%</p>
                      <Badge className="bg-[#F0A500]/10 text-[#F0A500] border-[#F0A500]/20 text-xs mt-1">
                        {nuclearLabel}
                      </Badge>
                    </div>
                  </div>
                  <Slider
                    value={nuclearShift}
                    onValueChange={setNuclearShift}
                    min={0}
                    max={50}
                    step={1}
                    className="mt-2"
                    data-testid="slider-nuclear"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                    <span>0% Gas-Dominant</span>
                    <span>50% Full Nuclear</span>
                  </div>
                </Card>

                {/* Output summary */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "2030 Demand", value: `${(powerDemandIn2030 / 1000).toFixed(1)}k`, unit: "TWh", color: "text-foreground" },
                    { label: "Grid Growth", value: `+${demandGrowthPct}%`, unit: "vs 2024", color: "text-[#1E90FF]" },
                    { label: "AI Grid Share", value: `${aiShareIn2030}%`, unit: "by 2030", color: "text-[#F0A500]" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-md p-3 bg-muted/30 border border-border text-center">
                      <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{s.label}</p>
                      <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.unit}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Projections + ranked companies */}
          <div className="space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Projected US Power Demand (TWh)</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Demand stack from 2025-2030 under your configured scenario. AI-driven load applies PUE overhead. Nuclear share is carved out of total demand to show zero-carbon baseload coverage.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <Card className="p-4 border-card-border">
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={projections} margin={{ top: 5, right: 5, left: 5, bottom: 5 }} barSize={26}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      domain={[3000, "auto"]}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-card border border-card-border rounded-lg p-3 text-xs shadow-xl">
                            <p className="font-semibold text-foreground mb-2">{label}</p>
                            {payload.map((p: any, i: number) => (
                              <p key={i} style={{ color: p.fill }}>
                                {p.name}: {p.value?.toLocaleString()} TWh
                              </p>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="totalDemand" name="Base Grid" fill="rgba(30,144,255,0.25)" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="aiDemand" name="AI-Driven Load" fill="#1E90FF" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="nuclearContrib" name="Nuclear Share" fill="#F0A500" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-4 text-xs mt-2">
                  {[
                    { color: "bg-[#1E90FF]/25", label: "Base Grid" },
                    { color: "bg-[#1E90FF]", label: "AI Load" },
                    { color: "bg-[#F0A500]", label: "Nuclear" },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-1.5">
                      <div className={`h-2 w-3 rounded-sm ${l.color}`} />
                      <span className="text-muted-foreground">{l.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* Ranked companies */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Highest-Exposure Positions</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Companies ranked by estimated revenue exposure to AI power infrastructure, dynamically adjusted by your scenario parameters. Higher AI growth amplifies Compute names; higher nuclear share lifts Power names.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <div className="space-y-2">
                {rankedCompanies.map((company, index) => {
                  const SegIcon = segmentIcons[company.segment] ?? DollarSign;
                  return (
                    <Card key={company.ticker} className="p-3 border-card-border" data-testid={`trade-company-${company.ticker}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/40 text-xs font-bold font-mono text-muted-foreground flex-shrink-0">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="font-bold text-sm text-foreground font-mono">{company.ticker}</span>
                            <Badge
                              className="text-xs px-1.5 py-0"
                              style={{
                                backgroundColor: `${company.color}20`,
                                color: company.color,
                                border: `1px solid ${company.color}40`,
                              }}
                            >
                              <SegIcon className="h-2.5 w-2.5 mr-1" />
                              {company.segment}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{company.name}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-base font-mono" style={{ color: company.color }}>
                            {Math.min(company.adjustedExposure, 100).toFixed(0)}%
                          </p>
                          <p className="text-xs text-muted-foreground">exposure</p>
                        </div>
                      </div>
                      <div className="mt-2 bg-muted/30 rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(company.adjustedExposure, 100)}%`,
                            backgroundColor: company.color,
                          }}
                        />
                      </div>
                    </Card>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                Rankings update as you adjust parameters above. Exposure scores are scenario model estimates, not financial advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
