import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock,
  TrendingUp, AlertTriangle, ArrowRight, Eye, EyeOff,
} from "lucide-react";
import {
  catalystCategoryColors,
  STAGE_COLORS,
  SUPPLY_CHAIN_STAGE_MAP,
  type CatalystCategory,
} from "@/data/catalyst-config";

interface EarningsItem {
  id: string;
  type: "earnings";
  date: string;
  sortDate: string;
  ticker: string;
  company: string;
  time: string;
  quarter: string;
  estimatedEPS: number | null;
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
  earningsSource: "finnhub" | "seed";
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

function getStageColor(ticker: string): string {
  const stage = SUPPLY_CHAIN_STAGE_MAP[ticker];
  return stage ? (STAGE_COLORS[stage] || "#888") : "#888";
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
        <button onClick={prevMonth} className="p-2 hover:text-white text-[#888] transition-colors" data-testid="calendar-prev">
          <ChevronLeft style={{ width: 18, height: 18 }} />
        </button>
        <span className="text-[18px] font-bold text-white">{monthName}</span>
        <button onClick={nextMonth} className="p-2 hover:text-white text-[#888] transition-colors" data-testid="calendar-next">
          <ChevronRight style={{ width: 18, height: 18 }} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px" style={{ background: "rgba(255,255,255,0.03)" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-[11px] font-medium py-2" style={{ color: "#666", background: "#12121E" }}>
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} style={{ background: "#14142A", minHeight: 80 }} />;
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
                background: isSelected ? "#1E1E3A" : isToday ? "#1A1A30" : "#14142A",
                minHeight: 80,
                padding: "6px 8px",
                borderLeft: isToday ? "2px solid #F07800" : isSelected ? "2px solid rgba(255,255,255,0.2)" : "2px solid transparent",
                opacity: isWeekend && dayItems.length === 0 ? 0.6 : 1,
              }}
              onClick={() => onDateSelect(isSelected ? null : dateStr)}
              data-testid={`calendar-day-${dateStr}`}
            >
              <div className="text-[13px] font-medium mb-1" style={{ color: isToday ? "#F07800" : "#ccc" }}>
                {day}
              </div>
              <div className="flex flex-wrap gap-1">
                {dayItems.map((item, j) => {
                  let color = "#888";
                  if (item.type === "earnings") {
                    color = (item as EarningsItem).stageColor || getStageColor((item as EarningsItem).ticker);
                  } else {
                    color = catalystCategoryColors[(item as CatalystItem).category] || "#888";
                  }
                  return (
                    <div
                      key={j}
                      className="rounded-full"
                      style={{ width: 8, height: 8, background: color }}
                      title={item.type === "earnings" ? (item as EarningsItem).ticker : (item as CatalystItem).title}
                    />
                  );
                })}
              </div>
              {dayItems.length > 0 && (
                <div className="text-[9px] mt-1 truncate" style={{ color: "#666" }}>
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
          <div className="text-[14px] font-semibold text-white mb-2">
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
        style={{ background: "#1A1A2E", border: `1px solid ${e.stageColor}25` }}
        data-testid={`detail-${e.ticker}`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-white">{e.ticker}</span>
            <span className="text-[13px]" style={{ color: "#aaa" }}>{e.company}</span>
          </div>
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded"
            style={{ background: "#2A2A3E", color: "#aaa" }}
          >
            {e.time}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[12px]" style={{ color: "#888" }}>
          <span
            className="px-1.5 py-0.5 rounded text-[10px] font-medium"
            style={{ background: `${e.stageColor}18`, color: e.stageColor }}
          >
            {e.stage}
          </span>
          {e.quarter && <span>{e.quarter}</span>}
          {e.estimatedEPS !== null && <span>Est. EPS: ${e.estimatedEPS}</span>}
        </div>
        <button
          className="flex items-center gap-1 mt-2 text-[12px] transition-colors"
          style={{ color: e.stageColor }}
          onClick={() => navigate(`/stock/${e.ticker}`)}
          data-testid={`view-${e.ticker}`}
        >
          View {e.ticker} <ArrowRight style={{ width: 12, height: 12 }} />
        </button>
      </div>
    );
  }

  const c = item as CatalystItem;
  const catColor = catalystCategoryColors[c.category] || "#888";
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "#1A1A2E", borderLeft: `3px solid ${catColor}` }}
      data-testid={`detail-${c.id}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded"
          style={{ background: `${catColor}18`, color: catColor }}
        >
          {c.category}
        </span>
        <span className="text-[12px]" style={{ color: "#888" }}>{c.dateLabel}</span>
      </div>
      <div className="text-[14px] font-semibold text-white mb-1">{c.title}</div>
      <p className="text-[12px] leading-relaxed" style={{ color: "#aaa" }}>{c.description}</p>
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
        <Clock style={{ width: 14, height: 14, color: "#F07800" }} />
        <span className="text-[13px] font-semibold text-white uppercase tracking-wider">
          Upcoming Earnings
        </span>
      </div>

      <div className="relative pl-6">
        <div
          className="absolute left-[9px] top-0 bottom-0 w-[2px]"
          style={{ background: "#2A2A3E" }}
        />

        {upcoming.map((item) => {
          const days = daysUntil(item.sortDate);
          let timeLabel = `${formatDateShort(item.sortDate)}`;
          let timeLabelColor = "#888";
          if (days === 0) { timeLabel = "TODAY"; timeLabelColor = "#F07800"; }
          else if (days === 1) { timeLabel = "TOMORROW"; timeLabelColor = "#F0A500"; }
          else if (days <= 7) { timeLabel = `In ${days}d`; timeLabelColor = "#aaa"; }

          if (item.type === "earnings") {
            const e = item as EarningsItem;
            const dotColor = e.stageColor || getStageColor(e.ticker);
            return (
              <div key={item.id} className="relative flex items-start gap-3 pb-4" data-testid={`timeline-${e.ticker}`}>
                <div
                  className="absolute left-[-18px] top-[6px] w-[10px] h-[10px] rounded-full border-2"
                  style={{ background: dotColor, borderColor: "#0A0A1A" }}
                />
                <div className="flex-1 flex items-center gap-3 flex-wrap">
                  <span
                    className="text-[11px] font-bold uppercase min-w-[60px]"
                    style={{ color: timeLabelColor }}
                  >
                    {timeLabel}
                  </span>
                  <span
                    className="text-[13px] font-bold cursor-pointer hover:underline"
                    style={{ color: "#fff" }}
                    onClick={() => navigate(`/stock/${e.ticker}`)}
                  >
                    {e.ticker}
                  </span>
                  <span className="text-[12px]" style={{ color: "#888" }}>{e.company}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{ background: `${dotColor}18`, color: dotColor }}
                  >
                    {e.stage}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "#2A2A3E", color: "#aaa" }}
                  >
                    {e.time}
                  </span>
                  {e.estimatedEPS !== null && (
                    <span className="text-[11px]" style={{ color: "#666" }}>
                      Est. ${e.estimatedEPS}
                    </span>
                  )}
                </div>
              </div>
            );
          }

          const c = item as CatalystItem;
          const catColor = catalystCategoryColors[c.category] || "#888";
          return (
            <div key={item.id} className="relative flex items-start gap-3 pb-4" data-testid={`timeline-${c.id}`}>
              <div
                className="absolute left-[-18px] top-[6px] w-[10px] h-[10px] rounded-full border-2"
                style={{ background: catColor, borderColor: "#0A0A1A" }}
              />
              <div className="flex-1 flex items-center gap-3 flex-wrap">
                <span className="text-[11px] font-bold uppercase min-w-[60px]" style={{ color: timeLabelColor }}>
                  {timeLabel}
                </span>
                <span className="text-[13px] font-semibold text-white">{c.title}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-medium"
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
          className="flex items-center gap-1.5 text-[12px] mt-2 transition-colors"
          style={{ color: "#666" }}
          onClick={() => setShowPast(!showPast)}
          data-testid="toggle-past"
        >
          {showPast ? <EyeOff style={{ width: 12, height: 12 }} /> : <Eye style={{ width: 12, height: 12 }} />}
          {showPast ? "Hide" : "Show"} past earnings
        </button>
      )}

      {showPast && past.length > 0 && (
        <div className="relative pl-6 mt-4 opacity-50">
          <div className="absolute left-[9px] top-0 bottom-0 w-[2px]" style={{ background: "#1E1E2E" }} />
          {past.map((item) => {
            if (item.type !== "earnings") return null;
            const e = item as EarningsItem;
            return (
              <div key={item.id} className="relative flex items-start gap-3 pb-3">
                <div className="absolute left-[-18px] top-[6px] w-[8px] h-[8px] rounded-full" style={{ background: "#444" }} />
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] min-w-[60px]" style={{ color: "#555" }}>{formatDateShort(e.date)}</span>
                  <span className="text-[12px] font-bold" style={{ color: "#666" }}>{e.ticker}</span>
                  <span className="text-[11px]" style={{ color: "#555" }}>{e.company}</span>
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
        <TrendingUp style={{ width: 14, height: 14, color: "#F0A500" }} />
        <span className="text-[13px] font-semibold text-white uppercase tracking-wider">
          Thesis Catalysts
        </span>
      </div>

      <div className="space-y-3">
        {catalysts.map((c) => {
          const catColor = catalystCategoryColors[c.category] || "#888";
          return (
            <div
              key={c.id}
              className="rounded-lg p-5"
              style={{
                background: "#1A1A2E",
                borderLeft: `3px solid ${catColor}`,
              }}
              data-testid={`catalyst-${c.id}`}
            >
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded"
                  style={{ background: `${catColor}15`, color: catColor }}
                >
                  {c.category}
                </span>
                <span className="text-[12px]" style={{ color: "#888" }}>{c.dateLabel}</span>
              </div>
              <h3 className="text-[15px] font-semibold text-white mb-2">{c.title}</h3>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: "#aaa" }}>
                {c.description}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px]" style={{ color: "#666" }}>Affects:</span>
                {c.affectedTickers.map((t) => (
                  <span
                    key={t}
                    className="text-[11px] font-bold font-mono px-2 py-0.5 rounded cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      color: getStageColor(t),
                      background: `${getStageColor(t)}14`,
                      border: `1px solid ${getStageColor(t)}30`,
                    }}
                    onClick={() => navigate(`/stock/${t}`)}
                    data-testid={`catalyst-ticker-${t}`}
                  >
                    {t}
                  </span>
                ))}
                {c.affectedSectors.length > 0 && (
                  <span className="text-[10px] ml-1" style={{ color: "#555" }}>
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

  const { data, isLoading } = useQuery<AllCatalystsResponse>({
    queryKey: ["/api/catalysts/all"],
    refetchInterval: 15 * 60 * 1000,
  });

  const items = data?.items || [];
  const earningsSource = data?.earningsSource || "seed";

  const earnings = items.filter((i): i is EarningsItem => i.type === "earnings");
  const catalysts = items.filter((i): i is CatalystItem => i.type === "catalyst");

  return (
    <div className="h-full overflow-y-auto" data-testid="catalyst-tracker-page">
      <div
        className="flex items-center gap-2 px-4 md:px-8 flex-wrap sticky top-0 z-10"
        style={{ height: 48, background: "#12121E", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <CalendarDays style={{ width: 16, height: 16, color: "#F07800" }} />
        <span className="text-[16px] font-bold text-white">Catalyst Tracker</span>
        <span className="text-[13px]" style={{ color: "#666" }}>·</span>
        <span className="text-[13px]" style={{ color: "#aaa" }}>
          {earnings.length} earnings
        </span>
        <span className="text-[13px]" style={{ color: "#666" }}>·</span>
        <span className="text-[13px]" style={{ color: "#aaa" }}>
          {catalysts.length} thesis catalysts
        </span>
      </div>

      {earningsSource === "seed" && (
        <div
          className="flex items-center gap-2 px-4 md:px-8 py-2 text-[12px]"
          style={{ background: "#1A1A30", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "#F0A500" }}
          data-testid="seed-data-banner"
        >
          <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0 }} />
          Showing estimated dates. Add FINNHUB_API_KEY for live earnings data.
        </div>
      )}

      <div className="px-4 md:px-8 py-6 max-w-[1100px] mx-auto space-y-10">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 rounded-lg animate-pulse" style={{ background: "#1A1A2E" }} />
            ))}
          </div>
        ) : (
          <>
            <CalendarGrid
              items={items}
              currentMonth={currentMonth}
              onMonthChange={setCurrentMonth}
              selectedDate={selectedDate}
              onDateSelect={setSelectedDate}
            />

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 32 }}>
              <UpcomingTimeline items={items} />
            </div>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 32 }}>
              <ThesisCatalysts catalysts={catalysts} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
