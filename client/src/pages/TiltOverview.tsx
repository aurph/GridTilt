import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
} from "recharts";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap, TrendingUp, Activity, AlertTriangle, Info, ArrowUp, ArrowDown, Calendar, ChevronRight, ExternalLink, Cpu, Calculator, Layers, Map, Link2, CalendarDays, LineChart } from "lucide-react";
import { EmailCapture, ScrollTriggeredBanner } from "@/components/EmailCapture";
import { AsOf, ErrorState, SrChartTable } from "@/components/Freshness";
import {
  BRAND, CATEGORY_COLORS as TOKEN_CATEGORY_COLORS, CHART_CHROME, DATA_QUALITY, INK, SEMANTIC, SERIES,
} from "@/lib/tokens";
import { axisProps, gridProps, timeTicks, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from "@/lib/chart-theme";
import { fmtDate } from "@/lib/gpu-series";
import { heatColor, heatTextColor } from "@/lib/stack-transforms";

import stackPreview from "@assets/previews/stack.svg";
import supplyChainPreview from "@assets/previews/supply-chain.svg";
import powerMapPreview from "@assets/previews/power-map.svg";
import catalystPreview from "@assets/previews/catalyst.svg";
import portfolioPreview from "@assets/previews/portfolio.svg";
import calculatorPreview from "@assets/previews/calculator.svg";

/** Token hex + alpha -> rgba() string, so composed tints stay on token values. */
function alpha(hex: string, a: number): string {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
}

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
  { year: "2024", demand: 4380, dcDemand: 420, projected: null, dcProjected: null },
  // 2025 carries both series: the single shared point where the projection
  // line takes over from actuals (double-encoding 2024 too drew the amber
  // projection on top of a full year of real data).
  { year: "2025", demand: 4490, dcDemand: 576, projected: 4490, dcProjected: 576 },
  { year: "2026", demand: null, dcDemand: null, projected: 4890, dcProjected: 800 },
  { year: "2027", demand: null, dcDemand: null, projected: 5180, dcProjected: 1050 },
  { year: "2028", demand: null, dcDemand: null, projected: 5490, dcProjected: 1350 },
  { year: "2029", demand: null, dcDemand: null, projected: 5830, dcProjected: 1700 },
  { year: "2030", demand: null, dcDemand: null, projected: 6210, dcProjected: 2100 },
];

const annotations = [
  { year: "2020", label: "COVID drop", color: alpha(SEMANTIC.negativeDeep, 0.4) },
  { year: "2022", label: "IRA signed + ChatGPT", color: alpha(BRAND.secondary, 0.4) },
  { year: "2024", label: "TMI restart + SMR deal", color: alpha(BRAND.secondary, 0.5) },
];

interface KpiData {
  aiPowerIndex: number;
  npiValue: number;
  gridStress: number;
  smrPolicyScore: number;
  npiBaseDate: string;
  constituents: {
    // AI Power Index constituents (intraday % change signals)
    nvdaChange: number; tsmChange: number; eqixChange: number; muChange: number;
    // NPI constituents (price performance since Jan 1, 2024 base)
    cegPerf: number; vstPerf: number; ccjPerf: number; nlrPerf: number;
    uPerf: number; policyPerf: number; npiPolicyMultiplier: number; npiMomentum: number;
    // Grid Stress signals
    vstChange: number; cegChange: number;
  };
}

interface TopMover {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  sector: string;
  marketCapDisplay?: string;
}

interface SectorPulseItem {
  sector: string;
  label: string;
  avgChange: number;
}

// Catalyst categories (brand-accent family, distinct from the sector
// palette in tokens.ts CATEGORY_COLORS).
const CATEGORY_COLORS: Record<string, string> = {
  Earnings:       BRAND.secondary,
  Regulatory:     BRAND.secondary,
  Policy:         DATA_QUALITY.estimateFlag,
  Market:         BRAND.primary,
  Infrastructure: TOKEN_CATEGORY_COLORS.construction,
  Industry:       BRAND.primary,
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T12:00:00");
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const SECTOR_DEMAND = [
  { sector: "Residential", twh: 1658, yoy: 2.1, color: INK.muted },
  { sector: "Commercial", twh: 1569, yoy: 2.4, color: SERIES[3] }, // series slot 4
  { sector: "Industrial", twh: 975, yoy: -3.2, color: INK.secondary },
  { sector: "Data Centers", twh: 288, yoy: 33.3, color: TOKEN_CATEGORY_COLORS.datacenters },
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
        {ann && <p className="text-warning mt-1 font-medium">* {ann.label}</p>}
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
      <span className={`font-mono font-semibold ${isUp ? "text-positive" : "text-negative"}`}>
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
        <span className={`font-mono font-semibold ${isUp ? "text-positive" : "text-negative"}`}>
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
      icon: "text-brand-2",
      bg: "bg-brand-2/10",
      border: "border-brand-2/25",
      value: "text-brand-2",
    },
    red: {
      icon: "text-negative",
      bg: "bg-negative-deep/10",
      border: "border-negative-deep/25",
      value: "text-negative",
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
            <Skeleton className="h-6 w-full mt-2" />
            <Skeleton className="h-3 w-32 mt-1" />
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
              {subtitle ?? "Live market signals. Tap info for methodology."}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function TiltStatusBar({ aiPower, gridStress, npi }: { aiPower: number | null; gridStress: number | null; npi: number | null }) {
  if (aiPower === null || gridStress === null || npi === null) return null;

  const isElevated = aiPower > 78 && gridStress > 70 && npi > 130;
  const isEasing = aiPower < 68 && gridStress < 55;
  const status = isElevated ? "elevated" : isEasing ? "easing" : "tracking baseline";
  const statusColor = isElevated ? BRAND.primary : isEasing ? INK.muted : BRAND.secondary;
  const statusBg = isElevated ? "bg-brand/10 border-brand/25" : isEasing ? "bg-muted/20 border-card-border" : "bg-brand-2/10 border-brand-2/20";
  const description = isElevated
    ? `All three gauges elevated. The market is pricing the AI-power complex aggressively today; grid-equity momentum at ${gridStress.toFixed(0)}/100. These read market positioning, not physical grid conditions.`
    : isEasing
    ? `Gauges have pulled back from peaks. Could be sector rotation or cooling sentiment. Watch hyperscaler capex guidance.`
    : `Tracking baseline. Market gauges near their fixed baselines. NPI at ${npi.toFixed(0)} reflects nuclear-complex performance since the Jan 2024 base.`;

  const numbers = [
    { label: "AI Demand", val: aiPower },
    { label: "NPI", val: npi },
    { label: "Grid Stress", val: gridStress },
  ] as const;

  return (
    <Card className={`p-4 border ${statusBg}`} data-testid="tilt-status-bar">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        {/* Status + numbers row on mobile, status only on desktop */}
        <div className="flex items-start justify-between sm:block flex-shrink-0">
          <div>
            <p className="text-10 font-bold uppercase tracking-widest text-muted-foreground mb-1">Tilt Status</p>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: statusColor }} />
              <span className="text-sm font-bold font-mono tracking-wide" style={{ color: statusColor }}>{status}</span>
            </div>
          </div>
          {/* Mini numbers shown beside status on mobile */}
          <div className="flex gap-3 sm:hidden text-right">
            {numbers.map(({ label, val }) => (
              <div key={label}>
                <p className="text-10 text-muted-foreground uppercase tracking-wide whitespace-nowrap">{label}</p>
                <p className="text-sm font-bold font-mono text-foreground">{val.toFixed(0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Vertical divider - desktop only */}
        <div className="hidden sm:block h-8 w-px bg-border flex-shrink-0" />

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed flex-1">{description}</p>

        {/* Mini numbers - desktop only (shown inline on mobile) */}
        <div className="hidden sm:flex gap-4 flex-shrink-0 text-center">
          {numbers.map(({ label, val }) => (
            <div key={label}>
              <p className="text-10 text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-sm font-bold font-mono text-foreground">{val.toFixed(0)}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// Mover/sector tags draw from the stable category palette so each sector
// keeps one color across the whole app.
const SECTOR_COLORS: Record<string, string> = {
  compute: TOKEN_CATEGORY_COLORS.compute,
  nuclear: TOKEN_CATEGORY_COLORS.nuclear,
  uranium: TOKEN_CATEGORY_COLORS.uranium,
  powerHardware: TOKEN_CATEGORY_COLORS.power,
  utilities: TOKEN_CATEGORY_COLORS.utilities,
  dataCenters: TOKEN_CATEGORY_COLORS.datacenters,
  construction: TOKEN_CATEGORY_COLORS.construction,
  etfsBenchmarks: INK.muted, // neutral benchmark bucket (no category token)
};

const SECTOR_LABEL_SHORT: Record<string, string> = {
  compute: "Compute",
  nuclear: "Nuclear",
  uranium: "Uranium",
  powerHardware: "Power HW",
  utilities: "Utilities",
  dataCenters: "Data Ctrs",
  construction: "Construct",
  rawMaterialsMining: "Mining",
  rawMaterialsNatGas: "Nat Gas",
  renewableGeneration: "Renewables",
  transmissionGrid: "Grid HW",
  cryptoAIDC: "Crypto DC",
  etfsBenchmarks: "ETFs",
};

function ErrorCard({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-8 justify-center">
      <AlertTriangle className="h-4 w-4 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function TopMoversSection({ topMovers, pulse, isLoading, isError, updatedAt, onRetry }: { topMovers: TopMover[]; pulse: SectorPulseItem[]; isLoading: boolean; isError?: boolean; updatedAt?: number; onRetry?: () => void }) {
  return (
    <Card className="p-5 border-card-border">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-3.5 w-3.5 text-brand-2" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Top Movers Today</h2>
        <UITooltip>
          <TooltipTrigger>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Top 5 stocks by absolute % change across all 8 stack layers. Refreshes every 10 min.</p>
          </TooltipContent>
        </UITooltip>
        <AsOf updatedAt={updatedAt} intervalMs={900_000} className="ml-auto" />
      </div>
      <div className="space-y-2">
        {isError ? <ErrorState label="Unable to load movers" onRetry={onRetry} /> : isLoading
          ? Array(5).fill(null).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3 w-32 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))
          : topMovers.length === 0 ? <ErrorCard label="No movers data available" /> : topMovers.filter((m) => m.price != null && m.changePercent != null).map((m) => {
              const isUp = m.changePercent >= 0;
              const sc = SECTOR_COLORS[m.sector] ?? INK.muted;
              return (
                <div key={m.ticker} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0" data-testid={`top-mover-${m.ticker}`}>
                  <span className="font-mono font-bold text-xs text-foreground w-12 flex-shrink-0">{m.ticker}</span>
                  <span className="text-xs text-muted-foreground flex-1 truncate min-w-0">{m.name}</span>
                  <span
                    className="hidden sm:inline text-10 font-medium px-1.5 py-0.5 rounded border flex-shrink-0"
                    style={{ color: sc, backgroundColor: `${sc}15`, borderColor: `${sc}30` }}
                  >
                    {SECTOR_LABEL_SHORT[m.sector] ?? m.sector}
                  </span>
                  <span className="font-mono text-xs text-foreground flex-shrink-0 w-16 text-right">${m.price.toFixed(m.price < 10 ? 2 : m.price < 100 ? 2 : 2)}</span>
                  <div className={`flex items-center gap-0.5 font-mono font-semibold text-xs flex-shrink-0 w-14 justify-end ${isUp ? "text-positive" : "text-negative"}`}>
                    {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(m.changePercent).toFixed(2)}%
                  </div>
                </div>
              );
            })}
      </div>
      {/* Sector averages (Lake 4C): uniform chip anatomy in an aligned grid,
          color purely SEMANTIC - green/red intensity by magnitude on the same
          diverging ramp as The Stack heatmap. Sector identity comes from the
          label, not a hue. */}
      {pulse.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border" data-testid="sector-chips">
          <span className="text-10 font-mono uppercase tracking-wider text-muted-foreground/60">sectors · avg % today</span>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5 mt-1.5">
            {[...pulse].sort((a, b) => b.avgChange - a.avgChange).map((p) => (
              <span
                key={p.sector}
                className="flex items-center justify-between gap-1 font-mono text-10 px-1.5 py-1 rounded-sm min-w-0"
                style={{ background: heatColor(p.avgChange) }}
                data-testid={`sector-chip-${p.sector}`}
                title={`${p.label} average ${p.avgChange >= 0 ? "+" : ""}${p.avgChange.toFixed(2)}% today`}
              >
                <span className="truncate" style={{ color: heatTextColor(p.avgChange), opacity: 0.9 }}>{p.label}</span>
                <span className="tabular-nums font-semibold" style={{ color: heatTextColor(p.avgChange) }}>
                  {p.avgChange >= 0 ? "+" : ""}{p.avgChange.toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

interface IndexHistoryDay {
  date: string;
  aiDemand: number | null;
  gridStress: number | null;
  npiEquityLegs?: number | null;
  npi?: number | null;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function gaugeTickLabel(date: string): string {
  const [y, m] = date.split("-");
  return `${MONTH_ABBR[Number(m) - 1]} '${y.slice(2)}`;
}

// Replaces the old Sector Pulse card (its sector averages now live as chips
// inside Top Movers). Plots the daily gauge history that the validation
// study reconstructed and the server now records: one consistent series,
// our own data, time depth instead of a second "what moved today" list.
// Gauge baselines mirror server/indices.ts (AI_INDEX.BASELINE, GRID_STRESS.BASELINE).
const GAUGE_BASELINES = { ai: 72, gs: 68 } as const;

type GaugeRange = "3M" | "6M" | "1Y" | "ALL";
const GAUGE_RANGES: GaugeRange[] = ["3M", "6M", "1Y", "ALL"];

function gaugeRangeStart(range: GaugeRange, now: number): number | null {
  const d = new Date(now);
  if (range === "3M") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 3, d.getUTCDate());
  if (range === "6M") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 6, d.getUTCDate());
  if (range === "1Y") return Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), d.getUTCDate());
  return null;
}

function GaugeHistoryCard({ live }: { live: { npi: number; ai: number; gs: number } | null }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<{ days: IndexHistoryDay[] }>({
    queryKey: ["/api/index-history"],
    refetchInterval: 30 * 60_000,
  });
  const [range, setRange] = useState<GaugeRange>("ALL");

  // True time axis: date strings -> UTC ms so gaps in the recorder render as
  // gaps in time, not as one category step.
  const series = useMemo(
    () =>
      (data?.days ?? [])
        .filter((d) => d.npiEquityLegs != null || d.aiDemand != null)
        .map((d) => ({ t: Date.parse(`${d.date}T00:00:00Z`), npi: d.npiEquityLegs ?? null, ai: d.aiDemand, gs: d.gridStress }))
        .filter((d) => Number.isFinite(d.t)),
    [data],
  );
  const now = series.length ? series[series.length - 1].t : Date.now();
  const start = gaugeRangeStart(range, now);
  const windowed = useMemo(() => (start === null ? series : series.filter((d) => d.t >= start)), [series, start]);
  const ticks = useMemo(() => {
    if (windowed.length < 2) return [];
    return timeTicks(windowed[0].t, windowed[windowed.length - 1].t, 560).map((d) => +d);
  }, [windowed]);

  return (
    // flex-1: fills the left column so it ends flush with the right column.
    <Card className="p-5 border-card-border flex-1 flex flex-col" data-testid="gauge-history">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="h-3.5 w-3.5 text-brand-2" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">NPI Gauge History</h2>
        <UITooltip>
          <TooltipTrigger>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">
              Daily series reconstructed from public prices with the shipped formulas, then recorded live going
              forward (one methodology end to end; reproduce with npm run backtest:indices). The NPI line is the
              equity legs with uranium and policy at par; the headline number is the full live NPI including both.
              Sparklines show the two sentiment gauges against their fixed formula baselines (dashed).
            </p>
          </TooltipContent>
        </UITooltip>
        <div className="ml-auto flex items-center gap-1.5">
          {GAUGE_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 rounded border text-10 font-mono transition-colors ${
                range === r ? "border-brand/60 text-brand bg-brand/10" : "border-subtle text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`gauge-range-${r}`}
            >
              {r}
            </button>
          ))}
          {live && (
            <span className="font-mono text-sm font-bold text-brand-2 ml-2" data-testid="gauge-history-npi-live">
              NPI {live.npi.toFixed(1)}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-10 font-mono text-muted-foreground/60">
          line: NPI equity legs · Jan 1 2024 = 100 · headline: full live NPI
        </p>
        <AsOf updatedAt={dataUpdatedAt} intervalMs={30 * 60_000} />
      </div>

      {isError ? (
        <div className="flex-1 min-h-[180px] flex flex-col justify-center">
          <ErrorState label="Unable to load gauge history" onRetry={() => refetch()} />
        </div>
      ) : isLoading ? (
        <>
          <div className="flex-1 flex flex-col justify-center gap-2 min-h-[180px]">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </>
      ) : windowed.length === 0 ? (
        <div className="flex-1 min-h-[180px] flex items-center justify-center text-xs text-muted-foreground">
          No recorded days in this window.
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-[180px]" data-testid="gauge-history-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={windowed} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="npiHistGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND.primary} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={BRAND.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  {...axisProps}
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  ticks={ticks}
                  tickFormatter={(t: number) => fmtDate(t, false)}
                />
                <YAxis
                  {...axisProps}
                  axisLine={false}
                  domain={["dataMin - 8", "dataMax + 8"]}
                  width={36}
                />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  labelFormatter={(t: number) => fmtDate(t, true)}
                  formatter={(value, name) =>
                    value == null ? ["n/a", name] : [Number(value).toFixed(1), name]
                  }
                />
                <ReferenceLine y={100} stroke={CHART_CHROME.refLine} strokeDasharray="4 3" />
                <Area
                  type="linear"
                  dataKey="npi"
                  name="NPI (equity legs)"
                  stroke={BRAND.primary}
                  strokeWidth={1.8}
                  fill="url(#npiHistGrad)"
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <SrChartTable
            caption={`NPI gauge history (equity legs, Jan 1 2024 = 100), ${range} window`}
            columns={["Date", "NPI"]}
            rows={windowed
              .filter((d) => d.npi != null)
              .map((d) => [fmtDate(d.t, true), (d.npi as number).toFixed(1)])}
          />

          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border">
            {(
              [
                { key: "ai", label: "AI Demand", color: BRAND.secondary, value: live?.ai ?? null },
                { key: "gs", label: "Grid Stress", color: SEMANTIC.negativeDeep, value: live?.gs ?? null },
              ] as const
            ).map((g) => {
              // Honest domain: the window's own values UNION the formula
              // baseline, padded - so distance from baseline is real, and a
              // one-point wiggle can't fill the full height.
              const vals = windowed.map((d) => d[g.key]).filter((v): v is number => v != null);
              const base = GAUGE_BASELINES[g.key];
              const lo = Math.min(...vals, base);
              const hi = Math.max(...vals, base);
              const pad = Math.max((hi - lo) * 0.15, 1);
              return (
                <div key={g.key} data-testid={`gauge-spark-${g.key}`}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-10 uppercase tracking-wider text-muted-foreground">{g.label}</span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {g.value != null ? g.value.toFixed(1) : "–"}
                    </span>
                  </div>
                  <div className="h-9">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={windowed} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                        <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
                        <YAxis domain={[lo - pad, hi + pad]} hide />
                        <ReferenceLine y={base} stroke={CHART_CHROME.refLine} strokeDasharray="3 3" />
                        <Line
                          type="linear"
                          dataKey={g.key}
                          stroke={g.color}
                          strokeWidth={1}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-8 font-mono text-muted-foreground/50 mt-0.5">baseline {base}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

function CatalystCalendarSection() {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<AllCatalystsResponse>({
    queryKey: ["/api/catalysts/all"],
    refetchInterval: 900000,
  });

  const items = data?.items || [];

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const itemsByDate: Record<string, MergedCatalystItem[]> = {};
  items.forEach((item) => {
    const d = (item.date || item.sortDate).slice(0, 10);
    if (!itemsByDate[d]) itemsByDate[d] = [];
    itemsByDate[d].push(item);
  });

  const selectedDateKey = selectedDay;
  const selectedItems = selectedDateKey ? (itemsByDate[selectedDateKey] ?? []) : [];

  const upcoming = items
    .filter((c) => daysUntil(c.sortDate) >= 0)
    .slice(0, 5);

  function getItemColor(item: MergedCatalystItem): string {
    if (item.type === 'earnings') return item.stageColor || BRAND.secondary;
    return CATEGORY_COLORS[item.category || ''] ?? INK.muted;
  }

  function getItemLabel(item: MergedCatalystItem): string {
    if (item.type === 'earnings') return `${item.ticker}: ${item.company} Earnings`;
    return item.title || '';
  }

  function getItemCategory(item: MergedCatalystItem): string {
    if (item.type === 'earnings') return item.stage || 'Earnings';
    return item.category || 'Event';
  }

  return (
    <Card className="p-5 border-card-border" data-testid="catalyst-calendar">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-brand-2" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Catalyst Tracker</h2>
          <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
        </div>
        <Link
          href="/catalysts"
          className="flex items-center gap-1 text-xs text-brand hover:text-brand-2 transition-colors font-medium"
          data-testid="link-all-catalysts"
        >
          All Catalysts <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {isError ? (
        <ErrorState label="Unable to load catalysts" onRetry={() => refetch()} />
      ) : (
      <>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => {
            if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
            else setViewMonth(m => m - 1);
          }}
          className="text-muted-foreground hover:text-foreground text-xs px-2 py-0.5 rounded hover:bg-muted/30 transition-colors"
          data-testid="calendar-prev"
        >
          &lsaquo;
        </button>
        <span className="text-xs font-medium text-foreground">{monthLabel}</span>
        <button
          onClick={() => {
            if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
            else setViewMonth(m => m + 1);
          }}
          className="text-muted-foreground hover:text-foreground text-xs px-2 py-0.5 rounded hover:bg-muted/30 transition-colors"
          data-testid="calendar-next"
        >
          &rsaquo;
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-10 text-muted-foreground/60 py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px">
        {Array(firstDay).fill(null).map((_, i) => <div key={`empty-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayItems = itemsByDate[dateKey] ?? [];
          const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate();
          const isSelected = selectedDay === dateKey;
          const hasItems = dayItems.length > 0;

          const dayButton = (
            <button
              onClick={() => setSelectedDay(isSelected ? null : dateKey)}
              className={`relative flex flex-col items-center justify-center h-8 rounded text-xs transition-colors w-full ${
                isSelected ? "bg-brand/20 text-brand-2" :
                isToday ? "bg-muted/40 text-foreground font-semibold" :
                "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
              }`}
              data-testid={`calendar-day-${day}`}
            >
              <span>{day}</span>
              {hasItems && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayItems.slice(0, 3).map((item, ci) => (
                    <div
                      key={ci}
                      className="h-1 w-1 rounded-full"
                      style={{ backgroundColor: getItemColor(item) }}
                    />
                  ))}
                </div>
              )}
            </button>
          );

          // Dot days get a hover popover with that day's events, so the dots
          // are functional, not decorative (Lake 4B, option picked at review).
          if (!hasItems) return <span key={day}>{dayButton}</span>;
          return (
            <UITooltip key={day}>
              <TooltipTrigger asChild>{dayButton}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] p-2.5">
                <p className="text-10 font-mono text-muted-foreground mb-1.5">
                  {new Date(viewYear, viewMonth, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {dayItems.length > 1 ? ` · ${dayItems.length} events` : ""}
                </p>
                <div className="space-y-1">
                  {dayItems.slice(0, 6).map((item) => (
                    <div key={item.id} className="flex items-start gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: getItemColor(item) }} />
                      <span className="text-11 text-foreground leading-tight">
                        {getItemLabel(item)}
                        <span className="text-muted-foreground/60 ml-1">{getItemCategory(item)}</span>
                      </span>
                    </div>
                  ))}
                  {dayItems.length > 6 && (
                    <p className="text-10 text-muted-foreground/60">+{dayItems.length - 6} more - click the day</p>
                  )}
                </div>
              </TooltipContent>
            </UITooltip>
          );
        })}
      </div>

      {selectedItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-2">
          {selectedItems.map((item) => {
            const cc = getItemColor(item);
            return (
              <div key={item.id} className="flex items-start gap-2">
                <div className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: cc }} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground leading-tight">{getItemLabel(item)}</p>
                  <span className="text-10" style={{ color: cc }}>{getItemCategory(item)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-10 uppercase tracking-wider text-muted-foreground/60 mb-2">Next 5 Upcoming</p>
        <div className="space-y-2">
          {isLoading
            ? Array(5).fill(null).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Skeleton className="h-3 w-8 flex-shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))
            : upcoming.map((item) => {
                const days = daysUntil(item.sortDate);
                const cc = getItemColor(item);
                return (
                  <div key={item.id} className="flex items-center gap-2" data-testid={`upcoming-catalyst-${item.id}`}>
                    <span className="text-10 font-mono text-muted-foreground w-8 flex-shrink-0">
                      {days === 0 ? "TODAY" : `${days}d`}
                    </span>
                    <div className="h-1 w-1 rounded-full flex-shrink-0" style={{ backgroundColor: cc }} />
                    <span className="text-xs text-foreground truncate flex-1 min-w-0">{getItemLabel(item)}</span>
                  </div>
                );
              })}
        </div>
      </div>
      </>
      )}
    </Card>
  );
}

// X retired third-party timeline embeds, so the old widget rendered as a
// permanently-empty box. A slim follow strip keeps the social pointer
// without the dead space.
function XFollowCard() {
  return (
    <Card className="p-5 border-card-border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-3.5 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-brand-2">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">@gridtilt</h2>
        </div>
        <a
          href="https://x.com/gridtilt"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-brand hover:text-brand-2 transition-colors font-medium"
          data-testid="link-gridtilt-x"
        >
          Follow <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </Card>
  );
}

interface MergedCatalystItem {
  id: string;
  type: "earnings" | "catalyst";
  date: string;
  sortDate: string;
  ticker?: string;
  company?: string;
  time?: string;
  quarter?: string;
  stage?: string;
  stageColor?: string;
  category?: string;
  title?: string;
  description?: string;
  dateLabel?: string;
  affectedTickers?: string[];
  affectedSectors?: string[];
}

interface AllCatalystsResponse {
  items: MergedCatalystItem[];
}

function relativeTime(updatedAt: number | undefined): string {
  if (!updatedAt) return "loading";
  const seconds = Math.floor((Date.now() - updatedAt) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const FEATURE_SLIDES = [
  {
    icon: Layers,
    title: "The Stack",
    description: "60+ equities across 8 supply chain layers. Compute, nuclear, uranium, power hardware, utilities, construction, and more.",
    href: "/stack",
    accent: BRAND.primary,
    preview: stackPreview,
  },
  {
    icon: Link2,
    title: "Supply Chain Tracker",
    description: "Interactive D3 force network mapping 21 nodes and 44 real supply relationships from raw materials to end-use compute.",
    href: "/supply-chain",
    accent: BRAND.secondary,
    preview: supplyChainPreview,
  },
  {
    icon: Map,
    title: "Power",
    description: "US data center map, corporate power deals, and the interconnection queue. See where the load is landing.",
    href: "/power-map",
    accent: SERIES[9], // series slot 10 (copper accent)
    preview: powerMapPreview,
  },
  {
    icon: Cpu,
    title: "Compute Frontier",
    description: "Named AI superclusters by GPUs, chips, and power, tied to the nuclear-for-AI deals that feed them.",
    href: "/compute-frontier",
    accent: BRAND.primary,
    preview: powerMapPreview,
  },
  {
    icon: CalendarDays,
    title: "Catalyst Tracker",
    description: "Live earnings calendar with 80+ tickers from Yahoo Finance, plus thesis catalysts. Never miss a market-moving event.",
    href: "/catalysts",
    accent: DATA_QUALITY.estimateFlag,
    preview: catalystPreview,
  },
  {
    icon: LineChart,
    title: "GPU Prices",
    description: "GPU rental price index across the neoclouds, plus cost-of-compute and training-run economics.",
    href: "/neocloud-intel",
    accent: BRAND.secondary,
    preview: calculatorPreview,
  },
  {
    icon: Calculator,
    title: "Analyze",
    description: "Score any portfolio for AI power exposure, and model buildout scenarios across demand, nuclear, and grid variables.",
    href: "/analyze",
    accent: BRAND.primary,
    preview: portfolioPreview,
  },
];

function ModuleGrid() {
  return (
    <div data-testid="module-grid">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Modules</h2>
        <span className="text-11 text-muted-foreground/70">{FEATURE_SLIDES.length} tools</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {FEATURE_SLIDES.map((slide) => {
          const Icon = slide.icon;
          return (
            <Link key={slide.href} href={slide.href}>
              <Card
                className="p-4 border-card-border hover:border-border transition-colors cursor-pointer h-full"
                data-testid={`module-card-${slide.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <div className="flex items-center gap-2.5 mb-1.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium text-foreground">{slide.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{slide.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function TiltOverview() {
  const { data: kpiData, isLoading, isError: kpiError, dataUpdatedAt: kpiUpdatedAt, refetch: refetchKpis } = useQuery<KpiData>({
    queryKey: ["/api/kpis"],
    refetchInterval: 900000,
  });

  const { data: topMovers, isLoading: topMoversLoading, isError: topMoversError, dataUpdatedAt: topMoversUpdatedAt, refetch: refetchTopMovers } = useQuery<TopMover[]>({
    queryKey: ["/api/top-movers"],
    refetchInterval: 900000,
  });

  const { data: sectorPulse } = useQuery<SectorPulseItem[]>({
    queryKey: ["/api/sector-pulse"],
    refetchInterval: 900000,
  });

  // Shares the cache with GaugeHistoryCard (same key) - powers the header's
  // NPI change, labeled by its TRUE span: the recorder has gaps, and calling
  // a 22-day move "1D" would lie.
  const { data: historyData } = useQuery<{ days: IndexHistoryDay[] }>({
    queryKey: ["/api/index-history"],
    refetchInterval: 30 * 60_000,
  });
  const npiDelta = useMemo(() => {
    const days = (historyData?.days ?? []).filter((d) => d.npi != null);
    if (days.length < 2 || !kpiData) return null;
    const prev = days[days.length - 2];
    const latest = days[days.length - 1];
    const prevT = Date.parse(`${prev.date}T00:00:00Z`);
    const latestT = Date.parse(`${latest.date}T00:00:00Z`);
    const gapDays = Math.round((latestT - prevT) / 86_400_000);
    const pct = ((latest.npi! - prev.npi!) / prev.npi!) * 100;
    return { pct, label: gapDays <= 4 ? "1D" : `vs ${fmtDate(prevT, true)}` };
  }, [historyData, kpiData]);

  const c = kpiData?.constituents;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Compact header strip - data starts above the fold (Lake 4A) */}
      <div className="border-b border-border px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <h1 className="text-sm font-semibold text-foreground tracking-tight">Tilt Overview</h1>
          <span className="hidden sm:block h-4 w-px bg-border" />
          {kpiData && (
            <span className="flex items-baseline gap-2 font-mono" data-testid="header-npi">
              <span className="text-10 uppercase tracking-wider text-muted-foreground">NPI</span>
              <span className="text-sm font-bold text-brand-2 tabular-nums">{kpiData.npiValue.toFixed(1)}</span>
              {npiDelta && (
                <span className={`text-11 tabular-nums ${npiDelta.pct >= 0 ? "text-positive" : "text-negative"}`}>
                  {npiDelta.pct >= 0 ? "+" : ""}{npiDelta.pct.toFixed(1)}% {npiDelta.label}
                </span>
              )}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-brand-2" />
            <span className="font-mono text-11 tracking-wide" data-testid="last-updated">Updated {relativeTime(kpiUpdatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-4 sm:space-y-5">

        {/* Dashboard density - 2-col */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 flex flex-col gap-4">
            <TopMoversSection
              topMovers={topMovers ?? []}
              pulse={sectorPulse ?? []}
              isLoading={topMoversLoading}
              isError={topMoversError}
              updatedAt={topMoversUpdatedAt}
              onRetry={() => refetchTopMovers()}
            />
            <GaugeHistoryCard
              live={kpiData ? { npi: kpiData.npiValue, ai: kpiData.aiPowerIndex, gs: kpiData.gridStress } : null}
            />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <CatalystCalendarSection />
            <XFollowCard />
          </div>
        </div>

        {/* Main demand chart */}
        <Card id="demand-chart" className="p-6 border-card-border scroll-mt-20">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-base font-semibold text-foreground">US Electricity Demand</h2>
                <UITooltip>
                  <TooltipTrigger>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">US electricity demand was flat for a decade. AI data centers are now driving load growth that utilities did not plan for.</p>
                  </TooltipContent>
                </UITooltip>
              </div>
              <p className="text-xs text-muted-foreground">Historical EIA data (TWh) through 2025. Dashed lines are GridTilt projections (2026-2030), not forecasts. Data center subset on right axis.</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm bg-series-1" />
                <span className="text-muted-foreground">Total Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm bg-brand-2" />
                <span className="text-muted-foreground">GridTilt Projection (2026-2030)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm" style={{ backgroundColor: TOKEN_CATEGORY_COLORS.datacenters }} />
                <span className="text-muted-foreground">DC Demand</span>
              </div>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={electricityData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BRAND.secondary} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={BRAND.secondary} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="dcGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={TOKEN_CATEGORY_COLORS.datacenters} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={TOKEN_CATEGORY_COLORS.datacenters} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis
                {...axisProps}
                dataKey="year"
                interval={2}
              />
              <YAxis
                {...axisProps}
                yAxisId="total"
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                domain={[3600, 6600]}
                width={42}
              />
              <YAxis
                {...axisProps}
                yAxisId="dc"
                orientation="right"
                axisLine={false}
                tickFormatter={(v) => `${v}`}
                domain={[0, 2500]}
                width={42}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Grid capacity reference line */}
              <ReferenceLine
                yAxisId="total"
                y={5100}
                stroke={alpha(SEMANTIC.negativeDeep, 0.35)}
                strokeDasharray="5 3"
                label={{ value: "Grid Capacity ~5,100 TWh", position: "right", fill: SEMANTIC.negativeDeep, fontSize: 9, dx: -90 }}
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
                stroke={alpha(INK.muted, 0.2)}
              />

              <Area
                yAxisId="total"
                type="monotone"
                dataKey="demand"
                name="Total Actual"
                stroke={SERIES[0]} // series slot 1
                strokeWidth={2.5}
                fill="url(#demandGrad)"
                dot={false}
                activeDot={{ r: 4, fill: SERIES[0] }}
                connectNulls={false}
              />
              <Area
                yAxisId="total"
                type="monotone"
                dataKey="projected"
                name="AI-Era Projection"
                stroke={BRAND.secondary}
                strokeWidth={2}
                strokeDasharray="6 3"
                fill="url(#projGrad)"
                dot={false}
                activeDot={{ r: 4, fill: BRAND.secondary }}
                connectNulls={false}
              />
              <Area
                yAxisId="dc"
                type="monotone"
                dataKey="dcDemand"
                name="DC Actual"
                stroke={TOKEN_CATEGORY_COLORS.datacenters}
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
                stroke={TOKEN_CATEGORY_COLORS.datacenters}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <SrChartTable
            caption="US electricity demand by year (TWh): EIA actuals through 2025, GridTilt projections 2026-2030"
            columns={["Year", "Total TWh", "DC TWh", "Projected"]}
            rows={electricityData.map((d) => [
              d.year,
              d.demand ?? "—",
              d.dcDemand ?? d.dcProjected ?? "—",
              d.projected ?? "—",
            ])}
          />

          {/* Annotation key */}
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            <span className="text-warning/80">* 2022: IRA signed + ChatGPT launch</span>
            <span className="text-warning/80">* 2024: TMI restart + first commercial SMR contract</span>
            <span className="text-negative/70">--- Grid capacity ceiling</span>
          </div>
        </Card>

        {/* Market gauges — research depth, intentionally demoted from headline.
            Labels follow the published backtest (docs/INDEX_VALIDATION.md):
            the momentum gauges showed no correlation with physical output,
            so they are presented as market sentiment, not measurements. */}
        <div className="pt-2">
          <div className="text-10 font-mono uppercase tracking-widest text-muted-foreground/70 mb-3">
            market gauges · methodology and validation in each card
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="kpi-triad">
            <KpiCard
              icon={Cpu}
              title="AI Power Demand"
              value={kpiData?.aiPowerIndex ?? null}
              unit="/100"
              subtitle="Market sentiment gauge"
              color="amber"
              methodology="Market sentiment gauge, 52-94 around a fixed 72 baseline. Reads today's weighted moves in NVDA (40%), TSM (25%), EQIX (20%), MU (15%). Backtested against physical electricity output (FRED, 2019-2026): no correlation at any lead, so this tracks how the market is pricing the AI buildout today, not data center load. Formulas and the full study are public in the repo (docs/INDEX_VALIDATION.md)."
              constituents={c ? (
                <>
                  <ConstituentRow label="NVDA" value={c.nvdaChange} />
                  <ConstituentRow label="TSM" value={c.tsmChange} />
                  <ConstituentRow label="EQIX" value={c.eqixChange} />
                  <ConstituentRow label="MU" value={c.muChange} />
                </>
              ) : undefined}
              isLoading={isLoading}
            />
            <KpiCard
              icon={Zap}
              title="Nuclear Power Index"
              value={kpiData?.npiValue ?? null}
              unit=""
              subtitle="Basket index, Jan 1, 2024 = 100"
              color="amber"
              methodology="Weighted basket of CEG (25%), VST (20%), CCJ (15%), NLR ETF (20%), uranium spot (10%), and an SMR policy score (10%) derived from active nuclear PPAs in the tracked interconnection dataset. Rebased to 100 on Jan 1, 2024 and never rebalanced, so winners compound their influence: as of the June 2026 study VST's effective weight had grown to ~43% and drives ~91% of daily variance. Full numbers in docs/INDEX_VALIDATION.md."
              constituents={c ? (
                <>
                  <PerfRow label="CEG" perf={c.cegPerf} />
                  <PerfRow label="VST" perf={c.vstPerf} />
                  <PerfRow label="CCJ" perf={c.ccjPerf} />
                  <PerfRow label="NLR" perf={c.nlrPerf} />
                  <PerfRow label="U₃O₈" perf={c.uPerf} />
                </>
              ) : undefined}
              isLoading={isLoading}
            />
            <KpiCard
              icon={AlertTriangle}
              title="Grid Stress"
              value={kpiData?.gridStress ?? null}
              unit="/100"
              subtitle="Market sentiment gauge"
              color="red"
              methodology="Market sentiment gauge, 52-92 around a fixed 68 baseline. Reads today's weighted moves in VST (40%), CEG (35%), EQIX (25%). Backtested against physical electricity output: no correlation found, and the basket does not beat VST alone, so this reads power-equity momentum, not reserve margins or LMPs. It also co-moves with NPI at r 0.96 (CEG+VST sit in both baskets), so treat the two cards as one signal, not two. Formulas and the full study are public in the repo (docs/INDEX_VALIDATION.md)."
              constituents={c ? (
                <>
                  <ConstituentRow label="VST" value={c.vstChange} />
                  <ConstituentRow label="CEG" value={c.cegChange} />
                  <ConstituentRow label="EQIX" value={c.eqixChange} />
                </>
              ) : undefined}
              isLoading={isLoading}
            />
          </div>

          {!isLoading && kpiData && (
            <div className="mt-3">
              <TiltStatusBar
                aiPower={kpiData.aiPowerIndex}
                gridStress={kpiData.gridStress}
                npi={kpiData.npiValue}
              />
            </div>
          )}

          {kpiError && (
            <Card className="mt-3 border-negative-deep/20 bg-negative-deep/5">
              <ErrorState
                label="Live index data unavailable. Showing last known values."
                onRetry={() => refetchKpis()}
                className="py-4"
              />
            </Card>
          )}
        </div>

        {/* 4-column stat strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "DC Share of US Demand", value: "~6.4%", sub: "EIA 2025: ~288 TWh, up from 4.4% in 2023. DOE projects 12%+ by 2028.", color: TOKEN_CATEGORY_COLORS.datacenters },
            { label: "Nuclear Power Committed", value: "12+ GW", sub: "Big Tech nuclear PPAs as of Q1 2026. Meta 6.6 GW, Microsoft 1.2 GW, Amazon 2.5+ GW.", color: BRAND.secondary },
            { label: "Grid Reserve Margins", value: "Tightening", sub: "MISO 13.4%, ERCOT 15.8% per NERC 2026. Capacity warnings through 2028.", color: INK.muted },
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
                <p className="text-xs">Source: EIA Electric Power Monthly (2025). Data centers are the fastest-growing sector at +33% YoY.</p>
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
                <div className={`flex items-center gap-1 w-16 justify-end text-xs font-mono font-semibold ${s.yoy >= 0 ? "text-positive" : "text-negative"}`}>
                  {s.yoy >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(s.yoy)}% YoY
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            US electricity demand was flat from 2010-2022. By 2025 it reached ~4,490 TWh, up 15% from the 2022 low. Data center load is now +33% YoY.
          </p>
        </Card>

        {/* Explore modules — discovery, moved to the bottom of the dashboard */}
        <ModuleGrid />

        <EmailCapture variant="inline" />

        <footer className="pt-4 border-t border-border/40 text-11 text-muted-foreground/60 leading-relaxed space-y-1">
          <p>
            Data: Yahoo Finance · EIA · DOE · NERC · LBNL · public RSS sources. Composite indices computed in-house; methodology in each card's info tooltip.
          </p>
          <p>
            Research and commentary, not investment advice. Past performance does not predict future returns.
            Built by Jack Schwartz · <a href="https://x.com/gridtilt" target="_blank" rel="noopener noreferrer" className="hover:text-foreground/80 transition-colors">@gridtilt</a>
          </p>
        </footer>

      </div>
      <ScrollTriggeredBanner />
    </div>
  );
}
