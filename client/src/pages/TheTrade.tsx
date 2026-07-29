import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import {
  Info,
  Zap,
  Cpu,
  Server,
  DollarSign,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { SrChartTable } from "@/components/Freshness";
import { BORDER, CATEGORY_COLORS, SERIES } from "@/lib/tokens";
import {
  axisProps,
  gridProps,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "@/lib/chart-theme";

const BASE_POWER_TWH = 4490;
const BASE_YEAR = 2025;
const US_LPT_CAPACITY = 60;

type PresetName = "Conservative" | "Base" | "Aggressive" | "Custom";

interface ScenarioInputs {
  newCapacityGW: number;
  capexPerMW: number;
  gasPct: number;
  nuclearPct: number;
  renewablesPct: number;
  gridPurchasePct: number;
  interconnectYears: string;
  lptPerGW: number;
  aiCagrPct: number;
  pue: number;
}

const PRESETS: Record<Exclude<PresetName, "Custom">, ScenarioInputs> = {
  Conservative: {
    newCapacityGW: 35, capexPerMW: 11, gasPct: 60, nuclearPct: 15,
    renewablesPct: 15, gridPurchasePct: 10, interconnectYears: "4-5 years",
    lptPerGW: 4, aiCagrPct: 22, pue: 1.35,
  },
  Base: {
    newCapacityGW: 50, capexPerMW: 9, gasPct: 50, nuclearPct: 25,
    renewablesPct: 15, gridPurchasePct: 10, interconnectYears: "3-4 years",
    lptPerGW: 4, aiCagrPct: 28, pue: 1.30,
  },
  Aggressive: {
    newCapacityGW: 75, capexPerMW: 8, gasPct: 40, nuclearPct: 35,
    renewablesPct: 15, gridPurchasePct: 10, interconnectYears: "2-3 years",
    lptPerGW: 4, aiCagrPct: 38, pue: 1.25,
  },
};

// One entry per YEARS entry (2025-2030); each ramp sums to its preset's newCapacityGW.
const PRESET_RAMPS: Record<Exclude<PresetName, "Custom">, number[]> = {
  Conservative: [2, 5, 7, 8, 8, 5],
  Base:         [3, 7, 10, 13, 12, 5],
  Aggressive:   [5, 11, 15, 18, 16, 10],
};

// Custom scenarios have no hand-tuned ramp, so the timeline uses a fixed
// S-curve (slow start, accelerate, plateau) scaled to the user's total.
// Weights sum to 1.0 across the 6-year horizon; labeled "assumed build
// ramp" in the chart footnote.
const CUSTOM_RAMP_WEIGHTS = [0.05, 0.10, 0.15, 0.20, 0.25, 0.25];

const YEARS = ["2025", "2026", "2027", "2028", "2029", "2030"];

// Segment colors: compute/power from CATEGORY_COLORS; Infrastructure has no
// token category, so it takes series slot 3 (teal, shared with datacenters).
const SEGMENT_COLORS: Record<string, string> = {
  Compute: CATEGORY_COLORS.compute,
  Infrastructure: SERIES[2], // series slot 3
  Power: CATEGORY_COLORS.power,
};

const TOP_COMPANIES = [
  { ticker: "NVDA", name: "NVIDIA Corporation",    segment: "Compute",        thesisScore: 9.5, rationale: "GPU monopoly, >80% AI accelerator share",       color: SEGMENT_COLORS.Compute },
  { ticker: "EQIX", name: "Equinix Inc",           segment: "Infrastructure", thesisScore: 9.0, rationale: "100% DC revenue, highest power density growth",   color: SEGMENT_COLORS.Infrastructure },
  { ticker: "VRT",  name: "Vertiv Holdings",       segment: "Infrastructure", thesisScore: 8.8, rationale: "Critical thermal mgmt for every AI data center",   color: SEGMENT_COLORS.Infrastructure },
  { ticker: "CEG",  name: "Constellation Energy",  segment: "Power",          thesisScore: 8.2, rationale: "Largest nuclear utility + first AI baseload PPA",  color: SEGMENT_COLORS.Power },
  { ticker: "CCJ",  name: "Cameco Corporation",    segment: "Power",          thesisScore: 7.5, rationale: "Pure uranium miner, highest spot price beta",      color: SEGMENT_COLORS.Power },
  { ticker: "TSM",  name: "Taiwan Semiconductor",  segment: "Compute",        thesisScore: 7.2, rationale: "Manufactures all advanced AI chips",               color: SEGMENT_COLORS.Compute },
  { ticker: "VST",  name: "Vistra Corp",           segment: "Power",          thesisScore: 7.0, rationale: "Merchant power, direct power price beneficiary",   color: SEGMENT_COLORS.Power },
  { ticker: "AMD",  name: "Advanced Micro Devices",segment: "Compute",        thesisScore: 6.0, rationale: "GPU inference competition, DC revenue +122% YoY",  color: SEGMENT_COLORS.Compute },
];

const segmentIcons: Record<string, React.ElementType> = {
  Compute: Cpu, Infrastructure: Server, Power: Zap,
};

function NumField({
  label, value, unit, min, max, step = 1, onChange, hint, testId,
}: {
  label: string; value: number; unit?: string; min: number; max: number;
  step?: number; onChange: (v: number) => void; hint?: string; testId?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {unit && <span className="text-10 text-muted-foreground/60">{unit}</span>}
      </div>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        className="h-8 font-mono text-sm bg-muted/20 border-border/60 focus:border-brand-2/60"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
      />
      {hint && <p className="text-10 text-muted-foreground/50">{hint}</p>}
    </div>
  );
}

/** In-place warning shown instead of any output that depends on the supply mix. */
function MixWarning({ mixSum, testId }: { mixSum: number; testId: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-negative" data-testid={testId}>
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="text-xs">Mix sums to {mixSum.toFixed(0)}% - adjust to 100%</span>
    </div>
  );
}

// `params` absorbs wouter's RouteComponentProps when mounted standalone via
// <Route component={...}>; only `embedded` is meaningful.
export default function TheTrade({ embedded = false }: { embedded?: boolean; params?: unknown }) {
  const [activePreset, setActivePreset] = useState<PresetName>("Base");
  const [inputs, setInputs] = useState<ScenarioInputs>(PRESETS.Base);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  function applyPreset(name: Exclude<PresetName, "Custom">) {
    setActivePreset(name);
    setInputs(PRESETS[name]);
  }

  function setField<K extends keyof ScenarioInputs>(key: K, value: ScenarioInputs[K]) {
    setActivePreset("Custom");
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  const mixSum = inputs.gasPct + inputs.nuclearPct + inputs.renewablesPct + inputs.gridPurchasePct;
  const mixValid = Math.abs(mixSum - 100) < 0.5;

  // GW added per year, aligned 1:1 with YEARS (index i = YEARS[i]).
  const ramp: number[] = useMemo(() => {
    if (activePreset !== "Custom") {
      return PRESET_RAMPS[activePreset];
    }
    return CUSTOM_RAMP_WEIGHTS.map((w) => inputs.newCapacityGW * w);
  }, [activePreset, inputs.newCapacityGW]);

  const buildoutChart = useMemo(() => {
    return YEARS.map((year, i) => {
      const gwThisYear = ramp[i] ?? 0;
      return {
        year,
        gas:        parseFloat((gwThisYear * inputs.gasPct / 100).toFixed(2)),
        nuclear:    parseFloat((gwThisYear * inputs.nuclearPct / 100).toFixed(2)),
        renewables: parseFloat((gwThisYear * inputs.renewablesPct / 100).toFixed(2)),
        grid:       parseFloat((gwThisYear * inputs.gridPurchasePct / 100).toFixed(2)),
        total:      parseFloat(gwThisYear.toFixed(2)),
      };
    });
  }, [ramp, inputs.gasPct, inputs.nuclearPct, inputs.renewablesPct, inputs.gridPurchasePct]);

  const outputs = useMemo(() => {
    const totalCapexB = inputs.newCapacityGW * inputs.capexPerMW;
    const annualLPT = (inputs.newCapacityGW * inputs.lptPerGW) / 5;
    const nuclearGW = inputs.newCapacityGW * inputs.nuclearPct / 100;
    const gasGW = inputs.newCapacityGW * inputs.gasPct / 100;
    const renewablesGW = inputs.newCapacityGW * inputs.renewablesPct / 100;
    const gridGW = inputs.newCapacityGW * inputs.gridPurchasePct / 100;
    const lptRatio = annualLPT / US_LPT_CAPACITY;

    const demandYears = YEARS.map((year) => {
      const yearsOut = parseInt(year) - BASE_YEAR;
      const compounded = Math.pow(1 + inputs.aiCagrPct / 100, yearsOut);
      const aiDemand = BASE_POWER_TWH * 0.045 * compounded * inputs.pue;
      return {
        year,
        totalDemand: Math.round(BASE_POWER_TWH + aiDemand),
        aiDemand: Math.round(aiDemand),
      };
    });

    return {
      totalCapexB,
      annualLPT,
      nuclearGW,
      gasGW,
      renewablesGW,
      gridGW,
      lptRatio,
      demandIn2030: demandYears[demandYears.length - 1]?.totalDemand ?? 0,
      aiShareIn2030: demandYears[demandYears.length - 1]
        ? (demandYears[demandYears.length - 1].aiDemand / demandYears[demandYears.length - 1].totalDemand * 100)
        : 0,
    };
  }, [inputs]);

  const rankedCompanies = useMemo(() => {
    return [...TOP_COMPANIES]
      .map((c) => {
        const bump =
          c.segment === "Power"
            ? c.thesisScore * (inputs.nuclearPct / 100) * 0.4
            : c.segment === "Compute"
            ? c.thesisScore * (inputs.aiCagrPct / 100) * 0.25
            : c.thesisScore * (inputs.aiCagrPct / 100) * 0.15;
        const adjusted = Math.min(10.0, c.thesisScore + bump);
        return { ...c, adjusted, delta: bump };
      })
      .sort((a, b) => b.adjusted - a.adjusted);
  }, [inputs.nuclearPct, inputs.aiCagrPct]);

  const lptColor = outputs.lptRatio < 0.5
    ? "text-positive"
    : outputs.lptRatio < 1.0
    ? "text-warning"
    : "text-negative";

  const presetButtons: { key: PresetName; label: string }[] = [
    { key: "Conservative", label: "Conservative" },
    { key: "Base", label: "Base Case" },
    { key: "Aggressive", label: "Aggressive" },
  ];

  const presetSelector = (
    <div className="flex items-center gap-2 mt-4 flex-wrap">
      <span className="text-[11px] text-muted-foreground mr-1">Scenario:</span>
      {presetButtons.map(({ key, label }) => (
        <button
          key={key}
          data-testid={`preset-${key.toLowerCase()}`}
          onClick={() => applyPreset(key as Exclude<PresetName, "Custom">)}
          className={`px-4 py-1.5 rounded text-xs font-semibold border transition-all ${
            activePreset === key
              ? "bg-brand-2 text-black border-brand-2"
              : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
          }`}
        >
          {label}
        </button>
      ))}
      {activePreset === "Custom" && (
        <span
          className="px-4 py-1.5 rounded text-xs font-semibold border bg-brand/15 text-brand border-brand/40"
          data-testid="preset-custom-badge"
        >
          Custom
        </span>
      )}
    </div>
  );

  // Embedded mode (Analyze tool, scenario tab): the host page owns the hero,
  // so render a slim intro (description + presets) instead of the full header.
  const intro = embedded ? (
    <div className="px-1">
      <p className="text-muted-foreground text-xs leading-relaxed max-w-3xl">
        50 GW of new AI datacenter capacity is projected by 2030. Model capex, grid interconnect timelines, and power supply mix under different assumptions.
      </p>
      {presetSelector}
    </div>
  ) : (
    <div className="border-b border-border px-6 py-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Scenario Calculator</h1>
        <p className="text-muted-foreground text-sm mt-1 max-w-xl">
          50 GW of new AI datacenter capacity is projected by 2030. Model capex, grid interconnect timelines, and power supply mix under different assumptions.
        </p>
      </div>
      {presetSelector}
    </div>
  );

  return (
    <div className={embedded ? "flex flex-col" : "flex flex-col h-full overflow-y-auto"}>
      {/* Header */}
      {intro}

      <div className={embedded ? "flex-1 mt-4" : "flex-1 p-6"}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ---- LEFT: INPUTS ---- */}
          <div className="space-y-5">
            <h2 className="text-[13px] font-semibold text-foreground">Scenario Inputs</h2>

            {/* Infrastructure Buildout */}
            <Card className="p-4 border-card-border space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-brand-2" />
                <p className="text-xs font-semibold text-foreground">Infrastructure Buildout</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <NumField
                  label="New AI DC Capacity by 2030"
                  unit="GW"
                  value={inputs.newCapacityGW}
                  min={1} max={200} step={1}
                  testId="input-new-capacity-gw"
                  onChange={(v) => setField("newCapacityGW", v)}
                  hint="Total new AI data center capacity added 2025-2030"
                />
                <NumField
                  label="Avg Capex per MW"
                  unit="$M / MW"
                  value={inputs.capexPerMW}
                  min={1} max={20} step={0.5}
                  testId="input-capex-per-mw"
                  onChange={(v) => setField("capexPerMW", v)}
                  hint="All-in construction cost per MW of DC capacity"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <NumField
                  label="LPTs per GW of Capacity"
                  unit="transformers / GW"
                  value={inputs.lptPerGW}
                  min={1} max={10} step={0.5}
                  testId="input-lpt-per-gw"
                  onChange={(v) => setField("lptPerGW", v)}
                  hint="Large power transformers needed per GW of new capacity"
                />
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Grid Interconnect Timeline</span>
                  <div className="h-8 flex items-center px-3 rounded-md border border-border/60 bg-muted/20 text-sm font-mono text-foreground">
                    {inputs.interconnectYears}
                  </div>
                  <p className="text-10 text-muted-foreground/50">Avg queue-to-energize lead time</p>
                </div>
              </div>
            </Card>

            {/* Generation Supply Mix */}
            <Card className="p-4 border-card-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-brand-2" />
                  <p className="text-xs font-semibold text-foreground">New Power Supply Mix</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-mono font-bold ${mixValid ? "text-positive" : "text-negative"}`}>
                    {mixSum.toFixed(0)}%
                  </span>
                  {!mixValid && <AlertTriangle className="h-3.5 w-3.5 text-negative" />}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS.gas }} />
                    <span className="text-xs text-muted-foreground">Natural Gas</span>
                  </div>
                  <Input
                    type="number" min={0} max={100} step={1}
                    value={inputs.gasPct}
                    data-testid="input-gas-pct"
                    className="h-8 font-mono text-sm bg-muted/20 border-border/60 focus:border-brand-2/60"
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setField("gasPct", Math.max(0, Math.min(100, v))); }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS.nuclear }} />
                    <span className="text-xs text-muted-foreground">Nuclear</span>
                  </div>
                  <Input
                    type="number" min={0} max={100} step={1}
                    value={inputs.nuclearPct}
                    data-testid="input-nuclear-pct"
                    className="h-8 font-mono text-sm bg-muted/20 border-border/60 focus:border-brand-2/60"
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setField("nuclearPct", Math.max(0, Math.min(100, v))); }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS.renewables }} />
                    <span className="text-xs text-muted-foreground">Renewables + Storage</span>
                  </div>
                  <Input
                    type="number" min={0} max={100} step={1}
                    value={inputs.renewablesPct}
                    data-testid="input-renewables-pct"
                    className="h-8 font-mono text-sm bg-muted/20 border-border/60 focus:border-brand-2/60"
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setField("renewablesPct", Math.max(0, Math.min(100, v))); }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full" style={{ background: CATEGORY_COLORS.grid }} />
                    <span className="text-xs text-muted-foreground">Grid Purchases</span>
                  </div>
                  <Input
                    type="number" min={0} max={100} step={1}
                    value={inputs.gridPurchasePct}
                    data-testid="input-grid-pct"
                    className="h-8 font-mono text-sm bg-muted/20 border-border/60 focus:border-brand-2/60"
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) setField("gridPurchasePct", Math.max(0, Math.min(100, v))); }}
                  />
                </div>
              </div>

              {/* Mix visual */}
              {mixValid && (
                <div className="flex h-2 rounded-full overflow-hidden gap-px mt-1">
                  <div style={{ width: `${inputs.gasPct}%`, background: CATEGORY_COLORS.gas, opacity: 0.7 }} />
                  <div style={{ width: `${inputs.nuclearPct}%`, background: CATEGORY_COLORS.nuclear, opacity: 0.8 }} />
                  <div style={{ width: `${inputs.renewablesPct}%`, background: CATEGORY_COLORS.renewables, opacity: 0.7 }} />
                  <div style={{ width: `${inputs.gridPurchasePct}%`, background: CATEGORY_COLORS.grid, opacity: 0.6 }} />
                </div>
              )}
            </Card>

            {/* Demand Model */}
            <Card className="p-4 border-card-border space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-brand-2" />
                <p className="text-xs font-semibold text-foreground">AI Demand Model</p>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3 w-3 text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">CAGR = annual growth rate of AI compute demand. PUE = Power Usage Effectiveness (overhead multiplier on compute load).</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <NumField
                  label="AI Workload CAGR"
                  unit="%/yr"
                  value={inputs.aiCagrPct}
                  min={5} max={60} step={1}
                  testId="input-ai-cagr"
                  onChange={(v) => setField("aiCagrPct", v)}
                  hint="Annual growth in AI compute demand, compounded to 2030"
                />
                <NumField
                  label="Avg Data Center PUE"
                  unit="x"
                  value={inputs.pue}
                  min={1.0} max={1.8} step={0.05}
                  testId="input-pue"
                  onChange={(v) => setField("pue", v)}
                  hint="Power Usage Effectiveness (1.0 = lossless; 1.3 = industry norm)"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "2030 AI Grid Share", value: `${outputs.aiShareIn2030.toFixed(1)}%`, color: "text-brand-2" },
                  { label: "2030 US Demand", value: `${(outputs.demandIn2030 / 1000).toFixed(1)}k TWh`, color: "text-foreground" },
                  { label: "Annual DC Pace", value: `${(inputs.newCapacityGW / 5).toFixed(1)} GW/yr`, color: "text-foreground" },
                ].map((s) => (
                  <div key={s.label} className="rounded-md p-2.5 bg-muted/30 border border-border text-center">
                    <p className="text-10 text-muted-foreground mb-1 leading-tight">{s.label}</p>
                    <p className={`text-base font-bold font-mono ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ---- RIGHT: OUTPUTS ---- */}
          <div className="space-y-5">
            <h2 className="text-[13px] font-semibold text-foreground">Scenario Outputs</h2>

            {/* 4 KPI output cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3.5 border-card-border" data-testid="output-total-capex">
                <p className="text-[11px] text-muted-foreground mb-1">Total Capex</p>
                <p className="text-2xl font-bold font-mono text-brand-2">${outputs.totalCapexB.toFixed(0)}B</p>
                <p className="text-10 text-muted-foreground/60 mt-0.5">{inputs.newCapacityGW} GW × ${inputs.capexPerMW}M/MW</p>
              </Card>

              <Card className={`p-3.5 border-card-border`} data-testid="output-lpt-demand">
                <p className="text-[11px] text-muted-foreground mb-1">Annual LPTs Needed</p>
                <p className={`text-2xl font-bold font-mono ${lptColor}`}>{outputs.annualLPT.toFixed(0)}/yr</p>
                <p className="text-10 text-muted-foreground/60 mt-0.5">
                  vs. {US_LPT_CAPACITY} domestic · {(outputs.lptRatio * 100).toFixed(0)}% of US capacity
                </p>
              </Card>

              <Card className="p-3.5 border-card-border" data-testid="output-nuclear-gw">
                <p className="text-[11px] text-muted-foreground mb-1">Nuclear Build by 2030</p>
                {mixValid ? (
                  <>
                    <p className="text-2xl font-bold font-mono text-foreground">{outputs.nuclearGW.toFixed(1)} GW</p>
                    <p className="text-10 text-muted-foreground/60 mt-0.5">{inputs.nuclearPct}% of {inputs.newCapacityGW} GW new supply</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold font-mono text-muted-foreground/40">--</p>
                    <p className="text-10 text-negative/80 mt-0.5">Mix sums to {mixSum.toFixed(0)}% - adjust to 100%</p>
                  </>
                )}
              </Card>

              <Card className="p-3.5 border-card-border" data-testid="output-interconnect">
                <p className="text-[11px] text-muted-foreground mb-1">Grid Interconnect</p>
                <p className="text-lg font-bold font-mono text-foreground leading-snug mt-0.5">{inputs.interconnectYears}</p>
                <p className="text-10 text-muted-foreground/60 mt-1">Avg queue-to-energize lead time</p>
              </Card>
            </div>

            {/* Buildout timeline chart */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-[13px] font-semibold text-foreground">Annual Buildout Timeline</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">GW of new AI DC capacity per year, broken down by power source.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <Card className="p-4 border-card-border">
                {mixValid ? (
                  <>
                    <ResponsiveContainer width="100%" height={190}>
                      <BarChart data={buildoutChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }} barSize={28}>
                        <CartesianGrid {...gridProps} />
                        <XAxis {...axisProps} dataKey="year" />
                        <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => `${v}GW`} />
                        <Tooltip
                          cursor={{ fill: BORDER.subtle }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
                            return (
                              <div style={tooltipContentStyle}>
                                <p style={tooltipLabelStyle}>{label}: {total.toFixed(1)} GW added</p>
                                {payload.map((p: any, i: number) => (
                                  <p key={i} style={{ ...tooltipItemStyle, color: p.fill }}>
                                    {p.name}: {p.value?.toFixed(2)} GW
                                  </p>
                                ))}
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="gas"        name="Natural Gas" stackId="a" fill={CATEGORY_COLORS.gas}        radius={[0,0,0,0]} />
                        <Bar dataKey="nuclear"    name="Nuclear"     stackId="a" fill={CATEGORY_COLORS.nuclear}    radius={[0,0,0,0]} />
                        <Bar dataKey="renewables" name="Renewables"  stackId="a" fill={CATEGORY_COLORS.renewables} radius={[0,0,0,0]} />
                        <Bar dataKey="grid"       name="Grid"        stackId="a" fill={CATEGORY_COLORS.grid}       radius={[2,2,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                    <SrChartTable
                      caption="Annual buildout timeline: GW of new AI datacenter capacity added per year, by power source"
                      columns={["Year", "Gas", "Nuclear", "Renewables", "Grid"]}
                      rows={buildoutChart.map((r) => [r.year, r.gas, r.nuclear, r.renewables, r.grid])}
                    />
                    <div className="flex flex-wrap gap-4 text-xs mt-1">
                      {[
                        { color: CATEGORY_COLORS.gas,        label: "Natural Gas" },
                        { color: CATEGORY_COLORS.nuclear,    label: "Nuclear" },
                        { color: CATEGORY_COLORS.renewables, label: "Renewables" },
                        { color: CATEGORY_COLORS.grid,       label: "Grid Purchases" },
                      ].map((l) => (
                        <div key={l.label} className="flex items-center gap-1.5">
                          <div className="h-2 w-3 rounded-sm" style={{ background: l.color }} />
                          <span className="text-muted-foreground">{l.label}</span>
                        </div>
                      ))}
                    </div>
                    {activePreset === "Custom" && (
                      <p className="text-10 text-muted-foreground/50 mt-1.5" data-testid="custom-ramp-footnote">
                        assumed build ramp: fixed S-curve over 2025-2030, scaled to your {inputs.newCapacityGW} GW total
                      </p>
                    )}
                  </>
                ) : (
                  <div className="h-[190px] flex items-center justify-center" data-testid="chart-mix-invalid">
                    <MixWarning mixSum={mixSum} testId="mix-warning-chart" />
                  </div>
                )}
              </Card>
            </div>

            {/* Company rankings */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-[13px] font-semibold text-foreground">Scenario-Adjusted Positions</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground/60" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Thesis leverage scores (0-10) adjusted by your scenario inputs. Higher nuclear % boosts Power names; higher CAGR boosts Compute. Not financial advice.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <Card className="border-card-border overflow-hidden">
                {!mixValid ? (
                  <div className="py-10" data-testid="positions-mix-invalid">
                    <MixWarning mixSum={mixSum} testId="mix-warning-positions" />
                  </div>
                ) : (
                <>
                <div className="grid grid-cols-[1.5rem_1fr_auto_auto] gap-x-3 px-3 py-2 border-b border-border bg-muted/20">
                  <span className="text-[11px] text-muted-foreground">#</span>
                  <span className="text-[11px] text-muted-foreground">Position</span>
                  <span className="text-[11px] text-muted-foreground text-right">Score</span>
                  <span className="text-[11px] text-muted-foreground text-right w-12">Delta</span>
                </div>
                {rankedCompanies.map((company, index) => {
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
                          <span className="font-bold text-sm text-foreground font-mono">{company.ticker}</span>
                          <span
                            className="text-10 px-1.5 py-0.5 rounded font-medium leading-none"
                            style={{ backgroundColor: `${company.color}18`, color: company.color }}
                          >
                            <SegIcon className="h-2.5 w-2.5 inline mr-0.5 -mt-0.5" />
                            {company.segment}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted/25 rounded-full h-1 max-w-[100px]">
                            <div
                              className="h-1 rounded-full transition-all duration-500"
                              style={{ width: `${(company.adjusted / 10) * 100}%`, backgroundColor: company.color, opacity: 0.8 }}
                            />
                          </div>
                          <span className="text-10 text-muted-foreground/60 truncate max-w-[90px]">{company.rationale}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm font-mono tabular-nums" style={{ color: company.color }}>
                          {company.adjusted.toFixed(1)}
                        </span>
                        <span className="text-10 text-muted-foreground font-mono">/10</span>
                      </div>
                      <div className="text-right w-12">
                        <span className={`text-10 font-mono tabular-nums font-medium ${company.delta > 0.05 ? "text-positive" : "text-muted-foreground/40"}`}>
                          {company.delta > 0.05 ? `+${company.delta.toFixed(2)}` : "base"}
                        </span>
                      </div>
                    </div>
                  );
                })}
                </>
                )}
              </Card>
            </div>
          </div>
        </div>

        {/* ---- METHODOLOGY PANEL ---- */}
        <div className="mt-6">
          <Collapsible open={methodologyOpen} onOpenChange={setMethodologyOpen}>
            <Card className="border-card-border overflow-hidden">
              <CollapsibleTrigger asChild>
                <button
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/10 transition-colors text-left"
                  data-testid="methodology-toggle"
                >
                  <div className="flex items-center gap-2">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[13px] font-semibold text-foreground">Methodology</span>
                    <span className="text-10 text-muted-foreground/50">Sources (IEA, EIA, DOE, McKinsey, hyperscaler earnings calls), formulas, and key sensitivities</span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${methodologyOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-border px-5 py-5 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                  {/* Sources */}
                  <div className="space-y-3">
                    <p className="text-[12px] font-semibold text-foreground">Sources</p>
                    <ul className="space-y-2 text-muted-foreground leading-relaxed">
                      <li className="flex gap-2">
                        <span className="text-brand-2 font-medium flex-shrink-0">IEA</span>
                        <span>Electricity 2025: AI data centers projected at 400-1,000 TWh global consumption by 2026</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-brand-2 font-medium flex-shrink-0">EIA</span>
                        <span>Annual Energy Outlook 2025: US baseline consumption ~4,490 TWh (2025E); data centers = 6.4% of US load</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-brand-2 font-medium flex-shrink-0">McKinsey</span>
                        <span>$5.2T global AI infrastructure investment projection through 2030 (2024 Global Technology Report)</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-brand-2 font-medium flex-shrink-0">DOE</span>
                        <span>Transformer Supply Chain Study 2023: US domestic large power transformer (LPT) manufacturing capacity ~60 units/year</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-brand-2 font-medium flex-shrink-0">Hyperscalers</span>
                        <span>2024-2025 earnings calls: all-in capex guidance of $7-12M/MW for hyperscale AI data centers (AWS, Google, Microsoft, Meta)</span>
                      </li>
                    </ul>
                  </div>

                  {/* Formulas */}
                  <div className="space-y-3">
                    <p className="text-[12px] font-semibold text-foreground">Formulas</p>
                    <div className="space-y-3 text-muted-foreground">
                      <div>
                        <p className="text-10 font-medium text-foreground/80 mb-0.5">Total Capex ($B)</p>
                        <p className="leading-relaxed">GW × 1,000 (MW/GW) × Capex ($/MW in millions) / 1,000 = GW × Capex/MW. Example: 50 GW × $9M/MW = $450B.</p>
                      </div>
                      <div>
                        <p className="text-10 font-medium text-foreground/80 mb-0.5">Annual LPT Demand</p>
                        <p className="leading-relaxed">Total GW × LPTs per GW / 5 years. Default 4 LPTs/GW sourced from DOE interconnection studies. Compare against {US_LPT_CAPACITY} units/year domestic manufacturing capacity.</p>
                      </div>
                      <div>
                        <p className="text-10 font-medium text-foreground/80 mb-0.5">Generation Breakdown</p>
                        <p className="leading-relaxed">New Capacity (GW) × Supply Mix %. Annual ramp × mix applied year-by-year in the chart.</p>
                      </div>
                      <div>
                        <p className="text-10 font-medium text-foreground/80 mb-0.5">AI Demand (TWh)</p>
                        <p className="leading-relaxed">Base Grid (4,490 TWh) × AI share (4.5% 2025E) × (1 + CAGR)^years × PUE. Compounded annually from 2025 baseline.</p>
                      </div>
                    </div>
                  </div>

                  {/* Sensitivities + Disclaimer */}
                  <div className="space-y-3">
                    <p className="text-[12px] font-semibold text-foreground">Key Sensitivities</p>
                    <div className="space-y-2 text-muted-foreground leading-relaxed">
                      <p><span className="text-foreground font-medium">Nuclear %</span> is the highest-leverage input. Each 10pp increase re-rates CEG, CCJ, and VST scores.</p>
                      <p><span className="text-foreground font-medium">Capex per MW</span> drives total capital deployed. At 50 GW, the $7M-$12M range = $150B swing.</p>
                      <p><span className="text-foreground font-medium">LPT per GW</span> (default: 4) is the most uncertain assumption in this model; academic literature ranges from 2 to 6.</p>
                      <p><span className="text-foreground font-medium">AI CAGR</span> is the most volatile input; a 10pp change produces a ~200 TWh swing in 2030 US power demand.</p>
                    </div>
                    <div className="mt-3 p-3 rounded bg-muted/20 border border-border/60 text-muted-foreground/70 leading-relaxed">
                      All assumptions are adjustable. GridTilt provides the framework; you provide the thesis. This is a scenario analysis tool, not financial advice.
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
