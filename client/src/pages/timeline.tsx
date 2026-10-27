import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/Freshness";
import { PageHeader, HeaderStat } from "@/components/PageHeader";
import { BRAND } from "@/lib/tokens";
import {
  DEFAULT_FILTERS,
  EVENT_TYPES,
  RANGES,
  RANGE_LABELS,
  TYPE_LABELS,
  applyFilters,
  emptyMessage,
  formatMagnitude,
  groupByMonth,
  parseFilters,
  serializeFilters,
  tickerOptions,
  weekSummary,
  type EventType,
  type Filters,
  type Range,
  type TimelineEvent,
} from "@/lib/timeline-filters";

// Payload of /api/timeline (server/timeline.ts + routes.ts).
interface TimelinePayload {
  today: string;
  events: TimelineEvent[];
  estimatedEarnings: Array<{ ticker: string; company: string; date: string }>;
}

const UPCOMING_PREVIEW = 5;

export default function TimelinePage() {
  const search = useSearch();
  const filters = useMemo(() => parseFilters(search), [search]);
  const { data, isLoading, isError, refetch } = useQuery<TimelinePayload>({ queryKey: ["/api/timeline"] });

  const setFilters = (next: Filters) => {
    const qs = serializeFilters(next);
    window.history.replaceState(null, "", `${window.location.pathname}${qs}`);
  };

  const today = data?.today ?? "";
  const events = data?.events ?? [];
  const { upcoming, past } = useMemo(() => applyFilters(events, filters, today), [events, filters, today]);
  const months = useMemo(() => groupByMonth(past), [past]);
  const week = useMemo(() => weekSummary(events, today), [events, today]);
  const tickers = useMemo(() => tickerOptions(events), [events]);
  const typeCounts = useMemo(() => {
    const m = new Map<EventType, number>();
    for (const e of events) m.set(e.eventType, (m.get(e.eventType) ?? 0) + 1);
    return m;
  }, [events]);
  const latestPast = events.find((e) => e.date <= today);
  const showEstimates = filters.types.length === 0 || filters.types.includes("earnings");
  const estimates = (data?.estimatedEarnings ?? []).filter((e) => !filters.ticker || e.ticker === filters.ticker);
  const filtered = filters.types.length > 0 || filters.range !== "all" || !!filters.ticker || !!filters.record;

  return (
    <div className="flex flex-col h-full overflow-y-auto" data-testid="timeline-page">
      <PageHeader
        title="Timeline"
        testId="timeline-header"
        about={
          <>
            Events appear only with a day-precise date taken from the record: a sourced announcement date for
            power deals and clusters, release dates for models, publication dates for research, issue and hearing
            dates for state actions, and Yahoo report dates it marks confirmed. Most deal and cluster records do not
            carry an announcement date yet, so they are not here. GPU price milestones appear once the price
            providers give written permission to republish their data.
          </>
        }
        stats={
          data ? (
            <>
              <HeaderStat label="events" value={events.length.toLocaleString("en-US")} />
              {latestPast && <HeaderStat label="latest" value={latestPast.date} valueClass="text-foreground" />}
            </>
          ) : null
        }
        controls={
          data ? (
            <FilterControls
              filters={filters}
              typeCounts={typeCounts}
              tickers={tickers}
              onChange={setFilters}
            />
          ) : null
        }
      />

      <div className="px-4 sm:px-6 py-4 space-y-4 max-w-[1200px] mx-auto w-full">
        {isError ? (
          <ErrorState label="The timeline failed to load." onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <SkeletonFeed />
        ) : (
          <>
            {!filtered && <WeekStrip week={week} latest={latestPast} />}

            {(upcoming.length > 0 || (showEstimates && estimates.length > 0)) && (
              <UpcomingSection upcoming={upcoming} estimates={showEstimates ? estimates : []} />
            )}

            <section aria-label="Past events" data-testid="timeline-feed">
              {months.length === 0 ? (
                <Card className="border-card-border px-4 py-6 text-sm text-muted-foreground" data-testid="timeline-empty">
                  {emptyMessage(filters)}{" "}
                  {filtered && (
                    <button className="underline hover:text-foreground" onClick={() => setFilters(DEFAULT_FILTERS)} data-testid="timeline-clear">
                      Clear filters
                    </button>
                  )}
                </Card>
              ) : (
                <Card className="border-card-border overflow-hidden">
                  {months.map((g) => (
                    <div key={g.month} data-testid={`timeline-month-${g.month}`}>
                      <h2 className="sticky top-0 z-10 px-4 py-1.5 bg-surface-base border-b border-border text-[12px] font-semibold text-foreground">
                        {g.label}
                        <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">{g.events.length}</span>
                      </h2>
                      <ol>
                        {g.events.map((e) => (
                          <EventRow key={e.id} e={e} />
                        ))}
                      </ol>
                    </div>
                  ))}
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Filters ────────────────────────────────────────────────────────────────

function FilterControls({
  filters,
  typeCounts,
  tickers,
  onChange,
}: {
  filters: Filters;
  typeCounts: Map<EventType, number>;
  tickers: string[];
  onChange: (f: Filters) => void;
}) {
  const toggleType = (t: EventType) => {
    const on = filters.types.includes(t);
    onChange({ ...filters, types: on ? filters.types.filter((x) => x !== t) : [...filters.types, t] });
  };
  const chip = (on: boolean) =>
    `px-2 py-0.5 rounded text-[11px] border transition-colors ${on ? "border-brand text-foreground bg-brand/10" : "border-subtle text-muted-foreground hover:text-foreground"}`;
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Event types" data-testid="timeline-type-filter">
        <button className={chip(filters.types.length === 0)} aria-pressed={filters.types.length === 0} onClick={() => onChange({ ...filters, types: [] })}>
          All types
        </button>
        {EVENT_TYPES.filter((t) => (typeCounts.get(t) ?? 0) > 0).map((t) => {
          const on = filters.types.includes(t);
          return (
            <button key={t} className={chip(on)} aria-pressed={on} onClick={() => toggleType(t)} data-testid={`timeline-type-${t}`}>
              <TypeMarker type={t} />
              <span className="ml-1.5">{TYPE_LABELS[t].chip}</span>
              <span className="ml-1 font-mono text-muted-foreground">{typeCounts.get(t)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <label className="flex items-center gap-1.5 text-muted-foreground">
          Range
          <select
            className="bg-surface-base border border-subtle rounded px-1.5 py-0.5 text-foreground"
            value={filters.range}
            onChange={(ev) => {
              const range = ev.target.value as Range;
              onChange({ ...filters, range, ...(range === "custom" ? {} : { from: null, to: null }) });
            }}
            data-testid="timeline-range"
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {RANGE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {filters.range === "custom" && (
          <>
            <input
              type="date"
              aria-label="From"
              className="bg-surface-base border border-subtle rounded px-1.5 py-0.5 text-foreground"
              value={filters.from ?? ""}
              onChange={(ev) => onChange({ ...filters, from: ev.target.value || null })}
              data-testid="timeline-from"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              aria-label="To"
              className="bg-surface-base border border-subtle rounded px-1.5 py-0.5 text-foreground"
              value={filters.to ?? ""}
              onChange={(ev) => onChange({ ...filters, to: ev.target.value || null })}
              data-testid="timeline-to"
            />
          </>
        )}
        <label className="flex items-center gap-1.5 text-muted-foreground">
          Ticker
          <select
            className="bg-surface-base border border-subtle rounded px-1.5 py-0.5 text-foreground font-mono"
            value={filters.ticker ?? ""}
            onChange={(ev) => onChange({ ...filters, ticker: ev.target.value || null })}
            data-testid="timeline-ticker"
          >
            <option value="">Any</option>
            {tickers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {filters.record && (
          <button
            className="px-2 py-0.5 rounded border border-brand text-foreground bg-brand/10"
            onClick={() => onChange({ ...filters, record: null })}
            data-testid="timeline-record-clear"
          >
            One record · show all
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Last 7 days ────────────────────────────────────────────────────────────

function WeekStrip({ week, latest }: { week: ReturnType<typeof weekSummary>; latest: TimelineEvent | undefined }) {
  return (
    <Card className="border-card-border px-4 py-3" data-testid="timeline-week">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[12px] font-semibold text-foreground">Last 7 days</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {week.from} to today
        </span>
        {week.total > 0 && (
          <span className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            {week.counts.map((c) => (
              <span key={c.type} className="inline-flex items-center gap-1">
                <TypeMarker type={c.type} />
                {TYPE_LABELS[c.type].chip} <span className="font-mono text-foreground">{c.count}</span>
              </span>
            ))}
          </span>
        )}
      </div>
      {week.total === 0 ? (
        <p className="mt-1.5 text-[12px] text-muted-foreground" data-testid="timeline-week-empty">
          Nothing dated in the last 7 days.
          {latest && (
            <>
              {" "}Latest: <span className="font-mono">{latest.date}</span>,{" "}
              <Link href={latest.sourceUrl} className="text-foreground hover:text-brand">
                {latest.title}
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {week.top.map((e) => (
            <li key={e.id} className="flex items-baseline gap-2 text-[13px]">
              <span className="font-mono text-[11px] text-muted-foreground w-12 shrink-0">{shortDate(e.date)}</span>
              <TypeMarker type={e.eventType} />
              <Link href={e.sourceUrl} className="text-foreground hover:text-brand min-w-0">
                {e.title}
              </Link>
              {e.magnitude && <MagnitudeBadge e={e} />}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ─── Upcoming ───────────────────────────────────────────────────────────────

function UpcomingSection({ upcoming, estimates }: { upcoming: TimelineEvent[]; estimates: TimelinePayload["estimatedEarnings"] }) {
  const [all, setAll] = useState(false);
  const [showEst, setShowEst] = useState(false);
  const shown = all ? upcoming : upcoming.slice(0, UPCOMING_PREVIEW);
  return (
    <Card className="border-card-border overflow-hidden" data-testid="timeline-upcoming">
      <h2 className="px-4 py-1.5 bg-surface-base border-b border-border text-[12px] font-semibold text-foreground">
        Upcoming
        <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">{upcoming.length}</span>
      </h2>
      {upcoming.length > 0 && (
        <ol>
          {shown.map((e) => (
            <EventRow key={e.id} e={e} fullDate />
          ))}
        </ol>
      )}
      {upcoming.length > UPCOMING_PREVIEW && (
        <button
          className="w-full px-4 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground border-t border-border/40"
          onClick={() => setAll(!all)}
          data-testid="timeline-upcoming-toggle"
        >
          {all ? "Show fewer" : `Show all ${upcoming.length}`}
        </button>
      )}
      {estimates.length > 0 && (
        <div className="border-t border-border" data-testid="timeline-estimates">
          <button
            className="w-full px-4 py-1.5 text-left text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setShowEst(!showEst)}
            aria-expanded={showEst}
            data-testid="timeline-estimates-toggle"
          >
            {showEst ? "Hide" : "Show"} {estimates.length} earnings dates Yahoo marks as estimates (not on the timeline)
          </button>
          {showEst && (
            <ul className="px-4 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              {estimates.map((e) => (
                <li key={e.ticker} className="flex items-baseline gap-2 py-0.5 text-[12px] text-muted-foreground">
                  <span className="font-mono w-24 shrink-0">{e.date}</span>
                  <span className="rounded px-1 text-[10px] border border-subtle">est.</span>
                  <Link href={`/stock/${e.ticker}`} className="font-mono text-foreground hover:text-brand">
                    {e.ticker}
                  </Link>
                  <span className="truncate">{e.company}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────────

function EventRow({ e, fullDate = false }: { e: TimelineEvent; fullDate?: boolean }) {
  const [first, ...rest] = e.sourceLinks;
  // An earnings title already names its ticker and links to it.
  const tickers = e.eventType === "earnings" ? [] : e.relatedTickers ?? [];
  return (
    <li
      className={`grid ${fullDate ? "grid-cols-[5.5rem_1rem_1fr]" : "grid-cols-[3.25rem_1rem_1fr]"} gap-x-2 px-4 py-2 border-b border-border/30 last:border-b-0`}
      data-testid={`timeline-event-${e.id}`}
    >
      <time dateTime={e.date} className="font-mono text-[11px] text-muted-foreground pt-0.5">
        {fullDate ? e.date : shortDate(e.date)}
      </time>
      <span className="pt-1" title={TYPE_LABELS[e.eventType].chip}>
        <TypeMarker type={e.eventType} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link href={e.sourceUrl} className="text-[13px] text-foreground hover:text-brand" data-testid={`timeline-link-${e.id}`}>
            {e.title}
          </Link>
          {e.magnitude && <MagnitudeBadge e={e} />}
        </div>
        {e.description && <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">{e.description}</p>}
        {(tickers.length > 0 || first) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
            {tickers.map((t) => (
              <Link key={t} href={`/stock/${t}`} className="font-mono hover:text-brand" data-testid={`timeline-ticker-${e.id}-${t}`}>
                {t}
              </Link>
            ))}
            {first && (
              <a href={first} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
                {hostOf(first)}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
            {rest.length > 0 && <span>+{rest.length} more on the record</span>}
          </div>
        )}
      </div>
    </li>
  );
}

function MagnitudeBadge({ e }: { e: TimelineEvent }) {
  if (!e.magnitude) return null;
  return (
    <span className="rounded border border-subtle px-1.5 font-mono text-[11px] tabular-nums text-foreground whitespace-nowrap" data-testid={`timeline-magnitude-${e.id}`}>
      {formatMagnitude(e.magnitude)}
    </span>
  );
}

// One accent at different strengths and shapes: buildout events solid, market
// and model events lighter, GridTilt's own posts and corrections outlined.
const MARKERS: Record<EventType, { shape: "square" | "diamond" | "circle" | "triangle" | "bar"; fill: boolean; opacity: number }> = {
  power_deal: { shape: "square", fill: true, opacity: 1 },
  cluster_announced: { shape: "diamond", fill: true, opacity: 1 },
  state_action: { shape: "square", fill: false, opacity: 1 },
  earnings: { shape: "circle", fill: false, opacity: 0.8 },
  price_milestone: { shape: "triangle", fill: true, opacity: 0.7 },
  token_price: { shape: "triangle", fill: false, opacity: 0.7 },
  model_release: { shape: "circle", fill: true, opacity: 0.45 },
  research: { shape: "bar", fill: true, opacity: 0.45 },
  correction: { shape: "diamond", fill: false, opacity: 0.6 },
};

function TypeMarker({ type }: { type: EventType }) {
  const m = MARKERS[type];
  const fill = m.fill ? BRAND.primary : "none";
  const stroke = BRAND.primary;
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" className="inline-block shrink-0" style={{ opacity: m.opacity }}>
      {m.shape === "square" && <rect x="1" y="1" width="8" height="8" fill={fill} stroke={stroke} strokeWidth="1.5" />}
      {m.shape === "diamond" && <path d="M5 0.8 L9.2 5 L5 9.2 L0.8 5 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />}
      {m.shape === "circle" && <circle cx="5" cy="5" r="4" fill={fill} stroke={stroke} strokeWidth="1.5" />}
      {m.shape === "triangle" && <path d="M5 1 L9 9 L1 9 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />}
      {m.shape === "bar" && <rect x="0.5" y="3.5" width="9" height="3" fill={fill} />}
    </svg>
  );
}

function SkeletonFeed() {
  return (
    <div className="space-y-4" data-testid="timeline-loading">
      <Skeleton className="h-16" />
      <Card className="border-card-border p-4 space-y-3">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="grid grid-cols-[3.25rem_1rem_1fr] gap-x-2 items-center">
            <Skeleton className="h-3" />
            <Skeleton className="h-2.5 w-2.5" />
            <Skeleton className="h-4" style={{ width: `${55 + ((i * 17) % 40)}%` }} />
          </div>
        ))}
      </Card>
    </div>
  );
}

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(d: string): string {
  return `${SHORT_MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}
