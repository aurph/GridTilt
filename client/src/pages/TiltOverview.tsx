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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AsOf, ErrorState, SrChartTable } from "@/components/Freshness";
import { PageShell, PageTitle, Provenance, PullStat, RuleSection } from "@/components/editorial";
import {
  BRAND, CATEGORY_COLORS as TOKEN_CATEGORY_COLORS, DATA_QUALITY, FONT, INK, SEMANTIC, SERIES,
} from "@/lib/tokens";
import { axisProps, gridProps, timeTicks, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from "@/lib/chart-theme";
import { RTO_CONFIG, RTO_SOURCE_NOTE } from "@/data/rto-config";
import { STAGE_COLORS } from "@/data/catalyst-config";
import {
  buildBuildoutHistory, computeTrackedPower, filterTrackedFacilities, fmtGW, tightestRTO,
  type BuildoutHistory, type FacilityLite, type TrackedPower,
} from "@/lib/real-gauges";
import { fmtDate } from "@/lib/gpu-series";
import { heatColor, heatTextColor } from "@/lib/stack-transforms";

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
  { year: "2022", label: "IRA signed + ChatGPT", color: alpha(BRAND.secondary, 0.5) },
  { year: "2024", label: "TMI restart + SMR deal", color: alpha(BRAND.secondary, 0.6) },
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
      <div className="bg-popover border border-rule rounded-sm p-3 shadow-md text-[12.5px]">
        <p className="font-semibold text-foreground mb-2">{label}</p>
        {payload.map((entry: any, i: number) => (
          entry.value != null && (
            <p key={i} className="tnum" style={{ color: entry.stroke || entry.color }}>
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

function MarketsSection({ topMovers, pulse, isLoading, isError, updatedAt, onRetry }: { topMovers: TopMover[]; pulse: SectorPulseItem[]; isLoading: boolean; isError?: boolean; updatedAt?: number; onRetry?: () => void }) {
  return (
    <RuleSection
      head="Markets"
      aside={
        <>
          <AsOf updatedAt={updatedAt} intervalMs={900_000} />
          <Link href="/stack" className="text-ink no-underline hover:text-brand-ink">The Stack →</Link>
        </>
      }
      className="mt-0"
      testId="markets-section"
    >
      {isError ? (
        <ErrorState label="Unable to load movers" onRetry={onRetry} />
      ) : isLoading ? (
        <div className="space-y-2 py-2">
          {Array(5).fill(null).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-32 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : topMovers.length === 0 ? (
        <p className="py-6 text-[13px] text-ink-muted text-center">No movers data available.</p>
      ) : (
        <table className="print-table" data-testid="top-movers-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Company</th>
              <th className="hidden sm:table-cell">Sector</th>
              <th className="num">Price</th>
              <th className="num">Today</th>
            </tr>
          </thead>
          <tbody>
            {topMovers.filter((m) => m.price != null && m.changePercent != null).map((m) => (
              <tr key={m.ticker} className="row-link" data-testid={`top-mover-${m.ticker}`}>
                <td className="shrink font-semibold">
                  <Link href={`/stock/${m.ticker}`} className="text-ink no-underline hover:text-brand-ink">{m.ticker}</Link>
                </td>
                <td className="text-ink-secondary">{m.name}</td>
                <td className="hidden sm:table-cell text-ink-muted">{SECTOR_LABEL_SHORT[m.sector] ?? m.sector}</td>
                <td className="num">${m.price.toFixed(2)}</td>
                <td className={`num font-semibold ${m.changePercent >= 0 ? "text-positive" : "text-negative"}`}>
                  {m.changePercent >= 0 ? "+" : "−"}{Math.abs(m.changePercent).toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {/* Sector averages: color purely semantic - green/red intensity by
          magnitude on the same diverging ramp as The Stack heatmap. */}
      {pulse.length > 0 && (
        <div className="mt-4" data-testid="sector-chips">
          <p className="text-[12px] text-ink-muted mb-1.5">Sector averages today</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-px">
            {[...pulse].sort((a, b) => b.avgChange - a.avgChange).map((p) => (
              <span
                key={p.sector}
                className="flex items-center justify-between gap-1 text-[11.5px] px-1.5 py-1 min-w-0"
                style={{ background: heatColor(p.avgChange) }}
                data-testid={`sector-chip-${p.sector}`}
                title={`${p.label} average ${p.avgChange >= 0 ? "+" : ""}${p.avgChange.toFixed(2)}% today`}
              >
                <span className="truncate" style={{ color: heatTextColor(p.avgChange), opacity: 0.9 }}>{p.label}</span>
                <span className="tnum font-semibold" style={{ color: heatTextColor(p.avgChange) }}>
                  {p.avgChange >= 0 ? "+" : "−"}{Math.abs(p.avgChange).toFixed(2)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
      <Provenance source="Yahoo Finance" extra="top 5 by absolute move across all layers; quotes may be delayed" />
    </RuleSection>
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
      fontSize={11}
      fontFamily={FONT.sans}
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
function BuildoutHistorySection({
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
    <RuleSection
      head="Tracked buildout over time"
      aside={
        tracked && (
          <span className="text-[13px] font-semibold text-ink tnum" data-testid="buildout-headline">
            {fmtGW(tracked.trackedMW)} tracked
          </span>
        )
      }
      testId="buildout-history"
    >
      {isLoading || series.length === 0 ? (
        isLoading ? (
          <div className="flex flex-col justify-center gap-2 min-h-[220px]">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="min-h-[180px] flex items-center justify-center text-[13px] text-ink-muted">
            Facility data unavailable.
          </div>
        )
      ) : (
        <>
          <div className="h-[260px]" data-testid="buildout-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="buildoutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND.primary} stopOpacity={0.22} />
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
                <Area
                  type="stepAfter"
                  dataKey="online"
                  name="online"
                  stroke={BRAND.primary}
                  strokeWidth={2}
                  fill="url(#buildoutGrad)"
                  dot={false}
                  connectNulls
                  label={(props: any) => <EndLabel {...props} data={series} field="online" color={BRAND.secondary} />}
                />
                <Line
                  type="stepAfter"
                  dataKey="pipeline"
                  name="pipeline"
                  stroke={INK.muted}
                  strokeWidth={1.6}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                  label={(props: any) => <EndLabel {...props} data={series} field="pipeline" color={INK.secondary} />}
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
          <Provenance
            source="GridTilt facility registry"
            extra={
              <>
                cumulative rated power by open date; solid = operational, dashed = construction
                pipeline; announced excluded
                {buildout && buildout.undatedCount > 0 ? `; ${buildout.undatedCount} undated sites excluded` : ""}
              </>
            }
          />
        </>
      )}
    </RuleSection>
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
    <RuleSection
      head="Catalyst calendar"
      aside={
        <>
          <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
          <Link href="/catalysts" className="text-ink no-underline hover:text-brand-ink" data-testid="link-all-catalysts">
            All catalysts →
          </Link>
        </>
      }
      className="mt-0"
      testId="catalyst-calendar"
    >
      {isError ? (
        <ErrorState label="Unable to load catalysts" onRetry={() => refetch()} />
      ) : (
      <>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => {
            if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
            else setViewMonth(m => m - 1);
          }}
          className="text-ink-muted hover:text-ink text-[13px] px-2 py-0.5 transition-colors"
          data-testid="calendar-prev"
          aria-label="Previous month"
        >
          &lsaquo;
        </button>
        <span className="text-[13px] font-semibold text-ink">{monthLabel}</span>
        <button
          onClick={() => {
            if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
            else setViewMonth(m => m + 1);
          }}
          className="text-ink-muted hover:text-ink text-[13px] px-2 py-0.5 transition-colors"
          data-testid="calendar-next"
          aria-label="Next month"
        >
          &rsaquo;
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1 border-b border-rule pb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[11px] text-ink-muted py-0.5">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
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
              className={`relative flex flex-col items-center justify-center h-8 text-[12.5px] transition-colors w-full ${
                isSelected ? "bg-brand/15 text-brand-ink font-semibold" :
                isToday ? "bg-paper-shade text-ink font-semibold" :
                "text-ink-secondary hover:bg-paper-shade hover:text-ink"
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
          // are functional, not decorative.
          if (!hasItems) return <span key={day}>{dayButton}</span>;
          return (
            <UITooltip key={day}>
              <TooltipTrigger asChild>{dayButton}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] p-2.5">
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  {new Date(viewYear, viewMonth, day).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {dayItems.length > 1 ? ` · ${dayItems.length} events` : ""}
                </p>
                <div className="space-y-1">
                  {dayItems.slice(0, 6).map((item) => (
                    <div key={item.id} className="flex items-start gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: getItemColor(item) }} />
                      <span className="text-[12px] text-foreground leading-tight">
                        {getItemLabel(item)}
                        <span className="text-muted-foreground ml-1">{getItemCategory(item)}</span>
                      </span>
                    </div>
                  ))}
                  {dayItems.length > 6 && (
                    <p className="text-[11px] text-muted-foreground">+{dayItems.length - 6} more - click the day</p>
                  )}
                </div>
              </TooltipContent>
            </UITooltip>
          );
        })}
      </div>

      {selectedItems.length > 0 && (
        <div className="mt-3 pt-3 border-t border-rule space-y-2">
          {selectedItems.map((item) => {
            const cc = getItemColor(item);
            return (
              <div key={item.id} className="flex items-start gap-2">
                <div className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: cc }} />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink leading-tight">{getItemLabel(item)}</p>
                  <span className="text-[11.5px] text-ink-muted">{getItemCategory(item)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-rule">
        <p className="text-[12px] text-ink-muted mb-2">Next five upcoming</p>
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
                    <span className="text-[12px] text-ink-muted w-12 flex-shrink-0 tnum">
                      {days === 0 ? "Today" : `In ${days}d`}
                    </span>
                    <div className="h-1 w-1 rounded-full flex-shrink-0" style={{ backgroundColor: cc }} />
                    <span className="text-[13px] text-ink truncate flex-1 min-w-0">{getItemLabel(item)}</span>
                  </div>
                );
              })}
        </div>
      </div>
      </>
      )}
    </RuleSection>
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

  const keyMetrics: Array<{
    label: string;
    value: string | null;
    delta?: { text: string; tone?: "positive" | "negative" } | null;
    note: string;
    rows: Array<{ label: string; value: string }>;
    href: string;
    methodology: string;
    updatedAt?: number;
  }> = [
    {
      label: "Tracked AI DC power",
      value: tracked ? fmtGW(tracked.trackedMW) : null,
      delta: tracked ? { text: `${tracked.operationalCount + tracked.constructionCount} facilities` } : null,
      note: "Operational plus under construction, verified facilities",
      methodology: `Sum of rated power across the verified US AI data center dataset (facilities >=400 MW). Operational plus under-construction only. Announced projects (${tracked ? fmtGW(tracked.announcedMW) : "-"}) are excluded from the headline until construction is confirmed. Same dataset as the Power map.`,
      rows: tracked ? [
        { label: "Operational", value: `${fmtGW(tracked.operationalMW)} · ${tracked.operationalCount} sites` },
        { label: "Construction", value: `${fmtGW(tracked.constructionMW)} · ${tracked.constructionCount} sites` },
        { label: "Announced (excluded)", value: `${fmtGW(tracked.announcedMW)} · ${tracked.announcedCount} sites` },
      ] : [],
      href: "/power-map",
      updatedAt: dcUpdatedAt,
    },
    {
      label: "Cost of AI compute",
      value: gpuData ? `$${gpuData.fleetAvg.toFixed(2)}/hr` : null,
      delta: gpuData?.fleetAvg1yChange != null
        ? { text: `${gpuData.fleetAvg1yChange > 0 ? "+" : ""}${gpuData.fleetAvg1yChange.toFixed(1)}% 1y`, tone: gpuData.fleetAvg1yChange > 0 ? "negative" : "positive" }
        : null,
      note: `Fleet-average GPU rental across ${gpuData?.modelCount ?? "-"} models`,
      methodology: "Mean on-demand rental price across the tracked GPU fleet, blended from public neocloud and marketplace listings (sourced estimates, flagged per model on the GPU Prices page). Falling prices mean compute supply is catching demand.",
      rows: gpuData ? gpuTopRows : [],
      href: "/neocloud-intel",
      updatedAt: gpuUpdatedAt,
    },
    {
      label: "Grid headroom",
      value: headroom ? `${headroom.reserveMarginPct.toFixed(1)}%` : null,
      delta: headroom ? { text: `${headroom.label} · tightest RTO`, tone: "negative" } : null,
      note: "Lowest reserve margin among AI-load RTOs",
      methodology: `Projected reserve margins from ${RTO_SOURCE_NOTE}. The headline shows the tightest region. NERC's reference margin level is roughly 15%; regions below it face constrained interconnection for large new loads.`,
      rows: headroomRows,
      href: "/power-map",
    },
  ];

  return (
    <PageShell>
      <PageTitle
        title="Today"
        right={
          tracked && (
            <span className="flex items-baseline gap-2" data-testid="header-tracked">
              <span className="text-[12.5px] text-ink-secondary">Tracked AI power</span>
              <span className="text-[15px] font-semibold text-ink tnum">{fmtGW(tracked.trackedMW)}</span>
              <span className="text-[12.5px] text-ink-muted tnum">+{fmtGW(tracked.constructionMW)} building</span>
            </span>
          )
        }
        testId="today-title"
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-x-10 gap-y-8">
        <div className="lg:col-span-3">
          <MarketsSection
            topMovers={topMovers ?? []}
            pulse={sectorPulse ?? []}
            isLoading={topMoversLoading}
            isError={topMoversError}
            updatedAt={topMoversUpdatedAt}
            onRetry={() => refetchTopMovers()}
          />
        </div>
        <div className="lg:col-span-2">
          <CatalystCalendarSection />
        </div>
      </div>

      <BuildoutHistorySection buildout={buildout} tracked={tracked} isLoading={dcLoading} />

      {/* Key measured metrics: direct measurements over sourced data. The
          synthetic sentiment indices these replaced are archived in
          docs/INDEX_VALIDATION.md. */}
      <RuleSection head="Key measures" testId="kpi-triad">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-6">
          {keyMetrics.map((m) => (
            <div key={m.label} data-testid={`gauge-${m.label.toLowerCase().replace(/\s+/g, "-")}`}>
              {m.value === null ? (
                <Skeleton className="h-9 w-32 mb-1" />
              ) : (
                <PullStat
                  label={m.label}
                  value={m.value}
                  delta={
                    m.delta ? (
                      <span className={`text-[13px] font-semibold tnum ${
                        m.delta.tone === "positive" ? "text-positive" : m.delta.tone === "negative" ? "text-negative" : "text-ink-muted"
                      }`}>
                        {m.delta.text}
                      </span>
                    ) : undefined
                  }
                  note={m.note}
                />
              )}
              {m.rows.length > 0 && (
                <div className="mt-2.5 border-t border-rule pt-2 space-y-1">
                  {m.rows.map((r) => (
                    <div key={r.label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                      <span className="text-ink-muted">{r.label}</span>
                      <span className="text-ink tnum text-right">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 flex items-baseline justify-between gap-3">
                <Link href={m.href} className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink">
                  Full data →
                </Link>
                {m.updatedAt !== undefined && <AsOf updatedAt={m.updatedAt} intervalMs={900000} />}
              </p>
              <details className="mt-1.5">
                <summary className="cursor-pointer list-none text-[12px] text-ink-muted hover:text-ink-secondary">
                  Methodology
                </summary>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-muted max-w-[48ch]">{m.methodology}</p>
              </details>
            </div>
          ))}
        </div>
      </RuleSection>

      {/* Main demand chart */}
      <RuleSection
        head="US electricity demand"
        aside={
          <span className="hidden sm:flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4" style={{ background: SERIES[0] }} />
              Total actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4" style={{ background: BRAND.secondary }} />
              GridTilt projection
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4" style={{ background: TOKEN_CATEGORY_COLORS.datacenters }} />
              Data centers
            </span>
          </span>
        }
        testId="demand-chart"
      >
        <p className="mb-4 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-secondary">
          US electricity demand was flat for a decade. AI data centers are now driving load growth
          utilities did not plan for. Dashed lines are GridTilt projections through 2030, not
          forecasts; the data center subset reads on the right axis.
        </p>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={electricityData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <defs>
              <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={SERIES[0]} stopOpacity={0.18} />
                <stop offset="95%" stopColor={SERIES[0]} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BRAND.secondary} stopOpacity={0.12} />
                <stop offset="95%" stopColor={BRAND.secondary} stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="dcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={TOKEN_CATEGORY_COLORS.datacenters} stopOpacity={0.18} />
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
              stroke={alpha(SEMANTIC.negativeDeep, 0.4)}
              strokeDasharray="5 3"
              label={{ value: "Grid capacity ~5,100 TWh", position: "right", fill: SEMANTIC.negativeDeep, fontSize: 10, dx: -100 }}
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
        <Provenance
          source="EIA (actuals through 2025); GridTilt projections 2026-2030"
          extra="marked years: 2020 COVID drop; 2022 IRA signed and ChatGPT launch; 2024 TMI restart and first commercial SMR contract"
        />
      </RuleSection>

      {/* Sector demand breakdown */}
      <RuleSection head="2025 US electricity demand by sector" testId="sector-demand">
        <div>
          {SECTOR_DEMAND.map((s) => (
            <div key={s.sector} className="flex items-center gap-4 py-2.5 border-b border-rule last:border-b-0">
              <div className="w-28 flex-shrink-0">
                <p className="text-[13px] font-medium text-ink">{s.sector}</p>
              </div>
              <div className="flex-1">
                <div className="bg-paper-shade h-2">
                  <div
                    className="h-2"
                    style={{
                      width: `${(s.twh / 4490) * 100}%`,
                      backgroundColor: s.color,
                    }}
                  />
                </div>
              </div>
              <p className="text-[13px] text-ink w-20 text-right tnum">{s.twh.toLocaleString()} TWh</p>
              <p className={`w-20 text-right text-[13px] font-semibold tnum ${s.yoy >= 0 ? "text-positive" : "text-negative"}`}>
                {s.yoy >= 0 ? "+" : "−"}{Math.abs(s.yoy)}% y/y
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-ink-secondary">
          US electricity demand was flat from 2010 to 2022. By 2025 it reached about 4,490 TWh, up
          15% from the 2022 low, and data center load is growing 33% year over year.
        </p>
        <Provenance source="EIA Electric Power Monthly (2025)" />
      </RuleSection>
    </PageShell>
  );
}
