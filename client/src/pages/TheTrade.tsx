import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown, AlertTriangle } from "lucide-react";
import { SrChartTable } from "@/components/Freshness";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";
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

function NumField({
  label, value, unit, min, max, step = 1, onChange, hint, testId,
}: {
  label: string; value: number; unit?: string; min: number; max: number;
  step?: number; onChange: (v: number) => void; hint?: string; testId?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] text-ink-secondary">{label}</span>
        {unit && <span className="text-[12px] text-ink-muted">{unit}</span>}
      </div>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        className="h-8 text-[13.5px] tnum"
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
      />
      {hint && <p className="text-[12px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  );
}

/** In-place warning shown instead of any output that depends on the supply mix. */
function MixWarning({ mixSum, testId }: { mixSum: number; testId: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-negative" data-testid={testId}>
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="text-[12.5px] tnum">Mix sums to {mixSum.toFixed(0)}% - adjust to 100%</span>
    </div>
  );
}

/** Labeled supply-mix number input with its category color dot. */
function MixField({
  label, dotColor, value, onChange, testId,
}: {
  label: string; dotColor: string; value: number; onChange: (v: number) => void; testId: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span className="text-[13px] text-ink-secondary">{label}</span>
      </div>
      <Input
        type="number" min={0} max={100} step={1}
        value={value}
        data-testid={testId}
        className="h-8 text-[13.5px] tnum"
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(Math.max(0, Math.min(100, v))); }}
      />
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

  const lptTone = outputs.lptRatio < 0.5
    ? "text-positive"
    : outputs.lptRatio < 1.0
    ? "text-warning"
    : "text-negative";

  const presetButtons: { key: PresetName; label: string }[] = [
    { key: "Conservative", label: "Conservative" },
    { key: "Base", label: "Base case" },
    { key: "Aggressive", label: "Aggressive" },
  ];

  const body = (
    <div className="flex flex-col">
      <p className="text-[13.5px] leading-relaxed text-ink-secondary max-w-[68ch]">
        50 GW of new AI datacenter capacity is projected by 2030. Model capex, grid interconnect
        timelines, and power supply mix under different assumptions.
      </p>

      {/* Preset row: worksheet scenario selector */}
      <div className="flex items-center gap-5 mt-4 flex-wrap border-b border-rule pb-2">
        <span className="text-[13px] text-ink-muted">Scenario</span>
        {presetButtons.map(({ key, label }) => (
          <button
            key={key}
            data-testid={`preset-${key.toLowerCase()}`}
            onClick={() => applyPreset(key as Exclude<PresetName, "Custom">)}
            className={`relative pb-1 text-[13px] leading-none transition-colors duration-fast ${
              activePreset === key
                ? "font-semibold text-brand-ink"
                : "text-ink-secondary hover:text-ink"
            }`}
          >
            {label}
            {activePreset === key && (
              <span aria-hidden className="absolute inset-x-0 -bottom-[9px] h-[2px] bg-brand" />
            )}
          </button>
        ))}
        {activePreset === "Custom" && (
          <span className="relative pb-1 text-[13px] leading-none font-semibold text-ink" data-testid="preset-custom-badge">
            Custom
            <span aria-hidden className="absolute inset-x-0 -bottom-[9px] h-[2px] bg-brand" />
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 mt-6">
        {/* ---- LEFT: INPUTS ---- */}
        <div>
          <RuleSection head="Infrastructure buildout" className="mt-0">
            <div className="grid grid-cols-2 gap-4">
              <NumField
                label="New AI DC capacity by 2030"
                unit="GW"
                value={inputs.newCapacityGW}
                min={1} max={200} step={1}
                testId="input-new-capacity-gw"
                onChange={(v) => setField("newCapacityGW", v)}
                hint="Total new AI data center capacity added 2025-2030"
              />
              <NumField
                label="Avg capex per MW"
                unit="$M / MW"
                value={inputs.capexPerMW}
                min={1} max={20} step={0.5}
                testId="input-capex-per-mw"
                onChange={(v) => setField("capexPerMW", v)}
                hint="All-in construction cost per MW of DC capacity"
              />
              <NumField
                label="LPTs per GW of capacity"
                unit="transformers / GW"
                value={inputs.lptPerGW}
                min={1} max={10} step={0.5}
                testId="input-lpt-per-gw"
                onChange={(v) => setField("lptPerGW", v)}
                hint="Large power transformers needed per GW of new capacity"
              />
              <div className="space-y-1">
                <span className="text-[13px] text-ink-secondary block">Grid interconnect timeline</span>
                <div className="h-8 flex items-center px-3 border border-rule bg-paper-shade text-[13.5px] text-ink tnum rounded-sm">
                  {inputs.interconnectYears}
                </div>
                <p className="text-[12px] leading-snug text-ink-muted">Avg queue-to-energize lead time</p>
              </div>
            </div>
          </RuleSection>

          <RuleSection
            head="New power supply mix"
            aside={
              <span className={`flex items-center gap-1.5 text-[13px] font-semibold tnum ${mixValid ? "text-positive" : "text-negative"}`}>
                {mixSum.toFixed(0)}%
                {!mixValid && <AlertTriangle className="h-3.5 w-3.5" />}
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-4">
              <MixField
                label="Natural gas"
                dotColor={CATEGORY_COLORS.gas}
                value={inputs.gasPct}
                testId="input-gas-pct"
                onChange={(v) => setField("gasPct", v)}
              />
              <MixField
                label="Nuclear"
                dotColor={CATEGORY_COLORS.nuclear}
                value={inputs.nuclearPct}
                testId="input-nuclear-pct"
                onChange={(v) => setField("nuclearPct", v)}
              />
              <MixField
                label="Renewables + storage"
                dotColor={CATEGORY_COLORS.renewables}
                value={inputs.renewablesPct}
                testId="input-renewables-pct"
                onChange={(v) => setField("renewablesPct", v)}
              />
              <MixField
                label="Grid purchases"
                dotColor={CATEGORY_COLORS.grid}
                value={inputs.gridPurchasePct}
                testId="input-grid-pct"
                onChange={(v) => setField("gridPurchasePct", v)}
              />
            </div>

            {/* Mix visual */}
            {mixValid && (
              <div className="flex h-1.5 overflow-hidden gap-px mt-3">
                <div style={{ width: `${inputs.gasPct}%`, background: CATEGORY_COLORS.gas, opacity: 0.7 }} />
                <div style={{ width: `${inputs.nuclearPct}%`, background: CATEGORY_COLORS.nuclear, opacity: 0.8 }} />
                <div style={{ width: `${inputs.renewablesPct}%`, background: CATEGORY_COLORS.renewables, opacity: 0.7 }} />
                <div style={{ width: `${inputs.gridPurchasePct}%`, background: CATEGORY_COLORS.grid, opacity: 0.6 }} />
              </div>
            )}
          </RuleSection>

          <RuleSection head="AI demand model">
            <div className="grid grid-cols-2 gap-4">
              <NumField
                label="AI workload CAGR"
                unit="%/yr"
                value={inputs.aiCagrPct}
                min={5} max={60} step={1}
                testId="input-ai-cagr"
                onChange={(v) => setField("aiCagrPct", v)}
                hint="Annual growth in AI compute demand, compounded to 2030"
              />
              <NumField
                label="Avg data center PUE"
                unit="x"
                value={inputs.pue}
                min={1.0} max={1.8} step={0.05}
                testId="input-pue"
                onChange={(v) => setField("pue", v)}
                hint="Power Usage Effectiveness (1.0 = lossless; 1.3 = industry norm)"
              />
            </div>
            <div className="mt-4 border-t border-rule pt-2 space-y-1">
              {[
                { label: "2030 AI grid share", value: `${outputs.aiShareIn2030.toFixed(1)}%` },
                { label: "2030 US demand", value: `${(outputs.demandIn2030 / 1000).toFixed(1)}k TWh` },
                { label: "Annual DC pace", value: `${(inputs.newCapacityGW / 5).toFixed(1)} GW/yr` },
              ].map((s) => (
                <div key={s.label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-muted">{s.label}</span>
                  <span className="text-ink tnum text-right">{s.value}</span>
                </div>
              ))}
            </div>
          </RuleSection>
        </div>

        {/* ---- RIGHT: OUTPUTS ---- */}
        <div>
          <RuleSection head="Scenario outputs" className="mt-8 lg:mt-0">
            <div className="grid grid-cols-2 gap-x-8 gap-y-6">
              <div data-testid="output-total-capex">
                <PullStat
                  label="Total capex"
                  value={`$${outputs.totalCapexB.toFixed(0)}B`}
                  note={`${inputs.newCapacityGW} GW × $${inputs.capexPerMW}M/MW`}
                />
              </div>

              <div data-testid="output-lpt-demand">
                <PullStat
                  label="Annual LPTs needed"
                  value={`${outputs.annualLPT.toFixed(0)}/yr`}
                  delta={
                    <span className={`text-[13px] font-semibold tnum ${lptTone}`}>
                      {(outputs.lptRatio * 100).toFixed(0)}% of US capacity
                    </span>
                  }
                  note={`vs. ${US_LPT_CAPACITY} units/yr domestic manufacturing`}
                />
              </div>

              <div data-testid="output-nuclear-gw">
                {mixValid ? (
                  <PullStat
                    label="Nuclear build by 2030"
                    value={`${outputs.nuclearGW.toFixed(1)} GW`}
                    note={`${inputs.nuclearPct}% of ${inputs.newCapacityGW} GW new supply`}
                  />
                ) : (
                  <div>
                    <p className="text-[13px] leading-tight text-ink-secondary">Nuclear build by 2030</p>
                    <p className="mt-1 font-serif font-medium text-[28px] sm:text-[32px] leading-none text-ink-faint">—</p>
                    <p className="mt-1 text-[12px] leading-snug text-negative tnum">
                      Mix sums to {mixSum.toFixed(0)}% - adjust to 100%
                    </p>
                  </div>
                )}
              </div>

              <div data-testid="output-interconnect">
                <PullStat
                  label="Grid interconnect"
                  value={inputs.interconnectYears}
                  note="Avg queue-to-energize lead time"
                />
              </div>
            </div>
          </RuleSection>

          <RuleSection
            head="Annual buildout timeline"
            aside={<span>GW added per year, by power source</span>}
          >
            {mixValid ? (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={buildoutChart} margin={{ top: 5, right: 5, left: 0, bottom: 5 }} barSize={28}>
                    <CartesianGrid {...gridProps} />
                    <XAxis {...axisProps} dataKey="year" />
                    <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => `${v} GW`} width={48} />
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
                    <Bar dataKey="gas"        name="Natural gas" stackId="a" fill={CATEGORY_COLORS.gas} />
                    <Bar dataKey="nuclear"    name="Nuclear"     stackId="a" fill={CATEGORY_COLORS.nuclear} />
                    <Bar dataKey="renewables" name="Renewables"  stackId="a" fill={CATEGORY_COLORS.renewables} />
                    <Bar dataKey="grid"       name="Grid"        stackId="a" fill={CATEGORY_COLORS.grid} />
                  </BarChart>
                </ResponsiveContainer>
                <SrChartTable
                  caption="Annual buildout timeline: GW of new AI datacenter capacity added per year, by power source"
                  columns={["Year", "Gas", "Nuclear", "Renewables", "Grid"]}
                  rows={buildoutChart.map((r) => [r.year, r.gas, r.nuclear, r.renewables, r.grid])}
                />
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
                  {[
                    { color: CATEGORY_COLORS.gas,        label: "Natural gas" },
                    { color: CATEGORY_COLORS.nuclear,    label: "Nuclear" },
                    { color: CATEGORY_COLORS.renewables, label: "Renewables" },
                    { color: CATEGORY_COLORS.grid,       label: "Grid purchases" },
                  ].map((l) => (
                    <span key={l.label} className="flex items-center gap-1.5 text-[12px] text-ink-secondary">
                      <span className="h-2 w-3" style={{ background: l.color }} />
                      {l.label}
                    </span>
                  ))}
                </div>
                {activePreset === "Custom" && (
                  <p className="text-[12px] text-ink-muted mt-1.5" data-testid="custom-ramp-footnote">
                    assumed build ramp: fixed S-curve over 2025-2030, scaled to your {inputs.newCapacityGW} GW total
                  </p>
                )}
                <Provenance
                  source="IEA, EIA, DOE, McKinsey, hyperscaler earnings calls"
                  extra="all defaults trace to named sources; formulas and citations under Methodology below"
                />
              </>
            ) : (
              <div className="h-[190px] flex items-center justify-center" data-testid="chart-mix-invalid">
                <MixWarning mixSum={mixSum} testId="mix-warning-chart" />
              </div>
            )}
          </RuleSection>

          <RuleSection head="Scenario-adjusted positions">
            {!mixValid ? (
              <div className="py-10" data-testid="positions-mix-invalid">
                <MixWarning mixSum={mixSum} testId="mix-warning-positions" />
              </div>
            ) : (
              <>
                <table className="print-table" data-testid="positions-table">
                  <thead>
                    <tr>
                      <th className="shrink num">#</th>
                      <th>Position</th>
                      <th className="hidden sm:table-cell">Segment</th>
                      <th className="num">Score</th>
                      <th className="num">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedCompanies.map((company, index) => (
                      <tr key={company.ticker} data-testid={`trade-company-${company.ticker}`}>
                        <td className="shrink num text-ink-muted">{index + 1}</td>
                        <td>
                          <span className="font-semibold text-ink" title={company.name}>{company.ticker}</span>
                          <span className="block text-[12px] leading-snug text-ink-muted">{company.rationale}</span>
                        </td>
                        <td className="hidden sm:table-cell">
                          <span className="text-[12.5px] font-medium" style={{ color: company.color }}>{company.segment}</span>
                        </td>
                        <td className="num font-semibold text-ink">
                          {company.adjusted.toFixed(1)}<span className="font-normal text-ink-muted">/10</span>
                        </td>
                        <td className={`num ${company.delta > 0.05 ? "font-semibold text-positive" : "text-ink-muted"}`}>
                          {company.delta > 0.05 ? `+${company.delta.toFixed(2)}` : "base"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
                  Thesis leverage scores (0-10) adjusted by your scenario inputs. Higher nuclear %
                  boosts Power names; higher CAGR boosts Compute. Not financial advice.
                </p>
              </>
            )}
          </RuleSection>
        </div>
      </div>

      {/* ---- METHODOLOGY ---- */}
      <div className="mt-10 border-t border-rule-strong">
        <Collapsible open={methodologyOpen} onOpenChange={setMethodologyOpen}>
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center justify-between gap-3 py-3 text-left"
              data-testid="methodology-toggle"
            >
              <span className="flex items-baseline gap-3">
                <span className="text-[15px] font-semibold text-ink">Methodology</span>
                <span className="text-[12.5px] text-ink-muted">Sources, formulas, and key sensitivities</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-ink-muted transition-transform duration-base ${methodologyOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pt-1 pb-5 grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-6 text-[13px]">
              {/* Sources */}
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-ink border-b border-rule pb-1">Sources</p>
                <ul className="space-y-2 text-ink-secondary leading-relaxed">
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink flex-shrink-0">IEA</span>
                    <span>Electricity 2025: AI data centers projected at 400-1,000 TWh global consumption by 2026</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink flex-shrink-0">EIA</span>
                    <span>Annual Energy Outlook 2025: US baseline consumption ~4,490 TWh (2025E); data centers = 6.4% of US load</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink flex-shrink-0">McKinsey</span>
                    <span>$5.2T global AI infrastructure investment projection through 2030 (2024 Global Technology Report)</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink flex-shrink-0">DOE</span>
                    <span>Transformer Supply Chain Study 2023: US domestic large power transformer (LPT) manufacturing capacity ~60 units/year</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-semibold text-ink flex-shrink-0">Hyperscalers</span>
                    <span>2024-2025 earnings calls: all-in capex guidance of $7-12M/MW for hyperscale AI data centers (AWS, Google, Microsoft, Meta)</span>
                  </li>
                </ul>
              </div>

              {/* Formulas */}
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-ink border-b border-rule pb-1">Formulas</p>
                <div className="space-y-3 text-ink-secondary">
                  <div>
                    <p className="font-medium text-ink mb-0.5">Total capex ($B)</p>
                    <p className="leading-relaxed">GW × 1,000 (MW/GW) × Capex ($/MW in millions) / 1,000 = GW × Capex/MW. Example: 50 GW × $9M/MW = $450B.</p>
                  </div>
                  <div>
                    <p className="font-medium text-ink mb-0.5">Annual LPT demand</p>
                    <p className="leading-relaxed">Total GW × LPTs per GW / 5 years. Default 4 LPTs/GW sourced from DOE interconnection studies. Compare against {US_LPT_CAPACITY} units/year domestic manufacturing capacity.</p>
                  </div>
                  <div>
                    <p className="font-medium text-ink mb-0.5">Generation breakdown</p>
                    <p className="leading-relaxed">New Capacity (GW) × Supply Mix %. Annual ramp × mix applied year-by-year in the chart.</p>
                  </div>
                  <div>
                    <p className="font-medium text-ink mb-0.5">AI demand (TWh)</p>
                    <p className="leading-relaxed">Base Grid (4,490 TWh) × AI share (4.5% 2025E) × (1 + CAGR)^years × PUE. Compounded annually from 2025 baseline.</p>
                  </div>
                </div>
              </div>

              {/* Sensitivities */}
              <div className="space-y-3">
                <p className="text-[13px] font-semibold text-ink border-b border-rule pb-1">Key sensitivities</p>
                <div className="space-y-2 text-ink-secondary leading-relaxed">
                  <p><span className="font-medium text-ink">Nuclear %</span> is the highest-leverage input. Each 10pp increase re-rates CEG, CCJ, and VST scores.</p>
                  <p><span className="font-medium text-ink">Capex per MW</span> drives total capital deployed. At 50 GW, the $7M-$12M range = $150B swing.</p>
                  <p><span className="font-medium text-ink">LPT per GW</span> (default: 4) is the most uncertain assumption in this model; academic literature ranges from 2 to 6.</p>
                  <p><span className="font-medium text-ink">AI CAGR</span> is the most volatile input; a 10pp change produces a ~200 TWh swing in 2030 US power demand.</p>
                </div>
              </div>
            </div>
            <p className="mb-6 text-[12.5px] leading-relaxed text-ink-muted border-t border-rule pt-2">
              All assumptions are adjustable. GridTilt provides the framework; you provide the thesis.
              This is a scenario analysis tool, not financial advice.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );

  // Standalone mount keeps its own shell; embedded (Analyze tab) inherits the
  // host page's PageShell and title.
  if (embedded) return body;
  return <PageShell><div className="pt-8">{body}</div></PageShell>;
}
