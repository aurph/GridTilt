import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  ChevronLeft, ChevronRight, Clock,
  TrendingUp, ArrowRight, Eye, EyeOff, AlertTriangle, RotateCw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf } from "@/components/Freshness";
import { PageHeader, HeaderStat } from "@/components/PageHeader";
import {
  catalystCategoryColors,
  STAGE_COLORS,
  SUPPLY_CHAIN_STAGE_MAP,
  type CatalystCategory,
} from "@/data/catalyst-config";
import { BRAND, INK, SURFACE, BORDER } from "@/lib/tokens";

interface EarningsItem {
  id: string;
  type: "earnings";
  date: string;
  sortDate: string;
  ticker: string;
  company: string;
  time: string;
  quarter: string;
  stage: string;
  stageColor: string;
}

interface CatalystItem {
  id: string;
  type: "catalyst";
  date: string;
  sortDate: string;
  category: CatalystCategory;
  title: string;
  description: string;
  dateLabel: string;
  affectedTickers: string[];
  affectedSectors: string[];
}

type MergedItem = EarningsItem | CatalystItem;

interface AllCatalystsResponse {
  items: MergedItem[];
}

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

function formatDateFull(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Stage color from the CLIENT token palette, by stage name first, ticker map
 * second. The server payload still carries a legacy stageColor hex (the old
 * all-orange family) - it is deliberately ignored so the token palette is
 * the single source of truth.
 */
function stageColorOf(e: { stage?: string; ticker: string }): string {
  if (e.stage && STAGE_COLORS[e.stage]) return STAGE_COLORS[e.stage];
  const stage = SUPPLY_CHAIN_STAGE_MAP[e.ticker];
  return stage ? (STAGE_COLORS[stage] || INK.muted) : INK.muted;
}

function CalendarGrid({
  items,
  currentMonth,
  onMonthChange,
  selectedDate,
  onDateSelect,
}: {
  items: MergedItem[];
  currentMonth: Date;
  onMonthChange: (d: Date) => void;
  selectedDate: string | null;
  onDateSelect: (d: string | null) => void;
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  const monthName = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const itemsByDate = useMemo(() => {
    const m: Record<string, MergedItem[]> = {};
    items.forEach((item) => {
      const d = item.date || item.sortDate;
      if (!m[d]) m[d] = [];
      m[d].push(item);
    });
    return m;
  }, [items]);

  const cells: (number | null)[] = [];
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => onMonthChange(new Date(year, month - 1, 1));
  const nextMonth = () => onMonthChange(new Date(year, month + 1, 1));

  const selectedItems = selectedDate ? itemsByDate[selectedDate] || [] : [];

  return (
    <div data-testid="catalyst-calendar">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 hover:text-white text-ink-muted transition-colors" data-testid="calendar-prev">
          <ChevronLeft style={{ width: 18, height: 18 }} />
        </button>
        <span className="text-15 font-bold text-white">{monthName}</span>
        <button onClick={nextMonth} className="p-2 hover:text-white text-ink-muted transition-colors" data-testid="calendar-next">
          <ChevronRight style={{ width: 18, height: 18 }} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px" style={{ background: BORDER.subtle }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-11 font-medium py-2" style={{ color: INK.faint, background: SURFACE.raised }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} style={{ background: SURFACE.raised, minHeight: 56 }} />;
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayItems = itemsByDate[dateStr] || [];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const isWeekend = (startOffset + day - 1) % 7 >= 5;

          return (
            <div
              key={dateStr}
              className="cursor-pointer transition-all"
              style={{
                background: SURFACE.raised,
                minHeight: 56,
                padding: "4px 6px",
                borderLeft: isToday ? `2px solid ${BRAND.primary}` : isSelected ? `2px solid ${BORDER.strong}` : "2px solid transparent",
                opacity: isWeekend && dayItems.length === 0 ? 0.6 : 1,
              }}
              onClick={() => onDateSelect(isSelected ? null : dateStr)}
              data-testid={`calendar-day-${dateStr}`}
            >
              <div className="text-13 font-medium mb-1" style={{ color: isToday ? BRAND.primary : INK.secondary }}>
                {day}
              </div>
              <div className="flex items-center gap-1">
                {dayItems.slice(0, 3).map((_, j) => (
                  <div
                    key={j}
                    className="rounded-full"
                    style={{ width: 6, height: 6, background: BRAND.primary }}
                  />
                ))}
              </div>
              {dayItems.length > 0 && (
                <div className="text-9 mt-1 truncate" style={{ color: INK.faint }}>
                  {dayItems.length === 1
                    ? (dayItems[0].type === "earnings" ? (dayItems[0] as EarningsItem).ticker : "Event")
                    : `${dayItems.length} events`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedItems.length > 0 && (
        <div className="mt-3 space-y-2" data-testid="calendar-day-detail">
          <div className="text-sm font-semibold text-white mb-2">
            {formatDateFull(selectedDate!)}
          </div>
          {selectedItems.map((item) => (
            <DayDetailCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayDetailCard({ item }: { item: MergedItem }) {
  const [, navigate] = useLocation();

  if (item.type === "earnings") {
    const e = item as EarningsItem;
    return (
      <div
        className="rounded-lg p-4"
        style={{ background: SURFACE.raised, border: `1px solid ${stageColorOf(e)}25` }}
        data-testid={`detail-${e.ticker}`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-15 font-bold text-white">{e.ticker}</span>
            <span className="text-13" style={{ color: INK.muted }}>{e.company}</span>
          </div>
          <span
            className="text-11 font-medium px-2 py-0.5 rounded"
            style={{ background: SURFACE.overlay, color: INK.muted }}
          >
            {e.time}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: INK.muted }}>
          <span
            className="px-1.5 py-0.5 rounded text-10 font-medium"
            style={{ background: `${stageColorOf(e)}18`, color: stageColorOf(e) }}
          >
            {e.stage}
          </span>
          {e.quarter && <span>{e.quarter}</span>}
        </div>
        <button
          className="flex items-center gap-1 mt-2 text-xs transition-colors"
          style={{ color: stageColorOf(e) }}
          onClick={() => navigate(`/stock/${e.ticker}`)}
          data-testid={`view-${e.ticker}`}
        >
          View {e.ticker} <ArrowRight style={{ width: 12, height: 12 }} />
        </button>
      </div>
    );
  }

  const c = item as CatalystItem;
  const catColor = catalystCategoryColors[c.category] || INK.muted;
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: SURFACE.raised, borderLeft: `3px solid ${catColor}` }}
      data-testid={`detail-${c.id}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-10 font-semibold px-2 py-0.5 rounded"
          style={{ background: `${catColor}18`, color: catColor }}
        >
          {c.category}
        </span>
        <span className="text-xs" style={{ color: INK.muted }}>{c.dateLabel}</span>
      </div>
      <div className="text-sm font-semibold text-white mb-1">{c.title}</div>
      <p className="text-xs leading-relaxed" style={{ color: INK.muted }}>{c.description}</p>
    </div>
  );
}

function UpcomingTimeline({ items }: { items: MergedItem[] }) {
  const [showPast, setShowPast] = useState(false);
  const [, navigate] = useLocation();

  const upcoming = items.filter((i) => daysUntil(i.sortDate) >= 0).slice(0, 20);
  const past = items.filter((i) => daysUntil(i.sortDate) < 0).slice(-10).reverse();

  return (
    <div data-testid="upcoming-timeline">
      <div className="flex items-center gap-2 mb-4">
        <Clock style={{ width: 14, height: 14, color: BRAND.primary }} />
        <span className="text-[13px] font-semibold text-foreground">
          Upcoming Catalysts
        </span>
      </div>

      <div className="relative pl-6">
        <div
          className="absolute left-[9px] top-0 bottom-0 w-[2px]"
          style={{ background: SURFACE.overlay }}
        />

        {upcoming.map((item) => {
          const days = daysUntil(item.sortDate);
          let timeLabel = `${formatDateShort(item.sortDate)}`;
          let timeLabelColor: string = INK.muted;
          if (days === 0) { timeLabel = "Today"; timeLabelColor = BRAND.primary; }
          else if (days === 1) { timeLabel = "Tomorrow"; timeLabelColor = BRAND.secondary; }
          else if (days <= 7) { timeLabel = `In ${days}d`; timeLabelColor = INK.muted; }

          if (item.type === "earnings") {
            const e = item as EarningsItem;
            const dotColor = stageColorOf(e);
            return (
              <div key={item.id} className="relative flex items-start gap-3 pb-4" data-testid={`timeline-${e.ticker}`}>
                <div
                  className="absolute left-[-18px] top-[6px] w-[10px] h-[10px] rounded-full"
                  style={{ background: INK.faint }}
                />
                <div className="flex-1 flex items-center gap-3 flex-wrap">
                  <span
                    className="text-11 font-semibold min-w-[60px]"
                    style={{ color: timeLabelColor }}
                  >
                    {timeLabel}
                  </span>
                  <span
                    className="text-13 font-bold cursor-pointer hover:underline"
                    style={{ color: INK.primary }}
                    onClick={() => navigate(`/stock/${e.ticker}`)}
                  >
                    {e.ticker}
                  </span>
                  <span className="text-xs" style={{ color: INK.muted }}>{e.company}</span>
                  <span
                    className="text-10 px-1.5 py-0.5 rounded font-medium"
                    style={{ background: `${dotColor}18`, color: dotColor }}
                  >
                    {e.stage}
                  </span>
                  <span
                    className="text-10 px-1.5 py-0.5 rounded"
                    style={{ background: SURFACE.overlay, color: INK.muted }}
                  >
                    {e.time}
                  </span>
                </div>
              </div>
            );
          }

          const c = item as CatalystItem;
          const catColor = catalystCategoryColors[c.category] || INK.muted;
          return (
            <div key={item.id} className="relative flex items-start gap-3 pb-4" data-testid={`timeline-${c.id}`}>
              <div
                className="absolute left-[-18px] top-[6px] w-[10px] h-[10px] rounded-full"
                style={{ background: INK.faint }}
              />
              <div className="flex-1 flex items-center gap-3 flex-wrap">
                <span className="text-11 font-semibold min-w-[60px]" style={{ color: timeLabelColor }}>
                  {timeLabel}
                </span>
                <span className="text-13 font-semibold text-white">{c.title}</span>
                <span
                  className="text-10 px-1.5 py-0.5 rounded font-medium"
                  style={{ background: `${catColor}18`, color: catColor }}
                >
                  {c.category}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {past.length > 0 && (
        <button
          className="flex items-center gap-1.5 text-xs mt-2 transition-colors"
          style={{ color: INK.faint }}
          onClick={() => setShowPast(!showPast)}
          data-testid="toggle-past"
        >
          {showPast ? <EyeOff style={{ width: 12, height: 12 }} /> : <Eye style={{ width: 12, height: 12 }} />}
          {showPast ? "Hide" : "Show"} past earnings
        </button>
      )}

      {showPast && past.length > 0 && (
        <div className="relative pl-6 mt-4 opacity-50">
          <div className="absolute left-[9px] top-0 bottom-0 w-[2px]" style={{ background: SURFACE.raised }} />
          {past.map((item) => {
            if (item.type !== "earnings") return null;
            const e = item as EarningsItem;
            return (
              <div key={item.id} className="relative flex items-start gap-3 pb-3">
                <div className="absolute left-[-18px] top-[6px] w-[8px] h-[8px] rounded-full" style={{ background: INK.faint }} />
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-11 min-w-[60px]" style={{ color: INK.faint }}>{formatDateShort(e.date)}</span>
                  <span className="text-xs font-bold" style={{ color: INK.faint }}>{e.ticker}</span>
                  <span className="text-11" style={{ color: INK.faint }}>{e.company}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ThesisCatalysts({ catalysts }: { catalysts: CatalystItem[] }) {
  const [, navigate] = useLocation();

  return (
    <div data-testid="thesis-catalysts">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp style={{ width: 14, height: 14, color: BRAND.secondary }} />
        <span className="text-[13px] font-semibold text-foreground">
          Thesis Catalysts
        </span>
      </div>

      <div className="space-y-3">
        {catalysts.map((c) => {
          const catColor = catalystCategoryColors[c.category] || INK.muted;
          return (
            <div
              key={c.id}
              className="rounded-lg p-5"
              style={{
                background: SURFACE.raised,
                borderLeft: `3px solid ${catColor}`,
              }}
              data-testid={`catalyst-${c.id}`}
            >
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span
                  className="text-11 font-semibold px-2.5 py-1 rounded"
                  style={{ background: `${catColor}15`, color: catColor }}
                >
                  {c.category}
                </span>
                <span className="text-xs" style={{ color: INK.muted }}>{c.dateLabel}</span>
              </div>
              <h3 className="text-15 font-semibold text-white mb-2">{c.title}</h3>
              <p className="text-13 leading-relaxed mb-3" style={{ color: INK.muted }}>
                {c.description}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-11" style={{ color: INK.faint }}>Affects:</span>
                {c.affectedTickers.map((t) => (
                  <span
                    key={t}
                    className="text-11 font-bold font-mono px-2 py-0.5 rounded cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      color: stageColorOf({ ticker: t }),
                      background: `${stageColorOf({ ticker: t })}14`,
                      border: `1px solid ${stageColorOf({ ticker: t })}30`,
                    }}
                    onClick={() => navigate(`/stock/${t}`)}
                    data-testid={`catalyst-ticker-${t}`}
                  >
                    {t}
                  </span>
                ))}
                {c.affectedSectors.length > 0 && (
                  <span className="text-10 ml-1" style={{ color: INK.faint }}>
                    {c.affectedSectors.join(", ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CatalystTracker() {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<AllCatalystsResponse>({
    queryKey: ["/api/catalysts/all"],
    refetchInterval: 15 * 60 * 1000,
  });

  const items = data?.items || [];

  const earnings = items.filter((i): i is EarningsItem => i.type === "earnings");
  const catalysts = items.filter((i): i is CatalystItem => i.type === "catalyst");

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="catalyst-tracker-page">
      <PageHeader
        title="Catalyst Tracker"
        testId="catalyst-header"
        about="Earnings dates for tracked equities plus dated thesis catalysts (regulatory, policy, infrastructure, market, industry) on one calendar and timeline."
        stats={
          data ? (
            <>
              <HeaderStat label="Earnings" value={String(earnings.length)} valueClass="text-foreground" />
              <HeaderStat label="Catalysts" value={String(catalysts.length)} valueClass="text-foreground" />
            </>
          ) : undefined
        }
        right={<AsOf updatedAt={dataUpdatedAt} intervalMs={15 * 60 * 1000} />}
      />

      <div className="px-4 md:px-8 py-6 max-w-[1200px] mx-auto space-y-10">
        {isLoading ? (
          <div className="flex flex-col lg:flex-row gap-6" aria-hidden="true">
            <div className="w-full lg:w-[420px] flex-shrink-0 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-[340px] w-full" />
            </div>
            <div className="flex-1 min-w-0 space-y-4 lg:pl-6">
              <Skeleton className="h-5 w-44" />
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </div>
        ) : isError ? (
          <div
            className="rounded-lg flex flex-col items-center justify-center text-center px-6 py-16"
            style={{ background: SURFACE.raised, border: `1px solid ${BORDER.subtle}` }}
            data-testid="catalysts-error"
          >
            <AlertTriangle style={{ width: 20, height: 20, color: INK.muted }} />
            <div className="text-sm font-semibold mt-3" style={{ color: INK.primary }}>
              Catalysts unavailable
            </div>
            <p className="text-xs mt-1" style={{ color: INK.muted }}>
              The catalyst feed failed to load. It retries automatically.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-3 inline-flex items-center gap-1.5 rounded border border-subtle px-2.5 py-1 text-11 text-foreground hover:border-strong transition-colors"
              data-testid="error-retry"
            >
              <RotateCw className="h-3 w-3" />
              retry now
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col lg:flex-row gap-6" style={{ alignItems: "flex-start" }}>
              <div className="w-full lg:w-auto space-y-6" style={{ flex: "0 0 auto", maxWidth: 420 }}>
                <CalendarGrid
                  items={items}
                  currentMonth={currentMonth}
                  onMonthChange={setCurrentMonth}
                  selectedDate={selectedDate}
                  onDateSelect={setSelectedDate}
                />
                <div style={{ borderTop: `1px solid ${BORDER.subtle}`, paddingTop: 24 }}>
                  <ThesisCatalysts catalysts={catalysts} />
                </div>
              </div>
              <div className="flex-1 min-w-0 border-t lg:border-t-0 lg:border-l pt-6 lg:pt-0 lg:pl-6" style={{ borderColor: BORDER.subtle }}>
                <UpcomingTimeline items={items} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
