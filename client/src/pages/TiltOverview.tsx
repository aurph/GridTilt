import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
import { Zap, TrendingUp, Activity, AlertTriangle, Info, ArrowUp, ArrowDown, Calendar, ChevronRight, ExternalLink, Cpu, BarChart3, Calculator, Layers, Map, Link2, CalendarDays } from "lucide-react";
import { EmailCapture, ScrollTriggeredBanner } from "@/components/EmailCapture";

import stackPreview from "@assets/previews/stack.svg";
import supplyChainPreview from "@assets/previews/supply-chain.svg";
import powerMapPreview from "@assets/previews/power-map.svg";
import catalystPreview from "@assets/previews/catalyst.svg";
import portfolioPreview from "@assets/previews/portfolio.svg";
import calculatorPreview from "@assets/previews/calculator.svg";

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

// Shape of GET /api/metrics: the buildout scoreboard that replaced the
// retired market-sentiment gauges on 2026-06-10. Real units, sourced.
interface MetricsData {
  nuclear: {
    signedGW: number; announcedGW: number; aggregateGW: number;
    signedDeals: number; totalDeals: number;
    uraniumSpot: { usdPerLb: number; asOf: string; source: string };
    source: string; asOf: string;
  };
  pipeline: {
    operationalGW: number; constructionGW: number; announcedGW: number;
    siteCount: number;
    capex?: { totalUsdBillions: number; asOf?: string };
    source: string;
  };
  backlog: {
    queueOverallGW: number; queueOverallProjects: number; medianWaitMonths: number;
    historicalWithdrawalPct: number; ercotLargeLoadGW: number;
    ercotLargeLoadDataCenterPct: number; pjmReopenedGW: number;
    asOf: string; sourceUrl: string;
  };
  gridPulse: { currentGW?: number; atUtc?: string; outputYoYPct?: number; outputMonth?: string } | null;
  market: { allPct: number; allCount: number; allTotal: number; nuclearPct: number | null; nuclearCount: number } | null;
  asOf: string;
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

const CATEGORY_COLORS: Record<string, string> = {
  Earnings:       "#F0A500",
  Regulatory:     "#F0A500",
  Policy:         "#D4A843",
  Market:         "#F07800",
  Infrastructure: "#C87533",
  Industry:       "#F07800",
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
  { sector: "Residential", twh: 1658, yoy: 2.1, color: "#6b7280" },
  { sector: "Commercial", twh: 1569, yoy: 2.4, color: "#8b5cf6" },
  { sector: "Industrial", twh: 975, yoy: -3.2, color: "#94a3b8" },
  { sector: "Data Centers", twh: 288, yoy: 33.3, color: "#a855f7" },
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

const SECTOR_COLORS: Record<string, string> = {
  compute: "#94a3b8",
  nuclear: "#F0A500",
  uranium: "#fb923c",
  powerHardware: "#F0A500",
  utilities: "#34d399",
  dataCenters: "#a855f7",
  construction: "#f472b6",
  etfsBenchmarks: "#6b7280",
};

const SECTOR_LABEL_SHORT: Record<string, string> = {
  compute: "Compute",
  nuclear: "Nuclear",
  uranium: "Uranium",
  powerHardware: "Power HW",
  utilities: "Utilities",
  dataCenters: "Data Ctrs",
  construction: "Construct",
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

function TopMoversSection({ topMovers, pulse, isLoading, isError }: { topMovers: TopMover[]; pulse: SectorPulseItem[]; isLoading: boolean; isError?: boolean }) {
  return (
    <Card className="p-5 border-card-border">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-3.5 w-3.5 text-[#F0A500]" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Top Movers Today</h2>
        <UITooltip>
          <TooltipTrigger>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Top 5 stocks by absolute % change across all 13 stack layers. Refreshes every 10 min.</p>
          </TooltipContent>
        </UITooltip>
      </div>
      <div className="space-y-2">
        {isError ? <ErrorCard label="Unable to load movers" /> : isLoading
          ? Array(5).fill(null).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3 w-32 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))
          : topMovers.length === 0 ? <ErrorCard label="No movers data available" /> : topMovers.filter((m) => m.price != null && m.changePercent != null).map((m) => {
              const isUp = m.changePercent >= 0;
              const sc = SECTOR_COLORS[m.sector] ?? "#6b7280";
              return (
                <div key={m.ticker} className="flex items-center gap-3 py-1.5 border-b border-border/30 last:border-0" data-testid={`top-mover-${m.ticker}`}>
                  <span className="font-mono font-bold text-xs text-foreground w-12 flex-shrink-0">{m.ticker}</span>
                  <span className="text-xs text-muted-foreground flex-1 truncate min-w-0">{m.name}</span>
                  <span
                    className="hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0"
                    style={{ color: sc, backgroundColor: `${sc}15`, borderColor: `${sc}30` }}
                  >
                    {SECTOR_LABEL_SHORT[m.sector] ?? m.sector}
                  </span>
                  <span className="font-mono text-xs text-foreground flex-shrink-0 w-16 text-right">${m.price.toFixed(m.price < 10 ? 2 : m.price < 100 ? 2 : 2)}</span>
                  <div className={`flex items-center gap-0.5 font-mono font-semibold text-xs flex-shrink-0 w-14 justify-end ${isUp ? "text-green-400" : "text-red-400"}`}>
                    {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(m.changePercent).toFixed(2)}%
                  </div>
                </div>
              );
            })}
      </div>
      {/* Sector averages, absorbed from the old Sector Pulse card: same
          "what moved today" fact, one card instead of two. */}
      {pulse.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center gap-1.5" data-testid="sector-chips">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mr-0.5">sectors</span>
          {[...pulse].sort((a, b) => b.avgChange - a.avgChange).map((p) => {
            const isUp = p.avgChange >= 0;
            const sc = SECTOR_COLORS[p.sector] ?? "#6b7280";
            return (
              <span
                key={p.sector}
                className="font-mono text-[10px] px-1.5 py-0.5 rounded border"
                style={{ borderColor: `${sc}30`, backgroundColor: `${sc}0d` }}
                data-testid={`sector-chip-${p.sector}`}
              >
                <span className="text-muted-foreground">{p.label}</span>{" "}
                <span className={isUp ? "text-green-400" : "text-red-400"}>
                  {isUp ? "+" : ""}{p.avgChange.toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      )}
    </Card>
  );
}

interface MetricsHistoryDay {
  date: string;
  signedGW: number;
  announcedGW: number;
  constructionGW: number;
  operationalGW: number;
  queueOverallGW: number;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function gaugeTickLabel(date: string): string {
  const [y, m] = date.split("-");
  return `${MONTH_ABBR[Number(m) - 1]} '${y.slice(2)}`;
}

// Replaced the retired gauge-history chart on 2026-06-10: plots the daily
// buildout-scoreboard series the server records. No backfill, no synthetic
// seed; depth builds one real snapshot per day.
function BuildoutHistoryCard() {
  const { data, isLoading } = useQuery<{ days: MetricsHistoryDay[] }>({
    queryKey: ["/api/metrics/history"],
    refetchInterval: 30 * 60_000,
  });
  const series = (data?.days ?? []).map((d) => ({
    date: d.date,
    signed: d.signedGW,
    construction: d.constructionGW,
    queue: d.queueOverallGW,
  }));

  return (
    // flex-1: fills the left column so it ends flush with the right column.
    <Card className="p-5 border-card-border flex-1 flex flex-col" data-testid="buildout-history">
      <div className="flex items-center gap-2 mb-1">
        <Activity className="h-3.5 w-3.5 text-[#F0A500]" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Buildout History</h2>
        <UITooltip>
          <TooltipTrigger>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">
              Daily snapshots of the scoreboard: signed nuclear GW and DC construction GW on the left axis,
              total interconnection-queue GW on the right. Recording started 2026-06-10 when the
              market-sentiment gauges were retired, so depth builds one day at a time. Raw series at
              /api/metrics/history; the retired gauge series stays archived at /api/index-history.
            </p>
          </TooltipContent>
        </UITooltip>
      </div>
      <p className="text-[10px] font-mono text-muted-foreground/60 mb-3">
        signed nuclear + dc construction (left, GW) · queue total (right, GW)
      </p>

      {isLoading ? (
        <div className="flex-1 flex flex-col justify-center gap-2 min-h-[180px]">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : series.length < 2 ? (
        <div className="flex-1 flex items-center justify-center min-h-[180px]" data-testid="buildout-history-empty">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            History starts now: one snapshot per day, no backfill, nothing synthetic.
            <br />
            {series.length === 1
              ? `First snapshot recorded ${series[0].date}.`
              : "The first snapshot lands with the next scoreboard refresh."}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-[180px]" data-testid="buildout-history-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickFormatter={gaugeTickLabel}
                minTickGap={48}
              />
              <YAxis yAxisId="gw" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
              <YAxis yAxisId="queue" orientation="right" tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                contentStyle={{
                  background: "#131211",
                  border: "1px solid rgba(255,255,255,0.14)",
                  fontSize: 12,
                  padding: "8px 10px",
                }}
                labelStyle={{ color: "#F2F1ED", fontWeight: 600, marginBottom: 4, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}
                itemStyle={{ color: "#F2F1ED", padding: 0 }}
                formatter={(value, name) => (value == null ? ["n/a", name] : [`${Number(value).toLocaleString()} GW`, name])}
              />
              <Line yAxisId="gw" type="stepAfter" dataKey="signed" name="Signed nuclear" stroke="#F07800" strokeWidth={1.8} dot={false} isAnimationActive={false} />
              <Line yAxisId="gw" type="stepAfter" dataKey="construction" name="DC construction" stroke="#F0A500" strokeWidth={1.4} dot={false} isAnimationActive={false} />
              <Line yAxisId="queue" type="stepAfter" dataKey="queue" name="Queue total" stroke="#6b7280" strokeWidth={1.2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function CatalystCalendarSection() {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data } = useQuery<AllCatalystsResponse>({
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
    if (item.type === 'earnings') return item.stageColor || "#F0A500";
    return CATEGORY_COLORS[item.category || ''] ?? "#6b7280";
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
          <Calendar className="h-3.5 w-3.5 text-[#F0A500]" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Catalyst Tracker</h2>
        </div>
        <Link
          href="/catalysts"
          className="flex items-center gap-1 text-xs text-[#F07800] hover:text-[#F0A500] transition-colors font-medium"
          data-testid="link-all-catalysts"
        >
          All Catalysts <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

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
          <div key={d} className="text-center text-[10px] text-muted-foreground/60 py-0.5">{d}</div>
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

          return (
            <button
              key={day}
              onClick={() => setSelectedDay(isSelected ? null : dateKey)}
              className={`relative flex flex-col items-center justify-center h-8 rounded text-xs transition-colors ${
                isSelected ? "bg-[#F07800]/20 text-[#F0A500]" :
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
                  <span className="text-[10px]" style={{ color: cc }}>{getItemCategory(item)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-2">Next 5 Upcoming</p>
        <div className="space-y-2">
          {upcoming.map((item) => {
            const days = daysUntil(item.sortDate);
            const cc = getItemColor(item);
            return (
              <div key={item.id} className="flex items-center gap-2" data-testid={`upcoming-catalyst-${item.id}`}>
                <span className="text-[10px] font-mono text-muted-foreground w-8 flex-shrink-0">
                  {days === 0 ? "TODAY" : `${days}d`}
                </span>
                <div className="h-1 w-1 rounded-full flex-shrink-0" style={{ backgroundColor: cc }} />
                <span className="text-xs text-foreground truncate flex-1 min-w-0">{getItemLabel(item)}</span>
              </div>
            );
          })}
        </div>
      </div>
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
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current text-[#F0A500]">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">@gridtilt</h2>
        </div>
        <a
          href="https://x.com/gridtilt"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-[#F07800] hover:text-[#F0A500] transition-colors font-medium"
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

const MERGED_CATEGORY_COLORS: Record<string, string> = {
  Earnings:       "#F0A500",
  Regulatory:     "#F0A500",
  Policy:         "#D4A843",
  Infrastructure: "#C87533",
  Market:         "#F07800",
  Industry:       "#F07800",
};

function NextCatalystsWidget() {
  const { data } = useQuery<AllCatalystsResponse>({
    queryKey: ["/api/catalysts/all"],
    refetchInterval: 900000,
  });

  const upcoming = (data?.items || [])
    .filter((c) => daysUntil(c.sortDate) >= 0)
    .slice(0, 5);

  if (upcoming.length === 0) return null;

  return (
    <Card className="p-5 border-card-border" data-testid="next-catalysts-widget">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 text-[#F0A500]" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Next 5 Catalysts
          </h2>
        </div>
        <Link
          href="/catalysts"
          className="flex items-center gap-1 text-xs text-[#F07800] hover:text-[#F0A500] transition-colors font-medium"
          data-testid="link-view-all-catalysts"
        >
          View All <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-3">
        {upcoming.map((item) => {
          const days = daysUntil(item.sortDate);
          const isEarnings = item.type === "earnings";
          const label = isEarnings ? `${item.ticker} Earnings` : (item.title || "");
          const catLabel = isEarnings ? item.stage || "Earnings" : item.category || "Event";
          const catColor = isEarnings
            ? (item.stageColor || "#F0A500")
            : (MERGED_CATEGORY_COLORS[item.category || ""] ?? "#9ca3af");

          return (
            <div key={item.id} className="flex items-start gap-3" data-testid={`catalyst-preview-${item.id}`}>
              <div className="text-center flex-shrink-0 w-12">
                <p className="text-lg font-bold font-mono text-foreground leading-none">{days === 0 ? "0" : days}</p>
                <p className="text-[10px] text-muted-foreground">{days === 0 ? "TODAY" : "days"}</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="text-xs font-medium text-foreground truncate">{label}</p>
                  {isEarnings && item.time && (
                    <span className="text-[10px] text-muted-foreground/50 font-mono">{item.time}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                    style={{
                      color: catColor,
                      backgroundColor: `${catColor}15`,
                      borderColor: `${catColor}30`,
                    }}
                  >
                    {catLabel}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">{formatDateShort(item.sortDate)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
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
    accent: "#F07800",
    preview: stackPreview,
  },
  {
    icon: Link2,
    title: "Supply Chain Tracker",
    description: "Interactive D3 force network mapping 21 nodes and 44 real supply relationships from raw materials to end-use compute.",
    href: "/supply-chain",
    accent: "#F0A500",
    preview: supplyChainPreview,
  },
  {
    icon: Map,
    title: "Power Map",
    description: "US data center locations, power capacity, and utility interconnection points. See where the load is landing.",
    href: "/power-map",
    accent: "#C87533",
    preview: powerMapPreview,
  },
  {
    icon: CalendarDays,
    title: "Catalyst Tracker",
    description: "Live earnings calendar with 80+ tickers from Yahoo Finance, plus thesis catalysts. Never miss a market-moving event.",
    href: "/catalysts",
    accent: "#D4A843",
    preview: catalystPreview,
  },
  {
    icon: BarChart3,
    title: "Portfolio Overlay",
    description: "Score any portfolio for AI power exposure. See how your holdings map to the infrastructure buildout.",
    href: "/portfolio",
    accent: "#F07800",
    preview: portfolioPreview,
  },
  {
    icon: Calculator,
    title: "Scenario Calculator",
    description: "Model scenarios across demand growth, nuclear capacity, and grid stress variables.",
    href: "/trade",
    accent: "#F0A500",
    preview: calculatorPreview,
  },
];

function ModuleGrid() {
  return (
    <div data-testid="module-grid">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Modules</h2>
        <span className="text-[11px] text-muted-foreground/70">{FEATURE_SLIDES.length} tools</span>
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
  const {
    data: metricsData,
    isLoading,
    isError: metricsError,
    dataUpdatedAt,
  } = useQuery<MetricsData>({
    queryKey: ["/api/metrics"],
    refetchInterval: 900000,
  });

  const { data: topMovers, isLoading: topMoversLoading, isError: topMoversError } = useQuery<TopMover[]>({
    queryKey: ["/api/top-movers"],
    refetchInterval: 900000,
  });

  const { data: sectorPulse } = useQuery<SectorPulseItem[]>({
    queryKey: ["/api/sector-pulse"],
    refetchInterval: 900000,
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-1.5">
              Grid information, <span className="italic text-[#F07800]">tilted</span> in your favor
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
              Live equities, infrastructure, and power data across 100 tickers tracking the AI power economy.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-1.5 w-1.5 rounded-full bg-[#F0A500]" />
            <span className="font-mono text-[11px] tracking-wide" data-testid="last-updated">Updated {relativeTime(dataUpdatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-4 sm:space-y-5">

        {/* The buildout scoreboard. Real units from curated, sourced
            datasets; replaced the retired market-sentiment gauges on
            2026-06-10. The autopsy is public: docs/INDEX_VALIDATION.md. */}
        <div data-testid="scoreboard">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
              the buildout scoreboard · real units, sourced
            </div>
            {metricsError && (
              <span className="text-[10px] font-mono text-red-400" data-testid="scoreboard-error">
                scoreboard unavailable; retrying
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              {
                label: "Nuclear-for-AI, signed",
                value: metricsData ? `${metricsData.nuclear.signedGW}` : null,
                unit: "GW",
                color: "#F07800",
                sub: metricsData
                  ? `${metricsData.nuclear.signedDeals} executed deals · ${metricsData.nuclear.announcedGW} GW more announced`
                  : "",
                info: "Executed nuclear PPAs and restarts underway, summed from GridTilt's curated deal registry. Signed means contracts: options, proposals, and aggregate LOI pipelines are tracked separately and never inflate this number. Project list and sources on the Backlog page.",
              },
              {
                label: "DC under construction",
                value: metricsData ? `${metricsData.pipeline.constructionGW}` : null,
                unit: "GW",
                color: "#F0A500",
                sub: metricsData
                  ? `${metricsData.pipeline.operationalGW} GW operational · ${metricsData.pipeline.siteCount} tracked sites`
                  : "",
                info: "Tracked US datacenter sites at 400 MW or more, summed by build status from public announcements. A curated registry, not a census. FY2025 hyperscaler capex rides alongside: disclosed guides total $340B.",
              },
              {
                label: "Interconnection queue",
                value: metricsData ? metricsData.backlog.queueOverallGW.toLocaleString() : null,
                unit: "GW",
                color: "#ef4444",
                sub: metricsData
                  ? `median wait ${metricsData.backlog.medianWaitMonths} mo · ${metricsData.backlog.historicalWithdrawalPct}% historically withdraw`
                  : "",
                info: "Lawrence Berkeley National Lab's Queued Up dataset (emp.lbl.gov/queues) covering nearly the entire US generating queue, plus ISO filings for the large-load lines. As-of dates ship with the data on the Backlog page.",
              },
              {
                label: "Grid pulse",
                value:
                  metricsData?.gridPulse?.currentGW != null
                    ? `${metricsData.gridPulse.currentGW}`
                    : metricsData?.gridPulse?.outputYoYPct != null
                      ? `${metricsData.gridPulse.outputYoYPct > 0 ? "+" : ""}${metricsData.gridPulse.outputYoYPct}`
                      : null,
                unit: metricsData?.gridPulse?.currentGW != null ? "GW now" : "% YoY",
                color: "#34d399",
                sub:
                  metricsData?.gridPulse?.currentGW != null
                    ? "US48 demand right now (EIA hourly)"
                    : metricsData?.gridPulse?.outputYoYPct != null
                      ? `US electric output, ${metricsData.gridPulse.outputMonth} (FRED)`
                      : "",
                info: "The physical side, measured: live lower-48 demand from EIA's Hourly Electric Grid Monitor when a key is configured, with year-over-year US electric output from FRED (IPG2211A2N) alongside. Measurements, not market sentiment.",
              },
            ].map((c) => (
              <Card key={c.label} className="p-4 border-card-border" data-testid={`scoreboard-${c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</p>
                  <UITooltip>
                    <TooltipTrigger>
                      <Info className="h-3 w-3 text-muted-foreground/60" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs leading-relaxed">{c.info}</p>
                    </TooltipContent>
                  </UITooltip>
                </div>
                {c.value == null ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl font-bold tabular-nums font-mono" style={{ color: c.color }}>
                    {c.value} <span className="text-sm font-semibold text-muted-foreground">{c.unit}</span>
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1 leading-snug min-h-[1rem]">{c.sub}</p>
              </Card>
            ))}
          </div>
          {metricsData?.market && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-muted-foreground" data-testid="market-line">
              <span className="uppercase tracking-wider text-muted-foreground/60">market</span>
              <span>
                ai infra, equal weight across {metricsData.market.allCount} names:{" "}
                <span className={metricsData.market.allPct >= 0 ? "text-green-400" : "text-red-400"}>
                  {metricsData.market.allPct >= 0 ? "+" : ""}
                  {metricsData.market.allPct.toFixed(2)}% today
                </span>
              </span>
              {metricsData.market.nuclearPct != null && (
                <span>
                  nuclear names:{" "}
                  <span className={metricsData.market.nuclearPct >= 0 ? "text-green-400" : "text-red-400"}>
                    {metricsData.market.nuclearPct >= 0 ? "+" : ""}
                    {metricsData.market.nuclearPct.toFixed(2)}%
                  </span>
                </span>
              )}
              <span className="text-muted-foreground/50">percent moves only · the composite indices are retired</span>
            </div>
          )}
        </div>

        {/* Dashboard density - 2-col */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 flex flex-col gap-4">
            <TopMoversSection
              topMovers={topMovers ?? []}
              pulse={sectorPulse ?? []}
              isLoading={topMoversLoading}
              isError={topMoversError}
            />
            <BuildoutHistoryCard />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <CatalystCalendarSection />
            <NextCatalystsWidget />
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
                <div className="h-2 w-4 rounded-sm bg-[#1E90FF]" />
                <span className="text-muted-foreground">Total Actual</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-4 rounded-sm bg-[#F0A500]" />
                <span className="text-muted-foreground">GridTilt Projection (2026-2030)</span>
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
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                interval={2}
              />
              <YAxis
                yAxisId="total"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
                domain={[3600, 6600]}
                width={42}
              />
              <YAxis
                yAxisId="dc"
                orientation="right"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickLine={false}
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

        {/* Context stat strip. The nuclear figure reads live from the same
            registry the scoreboard uses, so the two can never disagree. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "DC Share of US Demand", value: "~6.4%", sub: "EIA 2025: ~288 TWh, up from 4.4% in 2023. DOE projects 12%+ by 2028.", color: "#a855f7" },
            {
              label: "Nuclear-for-AI Committed",
              value: metricsData ? `${(metricsData.nuclear.signedGW + metricsData.nuclear.announcedGW).toFixed(1)} GW` : "…",
              sub: metricsData
                ? `${metricsData.nuclear.signedDeals} signed deals (${metricsData.nuclear.signedGW} GW) plus announced and optioned projects. LOI pipelines excluded.`
                : "Tracked deal registry.",
              color: "#F0A500",
            },
            { label: "Grid Reserve Margins", value: "Tightening", sub: "MISO 13.4%, ERCOT 15.8% per NERC 2026. Capacity warnings through 2028.", color: "#94a3b8" },
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
                <div className={`flex items-center gap-1 w-16 justify-end text-xs font-mono font-semibold ${s.yoy >= 0 ? "text-green-400" : "text-red-400"}`}>
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

        <footer className="pt-4 border-t border-border/40 text-[11px] text-muted-foreground/60 leading-relaxed space-y-1">
          <p>
            Data: Yahoo Finance · EIA · FRED · DOE · NERC · LBNL · public RSS sources. Scoreboard numbers come from curated, sourced datasets; each card's tooltip names its source. The retired composite indices are archived at /api/index-history with the validation study in the repo.
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
