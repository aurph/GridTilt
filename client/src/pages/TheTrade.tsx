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

// Thesis Leverage scores (0-10 qualitative analyst ranking, not revenue attribution)
// Rankings reflect structural positioning in the AI power supply chain.
// NVDA: GPU monopoly on AI training compute, >80% AI accelerator share
// EQIX: 100% data center revenue, highest power density in colocation
// VRT: Thermal and power management for every AI DC, organic revenue +19%
// CEG: Largest nuclear utility operator, signed first AI baseload PPA with Microsoft
// CCJ: Pure uranium miner, highest direct spot price beta of any public name
// TSM: Manufactures all advanced AI chips (H100, B200), CoWoS advanced packaging bottleneck
// VST: Merchant power with nuclear+gas mix, direct beneficiary of power price tightening
// AMD: GPU inference competitor, datacenter GPU revenue +122% YoY, second-largest player
const TOP_COMPANIES = [
  { ticker: "NVDA", name: "NVIDIA Corporation", segment: "Compute", thesisScore: 9.5, rationale: "GPU monopoly, >80% AI accelerator share", color: "#1E90FF" },
  { ticker: "EQIX", name: "Equinix Inc", segment: "Infrastructure", thesisScore: 9.0, rationale: "100% DC revenue, highest power density growth", color: "#a855f7" },
  { ticker: "VRT", name: "Vertiv Holdings", segment: "Infrastructure", thesisScore: 8.8, rationale: "Critical thermal mgmt for every AI data center", color: "#a855f7" },
  { ticker: "CEG", name: "Constellation Energy", segment: "Power", thesisScore: 8.2, rationale: "Largest nuclear utility + first AI baseload PPA", color: "#F0A500" },
  { ticker: "CCJ", name: "Cameco Corporation", segment: "Power", thesisScore: 7.5, rationale: "Pure uranium miner, highest spot price beta", color: "#F0A500" },
  { ticker: "TSM", name: "Taiwan Semiconductor", segment: "Compute", thesisScore: 7.2, rationale: "Manufactures all advanced AI chips", color: "#1E90FF" },
  { ticker: "VST", name: "Vistra Corp", segment: "Power", thesisScore: 7.0, rationale: "Merchant power, direct power price beneficiary", color: "#F0A500" },
  { ticker: "AMD", name: "Advanced Micro Devices", segment: "Compute", thesisScore: 6.0, rationale: "GPU inference competition, DC revenue +122% YoY", color: "#1E90FF" },
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
        <p className="text-muted-foreground">Thesis Leverage: <span className="text-foreground font-mono font-medium">{payload[0]?.value?.toFixed(1)}/10</span></p>
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

  const aiGrowthLabel = aiGrowth[0] < 20 ? "Base Case" : aiGrowth[0] < 35 ? "Consensus" : "Bull Case";
  const pueLabel = pue[0] < 1.2 ? "Frontier Efficiency" : pue[0] < 1.45 ? "Industry Standard" : "Legacy Infrastructure";
  const nuclearLabel = nuclearShift[0] < 10 ? "Gas-Dominant Mix" : nuclearShift[0] < 25 ? "Balanced Transition" : "Nuclear Renaissance";

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Thesis Calculator</h1>
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
              <p className="text-xs leading-relaxed">Thesis Leverage scores (0-10) are qualitative analyst rankings reflecting each company's structural positioning in the AI power supply chain. They are not revenue attribution figures. Slider adjustments apply scenario-driven bumps: AI growth shifts Compute and Infrastructure scores proportionally; nuclear shift amplifies Power names. These are scenario estimates, not financial advice.</p>
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
                    <p className="text-xs">All positions ranked by scenario-adjusted exposure score. Delta shows change from base estimate driven by your parameter inputs. Scores are model estimates, not financial advice.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <Card className="border-card-border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1.5rem_1fr_auto_auto] gap-x-3 px-3 py-2 border-b border-border bg-muted/20">
                  <span className="text-xs text-muted-foreground font-mono">#</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Position</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider text-right">Thesis Leverage</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider text-right w-14">Delta</span>
                </div>
                {/* All 8 companies ranked by scenario-adjusted thesis leverage */}
                {[...TOP_COMPANIES]
                  .map((c) => {
                    const scenarioBump = c.segment === "Power"
                      ? c.thesisScore * (nuclearShift[0] / 100) * 0.4
                      : c.segment === "Compute"
                      ? c.thesisScore * (aiGrowth[0] / 100) * 0.25
                      : c.thesisScore * (aiGrowth[0] / 100) * 0.15;
                    const adjustedScore = Math.min(10.0, c.thesisScore + scenarioBump);
                    return { ...c, adjustedScore, delta: scenarioBump };
                  })
                  .sort((a, b) => b.adjustedScore - a.adjustedScore)
                  .map((company, index) => {
                    const SegIcon = segmentIcons[company.segment] ?? DollarSign;
                    return (
                      <div
                        key={company.ticker}
                        className="grid grid-cols-[1.5rem_1fr_auto_auto] gap-x-3 items-center px-3 py-2.5 border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors"
                        data-testid={`trade-company-${company.ticker}`}
                      >
                        <span className="text-xs font-mono text-muted-foreground/60">{index + 1}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-sm text-foreground font-mono tracking-wide">{company.ticker}</span>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded font-medium leading-none"
                              style={{ backgroundColor: `${company.color}18`, color: company.color }}
                            >
                              <SegIcon className="h-2.5 w-2.5 inline mr-0.5 -mt-0.5" />
                              {company.segment}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-muted/25 rounded-full h-1 max-w-[120px]">
                              <div
                                className="h-1 rounded-full transition-all duration-500"
                                style={{ width: `${(company.adjustedScore / 10) * 100}%`, backgroundColor: company.color, opacity: 0.8 }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground/60 font-mono truncate max-w-[100px]">{company.rationale}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-sm font-mono tabular-nums" style={{ color: company.color }}>
                            {company.adjustedScore.toFixed(1)}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">/10</span>
                        </div>
                        <div className="text-right w-14">
                          <span className={`text-xs font-mono tabular-nums font-medium ${company.delta > 0.05 ? "text-green-400" : "text-muted-foreground/40"}`}>
                            {company.delta > 0.05 ? `+${company.delta.toFixed(2)}` : "base"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </Card>
              <p className="text-xs text-muted-foreground mt-2.5 leading-relaxed">
                Qualitative analyst ranking reflecting structural positioning in the AI power supply chain. Not revenue attribution. Delta shows scenario-driven score shift. Not financial advice.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
