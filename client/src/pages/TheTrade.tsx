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
  Cell,
  ReferenceLine,
} from "recharts";
import { Info, TrendingUp, Zap, Cpu, Server, Building2, DollarSign } from "lucide-react";

const BASE_POWER_TWH = 4380;
const BASE_YEAR = 2024;

const TOP_COMPANIES = [
  { ticker: "NVDA", name: "NVIDIA Corporation", segment: "Compute", dcRevenueExposure: 87, color: "#1E90FF" },
  { ticker: "CEG", name: "Constellation Energy", segment: "Power", dcRevenueExposure: 72, color: "#F0A500" },
  { ticker: "EQIX", name: "Equinix Inc", segment: "Infrastructure", dcRevenueExposure: 95, color: "#a855f7" },
  { ticker: "CCJ", name: "Cameco Corporation", segment: "Power", dcRevenueExposure: 68, color: "#F0A500" },
  { ticker: "VST", name: "Vistra Corp", segment: "Power", dcRevenueExposure: 61, color: "#F0A500" },
  { ticker: "DLR", name: "Digital Realty Trust", segment: "Infrastructure", dcRevenueExposure: 98, color: "#a855f7" },
  { ticker: "AMD", name: "Advanced Micro Devices", segment: "Compute", dcRevenueExposure: 55, color: "#1E90FF" },
  { ticker: "NEE", name: "NextEra Energy", segment: "Power", dcRevenueExposure: 42, color: "#F0A500" },
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
        <p className="text-muted-foreground">Revenue Exposure: <span className="text-foreground font-medium">{payload[0]?.value?.toFixed(0)}%</span></p>
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
      const aiDemand = BASE_POWER_TWH * 0.045 * compoundedGrowth;
      const totalDemand = BASE_POWER_TWH + aiDemand;
      const nuclearContrib = totalDemand * (nuclearShift[0] / 100);
      return {
        year: year.toString(),
        totalDemand: Math.round(totalDemand),
        aiDemand: Math.round(aiDemand),
        nuclearContrib: Math.round(nuclearContrib),
        renewables: Math.round(totalDemand * 0.3),
      };
    });
  }, [aiGrowth, nuclearShift]);

  const powerDemandIn2030 = projections[projections.length - 1]?.totalDemand ?? 0;
  const demandGrowthPct = (((powerDemandIn2030 - BASE_POWER_TWH) / BASE_POWER_TWH) * 100).toFixed(1);
  const aiShareIn2030 = ((projections[projections.length - 1]?.aiDemand / powerDemandIn2030) * 100).toFixed(1);

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

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">The Trade</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Build your AI power thesis. Adjust assumptions — see which companies win.
            </p>
          </div>
          <UITooltip>
            <TooltipTrigger>
              <Badge className="bg-[#F0A500]/15 text-[#F0A500] border-[#F0A500]/30 cursor-help">
                <Info className="h-3 w-3 mr-1" />
                Why This Matters
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">The AI power trade is about identifying which publicly-traded companies have the most revenue tied to AI infrastructure build-out. Adjust your assumptions and let the math surface the highest-conviction plays.</p>
            </TooltipContent>
          </UITooltip>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
          {/* Left: Thesis builder */}
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Thesis Assumptions</h2>

              <div className="space-y-6">
                {/* Slider 1: AI Workload Growth */}
                <Card className="p-5 border-card-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-[#1E90FF]" />
                      <div>
                        <p className="text-sm font-medium text-foreground">AI Workload Growth / yr</p>
                        <p className="text-xs text-muted-foreground">Expected annual growth in AI compute demand</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#1E90FF]">{aiGrowth[0]}%</p>
                      <p className="text-xs text-muted-foreground">
                        {aiGrowth[0] < 20 ? "Conservative" : aiGrowth[0] < 35 ? "Moderate" : "Aggressive"}
                      </p>
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
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>5% (Slowdown)</span>
                    <span>60% (Hypergrowth)</span>
                  </div>
                </Card>

                {/* Slider 2: PUE */}
                <Card className="p-5 border-card-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-purple-400" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Avg Data Center PUE</p>
                        <p className="text-xs text-muted-foreground">Power Usage Effectiveness (1.0 = perfect)</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-purple-400">{pue[0].toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {pue[0] < 1.2 ? "Best-in-class" : pue[0] < 1.4 ? "Industry avg" : "Inefficient"}
                      </p>
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
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>1.0 (Ideal)</span>
                    <span>1.8 (Legacy DC)</span>
                  </div>
                </Card>

                {/* Slider 3: Nuclear shift */}
                <Card className="p-5 border-card-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-[#F0A500]" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Nuclear Power Share</p>
                        <p className="text-xs text-muted-foreground">% of new DC power coming from nuclear</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#F0A500]">{nuclearShift[0]}%</p>
                      <p className="text-xs text-muted-foreground">
                        {nuclearShift[0] < 10 ? "Minimal adoption" : nuclearShift[0] < 25 ? "Growing trend" : "Nuclear renaissance"}
                      </p>
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
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>0% (Status quo)</span>
                    <span>50% (Full nuclear)</span>
                  </div>
                </Card>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md p-3 bg-muted/30 border border-border text-center">
                    <p className="text-xs text-muted-foreground mb-1">2030 Demand</p>
                    <p className="text-lg font-bold text-foreground">{(powerDemandIn2030 / 1000).toFixed(1)}k</p>
                    <p className="text-xs text-muted-foreground">TWh</p>
                  </div>
                  <div className="rounded-md p-3 bg-muted/30 border border-border text-center">
                    <p className="text-xs text-muted-foreground mb-1">Growth vs Now</p>
                    <p className="text-lg font-bold text-[#1E90FF]">+{demandGrowthPct}%</p>
                    <p className="text-xs text-muted-foreground">by 2030</p>
                  </div>
                  <div className="rounded-md p-3 bg-muted/30 border border-border text-center">
                    <p className="text-xs text-muted-foreground mb-1">AI Share</p>
                    <p className="text-lg font-bold text-[#F0A500]">{aiShareIn2030}%</p>
                    <p className="text-xs text-muted-foreground">of grid</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Projections + ranked companies */}
          <div className="space-y-6">
            {/* Demand projection chart */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Projected US Power Demand</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Demand broken into AI-driven incremental load vs. base grid demand. Assumes PUE overhead is applied to AI workload growth.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <Card className="p-4 border-card-border">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={projections} margin={{ top: 5, right: 5, left: 5, bottom: 5 }} barSize={28}>
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
                    <Bar dataKey="totalDemand" name="Base Grid" fill="rgba(30,144,255,0.3)" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="aiDemand" name="AI-Driven Load" fill="#1E90FF" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="nuclearContrib" name="Nuclear Share" fill="#F0A500" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-4 text-xs mt-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-3 rounded-sm bg-[#1E90FF]/30" />
                    <span className="text-muted-foreground">Base Grid</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-3 rounded-sm bg-[#1E90FF]" />
                    <span className="text-muted-foreground">AI Load</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-3 rounded-sm bg-[#F0A500]" />
                    <span className="text-muted-foreground">Nuclear</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Ranked companies */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top 5 Leveraged Companies</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Companies ranked by their estimated revenue exposure to AI power infrastructure, adjusted by your scenario inputs. Higher AI growth benefits Compute plays; higher nuclear shift boosts Power names.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <div className="space-y-2">
                {rankedCompanies.map((company, index) => {
                  const SegIcon = segmentIcons[company.segment] ?? DollarSign;
                  return (
                    <Card key={company.ticker} className="p-3 border-card-border" data-testid={`trade-company-${company.ticker}`}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/40 text-xs font-bold text-muted-foreground flex-shrink-0">
                          #{index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-sm text-foreground">{company.ticker}</span>
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
                          <p className="font-bold text-base" style={{ color: company.color }}>
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
              <p className="text-xs text-muted-foreground mt-3">
                Rankings adjust in real time as you move the sliders above. Exposure scores are model estimates, not financial advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
