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
  BRAND, CATEGORY_COLORS as TOKEN_CATEGORY_COLORS, CHART_CHROME, DATA_QUALITY, FONT, INK, SEMANTIC, SERIES,
} from "@/lib/tokens";
import { axisProps, gridProps, seriesMotion, timeTicks, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from "@/lib/chart-theme";
import {
  US_SECTOR_DEMAND,
  DATA_CENTER_LOAD,
  sectorTotalTWh,
  sectorShare,
  demandTrough,
  latestDemand,
  pctChange,
} from "@/lib/sector-demand";
import { bucketFor, buyersForType, asGW, type BucketLite, type DealRowLite } from "@/lib/deal-rollups";
import { RTO_CONFIG, RTO_SOURCE_NOTE } from "@/data/rto-config";
import { STAGE_COLORS } from "@/data/catalyst-config";
import {
  buildBuildoutHistory, computeTrackedPower, filterTrackedFacilities, fmtGW, tightestRTO,
  type BuildoutHistory, type FacilityLite, type TrackedPower,
} from "@/lib/real-gauges";
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

// US total annual electricity demand (TWh), EIA.
//
// The data-center series carries ONLY the two figures LBNL actually publishes:
// 58 TWh in 2014 and 176 TWh in 2023. It previously ran a smooth invented curve
// from 140 to 576 TWh, which was 2-3x above the reference figures at every point
// (170 vs 58 in 2014, 310 vs 176 in 2023). Years LBNL does not measure are null,
// and the chart joins the two anchors with a dashed segment so the gap reads as
// unmeasured rather than observed.
//
// The 2026-2030 rows are gone with the projection they carried. Those were
// labelled "GridTilt Projection" in the legend and topped out at 2,100 TWh of
// data-center demand by 2030, roughly 4x the top of LBNL's published 2028 range
// of 325-580 TWh. Nothing sourced supported them.
//
// Source: LBNL, 2024 United States Data Center Energy Usage Report (DOE-funded)
// https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report_1.pdf
const electricityData: Array<{ year: string; demand: number | null; dcDemand: number | null }> = [
  { year: "2010", demand: 3879, dcDemand: null },
  { year: "2011", demand: 3883, dcDemand: null },
  { year: "2012", demand: 3826, dcDemand: null },
  { year: "2013", demand: 3888, dcDemand: null },
  { year: "2014", demand: 3879, dcDemand: 58 },
  { year: "2015", demand: 3862, dcDemand: null },
  { year: "2016", demand: 3898, dcDemand: null },
  { year: "2017", demand: 3887, dcDemand: null },
  { year: "2018", demand: 3997, dcDemand: null },
  { year: "2019", demand: 3955, dcDemand: null },
  { year: "2020", demand: 3802, dcDemand: null },
  { year: "2021", demand: 3930, dcDemand: null },
  { year: "2022", demand: 4050, dcDemand: null },
  { year: "2023", demand: 4195, dcDemand: 176 },
  { year: "2024", demand: 4380, dcDemand: null },
  { year: "2025", demand: 4490, dcDemand: null },
];

const annotations = [
  { year: "2020", label: "COVID drop", color: alpha(SEMANTIC.negativeDeep, 0.4) },
  { year: "2022", label: "IRA signed + ChatGPT", color: alpha(BRAND.secondary, 0.4) },
  { year: "2024", label: "TMI restart + SMR deal", color: alpha(BRAND.secondary, 0.5) },
];

/** The slice of /api/gpu-prices/metrics the gauges read. */
interface GpuFleetLite {
  fleetAvg: number;
  fleetAvg1yChange: number | null;
  modelCount: number;
  rows: Array<{ model: string; current: number }>;
}


interface TopMover {
  ticker: string;
  name: string;
  price: number;
  change: number | null;
  changePercent: number | null;
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

/**
 * Colour per electricity end-use sector. Distinct from the equity SECTOR_COLORS
 * below. Figures and arithmetic live in @/lib/sector-demand.
 */
const DEMAND_SECTOR_COLORS: Record<string, string> = {
  Residential: INK.muted,
  Commercial: SERIES[3], // series slot 4
  Industrial: INK.secondary,
};

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
  construction: "Construction",
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
        <h2 className="text-[13px] font-semibold text-foreground">Top Movers Today</h2>
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
          : topMovers.length === 0 ? <ErrorCard label="No movers data available" /> : topMovers.filter(
              // Type predicate, not a bare filter: without it TypeScript keeps
              // changePercent nullable inside the map and the null-safety here
              // is unenforced, which is how .toFixed on a null ships.
              (m): m is TopMover & { price: number; changePercent: number } =>
                m.price != null && m.changePercent != null,
            ).map((m) => {
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
          diverging ramp as Equities heatmap. Sector identity comes from the
          label, not a hue. */}
      {pulse.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border" data-testid="sector-chips">
          <span className="text-[11px] text-muted-foreground/70">sectors · avg % today</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 mt-1.5">
            {[...pulse].sort((a, b) => b.avgChange - a.avgChange).map((p) => (
              <span
                key={p.sector}
                className="flex items-center justify-between gap-1 font-mono text-10 px-1.5 py-1 rounded-sm min-w-0"
                style={{ background: heatColor(p.avgChange) }}
                data-testid={`sector-chip-${p.sector}`}
                title={`${p.label} average ${p.avgChange >= 0 ? "+" : ""}${p.avgChange.toFixed(2)}% today`}
              >
                {/* designed short labels, never mid-word ellipsis (grid gives each chip room to fit them) */}
                <span className="whitespace-nowrap" style={{ color: heatTextColor(p.avgChange), opacity: 0.9 }}>{SECTOR_LABEL_SHORT[p.sector] ?? p.label}</span>
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

/** One real gauge: a measured number, its provenance, and where it links. */
function RealGaugeCard({
  icon: Icon,
  title,
  value,
  delta,
  deltaColor,
  subtitle,
  methodology,
  rows,
  isLoading,
  href,
  updatedAt,
}: {
  icon: typeof Zap;
  title: string;
  value: string | null;
  delta: string | null;
  deltaColor?: string;
  subtitle: string;
  methodology: string;
  rows: Array<{ label: string; value: string }>;
  isLoading: boolean;
  href: string;
  updatedAt?: number;
}) {
  return (
    <Card className="p-5 border border-card-border relative" data-testid={`gauge-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-2/10 border border-brand-2/25">
          <Icon className="h-5 w-5 text-brand-2" />
        </div>
        <UITooltip>
          <TooltipTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground transition-colors" data-testid={`tooltip-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              <Info className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-sm p-3">
            <p className="text-xs leading-relaxed">{methodology}</p>
          </TooltipContent>
        </UITooltip>
      </div>
      <p className="text-[13px] font-semibold text-foreground mb-1.5">{title}</p>
      {isLoading || value === null ? (
        <Skeleton className="h-9 w-32 mb-1" />
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-3xl font-bold tabular-nums text-brand-2 font-mono">{value}</span>
          {delta && (
            <span className="text-11 font-mono tabular-nums leading-tight" style={{ color: deltaColor ?? INK.muted }}>{delta}</span>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      {rows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-11 font-mono">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="text-foreground tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <Link href={href} className="text-11 text-brand hover:text-brand-2 font-medium">
          Full data <ChevronRight className="h-3 w-3 inline" />
        </Link>
        {updatedAt !== undefined && <AsOf updatedAt={updatedAt} intervalMs={900000} />}
      </div>
    </Card>
  );
}

/**
 * Chart end-value label: annotates the LAST point of a series with its value
 * ("18.8 GW online" / "33.4 GW committed") so the chart's two headline
 * numbers read without hovering.
 */
function EndLabel({
  x,
  y,
  index,
  data,
  field,
  color,
}: {
  x?: number;
  y?: number;
  index?: number;
  data: Array<{ online: number | null; pipeline: number | null }>;
  field: "online" | "pipeline";
  color: string;
}) {
  if (x === undefined || y === undefined || index === undefined) return null;
  // last index carrying a value for this series
  let lastIdx = -1;
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][field] !== null) {
      lastIdx = i;
      break;
    }
  }
  if (index !== lastIdx) return null;
  const v = data[lastIdx][field];
  if (v === null) return null;
  return (
    <text
      x={x}
      y={y - 8}
      textAnchor="end"
      fill={color}
      fontSize={10}
      fontFamily={FONT.mono}
      fontWeight={600}
    >
      {fmtGW(v)} {field === "online" ? "online" : "committed"}
    </text>
  );
}

/**
 * Real buildout history: cumulative tracked capacity from facility open
 * dates. Solid = operational (observed history), dashed = construction
 * pipeline by planned open date (committed, not yet online).
 */
function BuildoutHistoryCard({
  buildout,
  tracked,
  isLoading,
}: {
  buildout: BuildoutHistory | null;
  tracked: TrackedPower | null;
  isLoading: boolean;
}) {
  const series = useMemo(() => {
    if (!buildout) return [];
    const pts: Array<{ t: number; online: number | null; pipeline: number | null; addedMW: number; name?: string }> = [];
    for (const p of buildout.online) pts.push({ t: p.t, online: p.cumMW, pipeline: null, addedMW: p.addedMW, name: p.name });
    // bridge point so the dashed pipeline continues from the last online step
    const last = buildout.online[buildout.online.length - 1];
    if (last && buildout.pipeline.length) pts.push({ t: last.t, online: null, pipeline: last.cumMW, addedMW: 0 });
    for (const p of buildout.pipeline) pts.push({ t: p.t, online: null, pipeline: p.cumMW, addedMW: p.addedMW, name: p.name });
    return pts.sort((a, b) => a.t - b.t);
  }, [buildout]);
  const ticks = useMemo(() => {
    if (series.length < 2) return [];
    return timeTicks(series[0].t, series[series.length - 1].t, 560).map((d) => +d);
  }, [series]);

  return (
    <Card className="p-5 border-card-border flex-1 flex flex-col" data-testid="buildout-history">
      {/* flex-wrap + nowrap headline: on narrow screens the GW figure drops to its own line instead of breaking mid-phrase */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
        <Activity className="h-3.5 w-3.5 text-brand-2" />
        <h2 className="text-[13px] font-semibold text-foreground">Tracked Buildout Over Time</h2>
        <UITooltip>
          <TooltipTrigger>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">
              Cumulative rated power of the verified facility dataset by each facility's open date. Solid = operational
              today (observed history). Dashed = under-construction capacity at its planned open date (committed
              pipeline, not yet online). Announced projects are excluded entirely.
            </p>
          </TooltipContent>
        </UITooltip>
        {tracked && (
          <span className="ml-auto whitespace-nowrap font-mono text-sm font-bold text-brand-2" data-testid="buildout-headline">
            {fmtGW(tracked.trackedMW)} tracked
          </span>
        )}
      </div>
      <p className="text-10 font-mono text-muted-foreground/60 mb-3">
        solid: operational · dashed: construction pipeline · announced excluded
        {buildout && buildout.undatedCount > 0 ? ` · ${buildout.undatedCount} undated sites excluded` : ""}
      </p>

      {isLoading || series.length === 0 ? (
        isLoading ? (
          <div className="flex-1 flex flex-col justify-center gap-2 min-h-[180px]">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="flex-1 min-h-[180px] flex items-center justify-center text-xs text-muted-foreground">
            Facility data unavailable.
          </div>
        )
      ) : (
        <>
          <div className="flex-1 min-h-[200px]" data-testid="buildout-chart">
            <ResponsiveContainer width="100%" height="100%">
              {/* right margin leaves room for the final x tick ("Jan '28") to render unclipped */}
              <ComposedChart data={series} margin={{ top: 6, right: 30, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="buildoutGrad" x1="0" y1="0" x2="0" y2="1">
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
                  width={44}
                  tickFormatter={(mw: number) => `${(mw / 1000).toFixed(0)} GW`}
                />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                  labelFormatter={(t: number) => fmtDate(t, false)}
                  formatter={(value: number, name: string, entry: any) => {
                    const added = entry?.payload?.addedMW;
                    const nm = entry?.payload?.name;
                    const detail = added ? ` (+${fmtGW(added)}${nm ? ` · ${nm}` : ""})` : "";
                    return [`${fmtGW(value)}${detail}`, name === "online" ? "Operational" : "Pipeline"];
                  }}
                />
                <Area {...seriesMotion()}
                  type="stepAfter"
                  dataKey="online"
                  name="online"
                  stroke={BRAND.primary}
                  strokeWidth={1.8}
                  fill="url(#buildoutGrad)"
                  dot={false}
                  connectNulls
                  label={(props: any) => <EndLabel {...props} data={series} field="online" color={BRAND.primary} />}
                />
                <Line {...seriesAnimation}
                  type="stepAfter"
                  dataKey="pipeline"
                  name="pipeline"
                  stroke={BRAND.secondary}
                  strokeWidth={1.6}
                  strokeDasharray="5 4"
                  strokeOpacity={0.7}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  label={(props: any) => <EndLabel {...props} data={series} field="pipeline" color={BRAND.secondary} />}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <SrChartTable
            caption="Tracked AI data center buildout over time"
            columns={["Date", "Cumulative GW", "Series"]}
            rows={series.map((p) => [
              fmtDate(p.t, false),
              ((p.online ?? p.pipeline ?? 0) / 1000).toFixed(2),
              p.online !== null ? "operational" : "pipeline",
            ])}
          />
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
    // Server stageColor is a legacy all-orange hex - client tokens win.
    if (item.type === 'earnings') return (item.stage && STAGE_COLORS[item.stage]) || BRAND.secondary;
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
          <h2 className="text-[13px] font-semibold text-foreground">Catalyst Tracker</h2>
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
        <p className="text-[11px] text-muted-foreground/70 mb-2">Next 5 Upcoming</p>
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
          <h2 className="text-[13px] font-semibold text-foreground">@gridtilt</h2>
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
    title: "Equities",
    description: "60+ equities across 8 supply chain layers. Compute, nuclear, uranium, power hardware, utilities, construction, and more.",
    href: "/stack",
    accent: BRAND.primary,
    preview: stackPreview,
  },
  {
    icon: Link2,
    title: "Supply Chain Flow",
    description: "Interactive network of 21 nodes and 44 real supply relationships, staged from raw materials to end-use compute. Lives inside Equities.",
    href: "/stack?view=flow",
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
  // Real gauge sources: the facility dataset (shared with the Power map) and
  // the GPU price index (shared with GPU Prices) - react-query dedupes both.
  const { data: facilities, isLoading: dcLoading, dataUpdatedAt: dcUpdatedAt } = useQuery<FacilityLite[]>({
    queryKey: ["/api/datacenters"],
    refetchInterval: 900000,
  });
  const { data: gpuData, isLoading: gpuLoading, dataUpdatedAt: gpuUpdatedAt } = useQuery<GpuFleetLite>({
    queryKey: ["/api/gpu-prices/metrics"],
    refetchInterval: 900000,
  });
  // Same >=400 MW floor as the Power map, so headline and drill-down agree.
  const trackedFacilities = useMemo(() => (facilities ? filterTrackedFacilities(facilities) : null), [facilities]);
  const tracked = useMemo(() => (trackedFacilities ? computeTrackedPower(trackedFacilities) : null), [trackedFacilities]);
  const buildout = useMemo(() => (trackedFacilities ? buildBuildoutHistory(trackedFacilities) : null), [trackedFacilities]);
  const headroom = useMemo(() => tightestRTO(RTO_CONFIG), []);
  // Same payload the Deals page computes from. The hand-written version carried
  // three different numbers for one fact.
  const { data: dealMetrics } = useQuery<{ byType: BucketLite[]; rows: DealRowLite[] }>({
    queryKey: ["/api/deals/metrics"],
  });
  const nuclearDeals = useMemo(() => bucketFor(dealMetrics?.byType, "nuclear"), [dealMetrics]);
  const topNuclearBuyer = useMemo(
    () => buyersForType(dealMetrics?.rows, "nuclear")[0] ?? null,
    [dealMetrics],
  );
  // Derived from electricityData so the copy cannot drift from the chart above,
  // as the previous "up 15% from the 2022 low" line had.
  const sectorTotal = useMemo(() => sectorTotalTWh(), []);
  const trough = useMemo(() => demandTrough(electricityData), []);
  const latest = useMemo(() => latestDemand(electricityData), []);
  const troughRise = useMemo(
    () => (trough && latest ? pctChange(trough.twh, latest.twh) : null),
    [trough, latest],
  );
  const headroomRows = useMemo(() => {
    return Object.values(RTO_CONFIG)
      .sort((a, b) => a.reserveMargin - b.reserveMargin)
      .slice(0, 3)
      .map((r) => ({ label: r.label, value: `${r.reserveMargin.toFixed(1)}% · ${r.aiSignal}` }));
  }, []);
  const gpuTopRows = useMemo(() => {
    const rows = [...(gpuData?.rows ?? [])].sort((a, b) => b.current - a.current);
    return [
      ...(rows.length ? [{ label: rows[0].model, value: `$${rows[0].current.toFixed(2)}/hr · priciest` }] : []),
      ...(rows.length > 1 ? [{ label: rows[rows.length - 1].model, value: `$${rows[rows.length - 1].current.toFixed(2)}/hr · cheapest` }] : []),
    ];
  }, [gpuData]);

  const { data: topMovers, isLoading: topMoversLoading, isError: topMoversError, dataUpdatedAt: topMoversUpdatedAt, refetch: refetchTopMovers } = useQuery<TopMover[]>({
    queryKey: ["/api/top-movers"],
    refetchInterval: 900000,
  });

  const { data: sectorPulse } = useQuery<SectorPulseItem[]>({
    queryKey: ["/api/sector-pulse"],
    refetchInterval: 900000,
  });


  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Compact header strip - data starts above the fold (Lake 4A) */}
      <div className="border-b border-border px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <h1 className="text-sm font-semibold text-foreground tracking-tight">Overview</h1>
          <span className="hidden sm:block h-4 w-px bg-border" />
          {tracked && (
            <span className="flex items-baseline gap-2 font-mono" data-testid="header-tracked">
              <span className="text-[11px] text-muted-foreground">Tracked AI Power</span>
              <span className="text-sm font-bold text-brand-2 tabular-nums">{fmtGW(tracked.trackedMW)}</span>
              <span className="text-11 tabular-nums text-muted-foreground">
                +{fmtGW(tracked.constructionMW)} building
              </span>
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-brand-2" />
            <span className="font-mono text-11 tracking-wide" data-testid="last-updated">Updated {relativeTime(dcUpdatedAt)}</span>
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
            <BuildoutHistoryCard buildout={buildout} tracked={tracked} isLoading={dcLoading} />
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
              <p className="text-xs text-muted-foreground">
                US total electricity demand (TWh), EIA, through 2025. Data-center demand on the right axis
                shows the two years LBNL measures, 2014 and 2023; the dashed segment between them is not measured.{" "}
                <a
                  href="https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report_1.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:text-brand-2"
                >
                  LBNL 2024 report
                </a>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm bg-series-1" />
                <span className="text-muted-foreground">Total demand (EIA)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm" style={{ backgroundColor: TOKEN_CATEGORY_COLORS.datacenters }} />
                <span className="text-muted-foreground">Data centers (LBNL, measured years)</span>
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
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis
                {...axisProps}
                dataKey="year"
                interval={2}
              />
              {/* explicit round ticks: recharts autos over these domains land on 5.1k/5.8k/6.6k noise */}
              <YAxis
                {...axisProps}
                yAxisId="total"
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                domain={[3600, 6600]}
                ticks={[4000, 5000, 6000]}
                width={42}
              />
              <YAxis
                {...axisProps}
                yAxisId="dc"
                orientation="right"
                axisLine={false}
                tickFormatter={(v) => `${v}`}
                domain={[0, 200]}
                ticks={[0, 50, 100, 150, 200]}
                width={42}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* The "Grid Capacity ~5,100 TWh" reference line was removed: no
                  source, no methodology, and it only ever intersected the
                  invented projection that has also been removed. */}

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

              <Area {...seriesMotion()}
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
              {/* Two measured points, joined dashed. connectNulls draws the
                  segment across the years LBNL does not publish; the dash and
                  the visible dots say the endpoints are observed and the line
                  between them is not. */}
              <Line {...seriesMotion()}
                yAxisId="dc"
                type="linear"
                dataKey="dcDemand"
                name="Data centers (LBNL)"
                stroke={TOKEN_CATEGORY_COLORS.datacenters}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={{ r: 3, fill: TOKEN_CATEGORY_COLORS.datacenters }}
                activeDot={{ r: 4, fill: TOKEN_CATEGORY_COLORS.datacenters }}
                connectNulls={true}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <SrChartTable
            caption="US electricity demand by year (TWh): EIA totals through 2025, with LBNL-measured data-center demand for 2014 and 2023"
            columns={["Year", "Total TWh", "Data centers TWh"]}
            rows={electricityData.map((d) => [
              d.year,
              d.demand ?? "—",
              d.dcDemand ?? "not measured",
            ])}
          />

          {/* Annotation key */}
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            <span className="text-warning/80">* 2022: IRA signed + ChatGPT launch</span>
            <span className="text-warning/80">* 2024: TMI restart + first commercial SMR contract</span>
          </div>
        </Card>

        {/* Real gauges (owner-directed): direct measurements over sourced
            data. The synthetic sentiment indices this replaces are archived
            in docs/INDEX_VALIDATION.md. */}
        <div className="pt-2">
          <div className="text-[12px] font-semibold text-muted-foreground mb-3">
            Key metrics
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="kpi-triad">
            <RealGaugeCard
              icon={Zap}
              title="Tracked AI DC Power"
              value={tracked ? fmtGW(tracked.trackedMW) : null}
              // headline counts built or building only; the Power map header counts all tracked sites incl. announced - say both so the surfaces agree
              delta={tracked ? `${tracked.operationalCount + tracked.constructionCount} built or building of ${tracked.operationalCount + tracked.constructionCount + tracked.announcedCount} tracked` : null}
              subtitle="Operational + under construction, verified facilities"
              methodology={`Sum of rated power across the verified US AI data center dataset (facilities >=400 MW). Operational plus under-construction only. Announced projects (${tracked ? fmtGW(tracked.announcedMW) : "-"}) are excluded from the headline until construction is confirmed. Same dataset as the Power map.`}
              isLoading={dcLoading}
              rows={tracked ? [
                { label: "Operational", value: `${fmtGW(tracked.operationalMW)} · ${tracked.operationalCount} sites` },
                { label: "Construction", value: `${fmtGW(tracked.constructionMW)} · ${tracked.constructionCount} sites` },
                { label: "Announced (excl.)", value: `${fmtGW(tracked.announcedMW)} · ${tracked.announcedCount} sites` },
              ] : []}
              href="/power-map"
              updatedAt={dcUpdatedAt}
            />
            <RealGaugeCard
              icon={Cpu}
              title="Cost of AI Compute"
              value={gpuData ? `$${gpuData.fleetAvg.toFixed(2)}/hr` : null}
              delta={gpuData?.fleetAvg1yChange != null ? `${gpuData.fleetAvg1yChange > 0 ? "+" : ""}${gpuData.fleetAvg1yChange.toFixed(1)}% 1Y` : null}
              deltaColor={gpuData?.fleetAvg1yChange != null ? (gpuData.fleetAvg1yChange > 0 ? SEMANTIC.negative : SEMANTIC.positive) : undefined}
              subtitle={`Fleet-average GPU rental, ${gpuData?.modelCount ?? "-"} models`}
              methodology="Mean on-demand rental price across the tracked GPU fleet, blended from public neocloud and marketplace listings (sourced estimates, flagged per model on the GPU Prices page). Falling prices mean compute supply is catching demand."
              isLoading={gpuLoading}
              rows={gpuData ? gpuTopRows : []}
              href="/neocloud-intel"
              updatedAt={gpuUpdatedAt}
            />
            <RealGaugeCard
              icon={AlertTriangle}
              title="Grid Headroom"
              value={headroom ? `${headroom.reserveMarginPct.toFixed(1)}%` : null}
              delta={headroom ? `${headroom.label} · tightest RTO` : null}
              deltaColor={headroom ? SEMANTIC.negative : undefined}
              subtitle="Lowest reserve margin among AI-load RTOs"
              methodology={`Projected reserve margins from ${RTO_SOURCE_NOTE}. The headline shows the tightest region. NERC's reference margin level is roughly 15%; regions below it face constrained interconnection for large new loads.`}
              isLoading={false}
              rows={headroomRows}
              href="/power-map"
            />
          </div>
        </div>

        {/* 4-column stat strip */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "DC Share of US Demand", value: "~6.4%", sub: "EIA 2025: ~288 TWh, up from 4.4% in 2023. DOE projects 12%+ by 2028.", color: TOKEN_CATEGORY_COLORS.datacenters },
            {
              label: "Nuclear Power Contracted",
              // "Committed" previously counted Meta's 6.6 GW RFP, a request
              // rather than a contract.
              value: asGW(nuclearDeals?.mw) ? `${asGW(nuclearDeals?.mw)} GW` : "--",
              sub: nuclearDeals
                ? `Across ${nuclearDeals.count} tracked nuclear power deals.${
                    topNuclearBuyer && asGW(topNuclearBuyer.mw)
                      ? ` Largest buyer ${topNuclearBuyer.buyer} at ${asGW(topNuclearBuyer.mw)} GW.`
                      : ""
                  }`
                : "Deal data unavailable.",
              color: BRAND.secondary,
            },
            { label: "Grid Reserve Margins", value: "Tightening", sub: "MISO 13.4%, ERCOT 15.8% per NERC 2026. Capacity warnings through 2028.", color: INK.muted },
          ].map((s) => (
            <Card key={s.label} className="p-4 border-card-border">
              <p className="text-xs text-muted-foreground mb-2">{s.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">{s.sub}</p>
            </Card>
          ))}
        </div>

        {/* Sector demand breakdown */}
        <Card className="p-5 border-card-border">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[13px] font-semibold text-foreground">2025 US Electricity Demand by Sector</h2>
            <UITooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  Source: EIA Electric Power Monthly (2025). Residential, commercial and industrial
                  are the end-use sectors and cover all demand between them. Data-center load is
                  metered inside commercial and industrial, so it is shown as a share of them rather
                  than added to them.
                </p>
              </TooltipContent>
            </UITooltip>
          </div>
          <div className="divide-y divide-border">
            {/* Bar sits below the label rather than between fixed-width columns,
                which left it no room on a phone and rendered the sectors as dots. */}
            {US_SECTOR_DEMAND.map((s) => {
              const share = sectorShare(s.twh, sectorTotal);
              return (
                <div key={s.sector} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-xs font-medium text-foreground">{s.sector}</p>
                    <div className="flex shrink-0 items-baseline gap-3">
                      <p className="text-xs font-mono text-foreground tabular-nums">
                        {s.twh.toLocaleString()} TWh
                      </p>
                      <span
                        className={`flex items-center gap-0.5 text-xs font-mono font-semibold tabular-nums ${
                          s.yoy >= 0 ? "text-positive" : "text-negative"
                        }`}
                      >
                        {s.yoy >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(s.yoy)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 bg-muted/30 rounded-full h-1.5">
                    {/* Scaled to the sum of the sectors shown. */}
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${share ?? 0}%`,
                        backgroundColor: DEMAND_SECTOR_COLORS[s.sector] ?? INK.muted,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shown below the sectors, not as a fourth row: the load is already
              counted inside commercial and industrial. */}
          <div className="mt-3 pt-3 border-t border-border">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-xs font-medium text-foreground">
                of which data centers
              </p>
              <div className="flex shrink-0 items-baseline gap-3">
                <p
                  className="text-xs font-mono tabular-nums"
                  style={{ color: DATA_QUALITY.estimateFlag }}
                >
                  ~{DATA_CENTER_LOAD.twh.toLocaleString()} TWh
                </p>
                <span className="flex items-center gap-0.5 text-xs font-mono font-semibold tabular-nums text-positive">
                  <ArrowUp className="h-3 w-3" />
                  {DATA_CENTER_LOAD.yoy}%
                </span>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground/70 mt-1.5">
              Estimated, and metered inside {DATA_CENTER_LOAD.containedIn} above rather than added to
              them. EIA's end-use accounting has no data-center category, so this is a derived
              figure.
            </p>
          </div>

          <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
            The three end-use sectors total {sectorTotal.toLocaleString()} TWh.
            {trough && latest && troughRise !== null
              ? ` US demand was flat through the 2010s, bottomed at ${trough.twh.toLocaleString()} TWh in ${trough.year}, and reached ${latest.twh.toLocaleString()} TWh by ${latest.year}, up ${troughRise.toFixed(0)}%.`
              : ""}
          </p>
        </Card>

        {/* Explore modules — discovery, moved to the bottom of the dashboard */}
        <ModuleGrid />

        <EmailCapture variant="inline" />


      </div>
      <ScrollTriggeredBanner />
    </div>
  );
}
