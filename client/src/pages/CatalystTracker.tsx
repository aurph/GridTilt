import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, ArrowRight, Eye, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import { PageShell, PageTitle, Provenance, RuleSection } from "@/components/editorial";
import {
  catalystCategoryColors,
  STAGE_COLORS,
  SUPPLY_CHAIN_STAGE_MAP,
  type CatalystCategory,
} from "@/data/catalyst-config";
import { BRAND, INK } from "@/lib/tokens";

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
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="p-1.5 text-ink-muted hover:text-ink transition-colors"
          data-testid="calendar-prev"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-[18px] w-[18px]" />
        </button>
        <span className="text-[14px] font-semibold text-ink">{monthName}</span>
        <button
          onClick={nextMonth}
          className="p-1.5 text-ink-muted hover:text-ink transition-colors"
          data-testid="calendar-next"
          aria-label="Next month"
        >
          <ChevronRight className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="grid grid-cols-7">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="text-center text-[11px] text-ink-muted py-1.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-l border-rule">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="border-r border-b border-rule bg-paper-shade/40 min-h-[56px]" />;
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayItems = itemsByDate[dateStr] || [];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          const isWeekend = (startOffset + day - 1) % 7 >= 5;

          return (
            <div
              key={dateStr}
              className={`cursor-pointer border-r border-b border-rule min-h-[56px] px-1.5 py-1 transition-colors ${
                isSelected ? "bg-paper-shade" : "hover:bg-paper-shade"
              }`}
              style={{
                borderLeft: isToday ? `2px solid ${BRAND.primary}` : undefined,
                opacity: isWeekend && dayItems.length === 0 ? 0.6 : 1,
              }}
              onClick={() => onDateSelect(isSelected ? null : dateStr)}
              data-testid={`calendar-day-${dateStr}`}
            >
              <div className={`text-[12.5px] tnum ${isToday ? "font-semibold text-brand-ink" : isSelected ? "font-semibold text-ink" : "text-ink-secondary"}`}>
                {day}
              </div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {dayItems.map((item, j) => {
                  let color: string = INK.muted;
                  if (item.type === "earnings") {
                    color = stageColorOf(item as EarningsItem);
                  } else {
                    color = catalystCategoryColors[(item as CatalystItem).category] || INK.muted;
                  }
                  return (
                    <span
                      key={j}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: color }}
                      title={item.type === "earnings" ? (item as EarningsItem).ticker : (item as CatalystItem).title}
                    />
                  );
                })}
              </div>
              {dayItems.length > 0 && (
                <div className="text-[11px] text-ink-muted mt-0.5 truncate">
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
        <div className="mt-4 border-t border-rule pt-3 space-y-3" data-testid="calendar-day-detail">
          <p className="text-[13px] font-semibold text-ink">{formatDateFull(selectedDate!)}</p>
          {selectedItems.map((item) => (
            <DayDetail key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayDetail({ item }: { item: MergedItem }) {
  const [, navigate] = useLocation();

  if (item.type === "earnings") {
    const e = item as EarningsItem;
    return (
      <div className="flex items-start gap-2" data-testid={`detail-${e.ticker}`}>
        <span className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: stageColorOf(e) }} />
        <div className="min-w-0">
          <p className="text-[13.5px] leading-snug">
            <span className="font-semibold text-ink">{e.ticker}</span>{" "}
            <span className="text-ink-secondary">{e.company}</span>
          </p>
          <p className="text-[12px] text-ink-muted mt-0.5">
            {[e.stage, e.quarter, e.time].filter(Boolean).join(" · ")}
          </p>
          <button
            className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-ink hover:text-ink transition-colors"
            onClick={() => navigate(`/stock/${e.ticker}`)}
            data-testid={`view-${e.ticker}`}
          >
            View {e.ticker} <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  const c = item as CatalystItem;
  const catColor = catalystCategoryColors[c.category] || INK.muted;
  return (
    <div className="flex items-start gap-2" data-testid={`detail-${c.id}`}>
      <span className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: catColor }} />
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-info leading-snug">{c.title}</p>
        <p className="text-[12px] text-ink-muted mt-0.5">{c.category} · {c.dateLabel}</p>
        <p className="text-[12.5px] text-ink-secondary leading-relaxed mt-1">{c.description}</p>
      </div>
    </div>
  );
}

/**
 * Print agenda: date column, 6px category dot, event line. Earnings read in
 * plain ink; policy/regulatory catalyst events carry the info-ink treatment.
 */
function UpcomingAgenda({ items }: { items: MergedItem[] }) {
  const [showPast, setShowPast] = useState(false);
  const [, navigate] = useLocation();

  const upcoming = items.filter((i) => daysUntil(i.sortDate) >= 0).slice(0, 20);
  const past = items.filter((i) => daysUntil(i.sortDate) < 0).slice(-10).reverse();

  return (
    <RuleSection head="Upcoming catalysts" className="mt-0" testId="upcoming-timeline">
      {upcoming.length === 0 ? (
        <p className="py-6 text-[13px] text-ink-muted text-center">No upcoming catalysts.</p>
      ) : (
        <div>
          {upcoming.map((item) => {
            const days = daysUntil(item.sortDate);
            const timeLabel = days === 0 ? "Today" : days === 1 ? "Tomorrow" : formatDateShort(item.sortDate);
            const dateClass = days <= 1 ? "font-semibold text-ink" : "text-ink-muted";

            if (item.type === "earnings") {
              const e = item as EarningsItem;
              const dotColor = stageColorOf(e);
              return (
                <div key={item.id} className="flex items-start gap-3 py-2 border-b border-rule" data-testid={`timeline-${e.ticker}`}>
                  <span className={`w-[76px] flex-shrink-0 text-[13px] tnum leading-snug ${dateClass}`}>{timeLabel}</span>
                  <span className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: dotColor }} />
                  <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
                    <button
                      className="font-semibold text-ink hover:text-brand-ink transition-colors"
                      onClick={() => navigate(`/stock/${e.ticker}`)}
                    >
                      {e.ticker}
                    </button>{" "}
                    <span className="text-ink-secondary">{e.company}</span>
                    <span className="text-[12px] text-ink-muted">
                      {" "}· {[e.stage, e.time].filter(Boolean).join(" · ")}
                    </span>
                  </p>
                </div>
              );
            }

            const c = item as CatalystItem;
            const catColor = catalystCategoryColors[c.category] || INK.muted;
            return (
              <div key={item.id} className="flex items-start gap-3 py-2 border-b border-rule" data-testid={`timeline-${c.id}`}>
                <span className={`w-[76px] flex-shrink-0 text-[13px] tnum leading-snug ${dateClass}`}>{timeLabel}</span>
                <span className="h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: catColor }} />
                <p className="min-w-0 flex-1 text-[13.5px] leading-snug">
                  <span className="font-medium text-info">{c.title}</span>
                  <span className="text-[12px] text-ink-muted"> · {c.category}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}

      {past.length > 0 && (
        <button
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted hover:text-ink transition-colors"
          onClick={() => setShowPast(!showPast)}
          data-testid="toggle-past"
        >
          {showPast ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {showPast ? "Hide" : "Show"} past earnings
        </button>
      )}

      {showPast && past.length > 0 && (
        <div className="mt-2">
          {past.map((item) => {
            if (item.type !== "earnings") return null;
            const e = item as EarningsItem;
            return (
              <div key={item.id} className="flex items-start gap-3 py-1.5 border-b border-rule">
                <span className="w-[76px] flex-shrink-0 text-[13px] tnum text-ink-faint leading-snug">{formatDateShort(e.date)}</span>
                <p className="min-w-0 flex-1 text-[13px] text-ink-faint leading-snug">
                  <span className="font-semibold">{e.ticker}</span> {e.company}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Provenance source="Yahoo Finance earnings + GridTilt curated events" />
    </RuleSection>
  );
}

function ThesisCatalysts({ catalysts }: { catalysts: CatalystItem[] }) {
  const [, navigate] = useLocation();

  return (
    <RuleSection head="Thesis catalysts" testId="thesis-catalysts">
      {catalysts.length === 0 ? (
        <p className="py-6 text-[13px] text-ink-muted text-center">No dated thesis catalysts.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
          {catalysts.map((c) => {
            const catColor = catalystCategoryColors[c.category] || INK.muted;
            return (
              <div key={c.id} className="py-3 border-b border-rule" data-testid={`catalyst-${c.id}`}>
                <p className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                  <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: catColor }} />
                  {c.category} · {c.dateLabel}
                </p>
                <h3 className="text-[15px] font-semibold text-ink leading-snug mt-1">{c.title}</h3>
                <p className="text-[13px] text-ink-secondary leading-relaxed mt-1 max-w-[68ch]">
                  {c.description}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed">
                  <span className="text-ink-muted">Affects: </span>
                  {c.affectedTickers.map((t, i) => (
                    <span key={t}>
                      {i > 0 && <span className="text-ink-muted">, </span>}
                      <button
                        className="font-semibold text-ink hover:text-brand-ink transition-colors"
                        onClick={() => navigate(`/stock/${t}`)}
                        data-testid={`catalyst-ticker-${t}`}
                      >
                        {t}
                      </button>
                    </span>
                  ))}
                  {c.affectedSectors.length > 0 && (
                    <span className="text-ink-muted"> · {c.affectedSectors.join(", ")}</span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <Provenance source="GridTilt curated events" />
    </RuleSection>
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
    <div data-testid="catalyst-tracker-page">
      <PageShell>
        <PageTitle
          title="Catalysts"
          right={
            <>
              {data && (
                <span className="text-[12.5px] text-ink-secondary">
                  <span className="font-semibold text-ink tnum">{earnings.length}</span> earnings ·{" "}
                  <span className="font-semibold text-ink tnum">{catalysts.length}</span> events
                </span>
              )}
              <AsOf updatedAt={dataUpdatedAt} intervalMs={15 * 60 * 1000} />
            </>
          }
          testId="catalyst-header"
        />

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-x-10 gap-y-8" aria-hidden="true">
            <div className="lg:col-span-2 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-[340px] w-full" />
            </div>
            <div className="lg:col-span-3 space-y-4">
              <Skeleton className="h-5 w-44" />
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </div>
        ) : isError ? (
          <div data-testid="catalysts-error">
            <ErrorState
              label="The catalyst feed failed to load. It retries automatically."
              onRetry={() => refetch()}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-x-10 gap-y-8">
              <div className="lg:col-span-2">
                <RuleSection head="Calendar" className="mt-0">
                  <CalendarGrid
                    items={items}
                    currentMonth={currentMonth}
                    onMonthChange={setCurrentMonth}
                    selectedDate={selectedDate}
                    onDateSelect={setSelectedDate}
                  />
                </RuleSection>
              </div>
              <div className="lg:col-span-3">
                <UpcomingAgenda items={items} />
              </div>
            </div>

            <ThesisCatalysts catalysts={catalysts} />
          </>
        )}
      </PageShell>
    </div>
  );
}
