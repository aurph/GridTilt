// Timeline filters, grouping and the week summary. Pure: the page passes in
// the events from /api/timeline and the URL's query string. Filter state
// lives in the URL so a filtered view can be shared.

export const EVENT_TYPES = [
  "power_deal",
  "cluster_announced",
  "earnings",
  "price_milestone",
  "model_release",
  "token_price",
  "research",
  "state_action",
  "correction",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const TYPE_LABELS: Record<EventType, { chip: string; plural: string }> = {
  power_deal: { chip: "Power deals", plural: "power deals" },
  cluster_announced: { chip: "Clusters", plural: "cluster announcements" },
  earnings: { chip: "Earnings", plural: "earnings dates" },
  price_milestone: { chip: "GPU prices", plural: "GPU price milestones" },
  model_release: { chip: "Model releases", plural: "model releases" },
  token_price: { chip: "Token prices", plural: "token price changes" },
  research: { chip: "Research", plural: "research posts" },
  state_action: { chip: "State actions", plural: "state actions" },
  correction: { chip: "Corrections", plural: "corrections" },
};

export type Magnitude =
  | { unit: "MW"; value: number; qualifier?: "up to" | "rated" | "planned" }
  | { unit: "GPUs"; value: number }
  | { unit: "USD/GPU-hr"; value: number; direction: "above" | "below" }
  | { unit: "USD/M tokens"; value: number };

export interface TimelineEvent {
  id: string;
  date: string;
  dateBasis: string;
  eventType: EventType;
  title: string;
  description?: string;
  magnitude?: Magnitude;
  relatedTickers?: string[];
  sourceTool: string;
  sourceUrl: string;
  sourceLinks: string[];
  recordKey: string;
}

export const RANGES = ["30d", "90d", "1y", "all", "custom"] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABELS: Record<Range, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "1y": "Last year",
  all: "All time",
  custom: "Custom",
};

export interface Filters {
  /** Empty means every type. Kept in EVENT_TYPES order. */
  types: EventType[];
  range: Range;
  /** Custom range bounds, inclusive. Only read when range is "custom". */
  from: string | null;
  to: string | null;
  ticker: string | null;
  /** One source record, e.g. "deal:tmi-crane", from a "view on timeline" link. */
  record: string | null;
}

export const DEFAULT_FILTERS: Filters = { types: [], range: "all", from: null, to: null, ticker: null, record: null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TICKER = /^[A-Z][A-Z0-9.]{0,9}$/;
const RECORD = /^[a-z_]+:[A-Za-z0-9._:-]{1,120}$/;

export function parseFilters(search: string): Filters {
  const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const types = (sp.get("type") ?? "")
    .split(",")
    .filter((t): t is EventType => (EVENT_TYPES as readonly string[]).includes(t));
  const rangeRaw = sp.get("range");
  let range: Range = (RANGES as readonly string[]).includes(rangeRaw ?? "") ? (rangeRaw as Range) : "all";
  let from = sp.get("from");
  let to = sp.get("to");
  from = from && DAY.test(from) ? from : null;
  to = to && DAY.test(to) ? to : null;
  if (range === "custom" && !from && !to) range = "all";
  if (range !== "custom") {
    from = null;
    to = null;
  }
  if (from && to && from > to) [from, to] = [to, from];
  const tickerRaw = (sp.get("ticker") ?? "").toUpperCase();
  const recordRaw = sp.get("record") ?? "";
  return {
    types: EVENT_TYPES.filter((t) => types.includes(t)),
    range,
    from,
    to,
    ticker: TICKER.test(tickerRaw) ? tickerRaw : null,
    record: RECORD.test(recordRaw) ? recordRaw : null,
  };
}

/** Query string for the filters, defaults omitted, fixed key order. "" when nothing is set. */
export function serializeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.types.length) parts.push(`type=${EVENT_TYPES.filter((t) => f.types.includes(t)).join(",")}`);
  if (f.range !== "all") {
    if (f.range !== "custom") parts.push(`range=${f.range}`);
    else if (f.from || f.to) {
      parts.push("range=custom");
      if (f.from) parts.push(`from=${f.from}`);
      if (f.to) parts.push(`to=${f.to}`);
    }
  }
  if (f.ticker) parts.push(`ticker=${encodeURIComponent(f.ticker)}`);
  if (f.record) parts.push(`record=${encodeURIComponent(f.record)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** today minus n days, as YYYY-MM-DD (UTC arithmetic on a calendar date). */
export function daysBefore(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** The inclusive date window a preset covers, ending today. Null bound = open. */
export function rangeWindow(f: Filters, today: string): { from: string | null; to: string | null } {
  switch (f.range) {
    case "30d":
      return { from: daysBefore(today, 29), to: today };
    case "90d":
      return { from: daysBefore(today, 89), to: today };
    case "1y":
      return { from: daysBefore(today, 364), to: today };
    case "custom":
      return { from: f.from, to: f.to };
    default:
      return { from: null, to: null };
  }
}

function matchesNonDate(e: TimelineEvent, f: Filters): boolean {
  if (f.types.length && !f.types.includes(e.eventType)) return false;
  if (f.ticker && !(e.relatedTickers ?? []).includes(f.ticker)) return false;
  if (f.record && e.recordKey !== f.record) return false;
  return true;
}

/**
 * Split filtered events into upcoming (after today, soonest first) and past
 * (today and earlier, newest first). All filters combine with AND. Presets
 * ("last 30 days" and so on) look back from today, so they bound the past
 * feed only; a custom range bounds both lists.
 */
export function applyFilters(events: TimelineEvent[], f: Filters, today: string): { upcoming: TimelineEvent[]; past: TimelineEvent[] } {
  if (!DAY.test(today)) return { upcoming: [], past: [] };
  const w = rangeWindow(f, today);
  const inWindow = (d: string) => (!w.from || d >= w.from) && (!w.to || d <= w.to);
  const kept = events.filter((e) => matchesNonDate(e, f));
  const upcoming = kept
    .filter((e) => e.date > today && (f.range !== "custom" || inWindow(e.date)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  const past = kept.filter((e) => e.date <= today && inWindow(e.date));
  return { upcoming, past };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** Consecutive month groups, in the order the events arrive. */
export function groupByMonth(events: TimelineEvent[]): Array<{ month: string; label: string; events: TimelineEvent[] }> {
  const out: Array<{ month: string; label: string; events: TimelineEvent[] }> = [];
  for (const e of events) {
    const month = e.date.slice(0, 7);
    const last = out[out.length - 1];
    if (last && last.month === month) last.events.push(e);
    else out.push({ month, label: monthLabel(month), events: [e] });
  }
  return out;
}

// Significance order for the week strip: types whose size is a physical
// buildout first, then by size within the same unit, then newest.
const SIGNIFICANCE_ORDER: EventType[] = ["power_deal", "cluster_announced", "state_action", "price_milestone", "token_price", "model_release", "earnings", "research", "correction"];

export function compareSignificance(a: TimelineEvent, b: TimelineEvent): number {
  const am = a.magnitude ? 0 : 1;
  const bm = b.magnitude ? 0 : 1;
  if (am !== bm) return am - bm;
  const at = SIGNIFICANCE_ORDER.indexOf(a.eventType);
  const bt = SIGNIFICANCE_ORDER.indexOf(b.eventType);
  if (at !== bt) return at - bt;
  if (a.magnitude && b.magnitude && a.magnitude.unit === b.magnitude.unit && a.magnitude.value !== b.magnitude.value) {
    return b.magnitude.value - a.magnitude.value;
  }
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.id < b.id ? -1 : 1;
}

/** The last 7 days through today: counts by type and the three most significant events. */
export function weekSummary(events: TimelineEvent[], today: string): { from: string; total: number; counts: Array<{ type: EventType; count: number }>; top: TimelineEvent[] } {
  if (!DAY.test(today)) return { from: "", total: 0, counts: [], top: [] };
  const from = daysBefore(today, 6);
  const week = events.filter((e) => e.date >= from && e.date <= today);
  const counts = EVENT_TYPES.map((type) => ({ type, count: week.filter((e) => e.eventType === type).length })).filter((c) => c.count > 0);
  return { from, total: week.length, counts, top: [...week].sort(compareSignificance).slice(0, 3) };
}

/** Tickers that appear on any event, sorted. */
export function tickerOptions(events: TimelineEvent[]): string[] {
  return Array.from(new Set(events.flatMap((e) => e.relatedTickers ?? []))).sort();
}

/** What an empty result says, naming the filters that produced it. */
export function emptyMessage(f: Filters): string {
  const what = f.types.length === 1 ? TYPE_LABELS[f.types[0]].plural : "events";
  const parts: string[] = [];
  if (f.ticker) parts.push(`tagged ${f.ticker}`);
  if (f.record) parts.push("for this record");
  const where = f.range === "all" ? "" : " in this range";
  return `No ${what}${parts.length ? ` ${parts.join(" ")}` : ""}${where}.`;
}

/** "835 MW", "up to 12,000 MW", "100,000 GPUs", "$3.00/GPU-hr", "$0.20 per M tokens". */
export function formatMagnitude(m: Magnitude): string {
  const n = (v: number) => v.toLocaleString("en-US");
  switch (m.unit) {
    case "MW":
      return `${m.qualifier === "up to" ? "up to " : ""}${n(m.value)} MW${m.qualifier === "rated" || m.qualifier === "planned" ? ` ${m.qualifier}` : ""}`;
    case "GPUs":
      return `${n(m.value)} GPUs`;
    case "USD/GPU-hr":
      return `$${m.value.toFixed(2)}/GPU-hr`;
    case "USD/M tokens":
      return `$${m.value} per M tokens`;
  }
}
