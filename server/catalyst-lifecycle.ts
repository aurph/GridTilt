// ─── Catalyst lifecycle (pure) ───────────────────────────────────────────
//
// One rule for "is this still upcoming", used by the calendar, the stock pages,
// the raw catalyst feed and the daily post. They used to filter separately; the
// stock pages did not filter at all and showed events months past under
// "Upcoming Catalysts".
//
// Convention: dates are calendar days in America/New_York. An event dated today
// is still upcoming today. A month-level date ("2026-12") is a window that stays
// upcoming until the month ends. A record marked completed is past whatever its
// date says. A date that does not parse is "undated" and is never shown as
// upcoming; it is never assigned today.

export interface CatalystRecord {
  id: number;
  /** YYYY-MM-DD for a day, YYYY-MM for a month-level window. */
  date: string;
  title: string;
  category: string;
  thesisImpact: string;
  tickers: string[];
  /** "confirmed": a scheduled date. "estimated": a typical or expected window. Absent: not stated. */
  dateKind?: "confirmed" | "estimated";
  /** The event has happened (a report published, a rule taking effect). */
  status?: "completed";
  sourceUrl?: string;
}

export type CatalystPhase = "upcoming" | "past" | "undated";

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;

/** The calendar day in New York for an instant, as YYYY-MM-DD. */
export function easternDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The last calendar day a date covers, or null when it does not parse as a real date. */
export function windowEnd(date: string): string | null {
  const d = DAY.exec(date);
  if (d) {
    const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
    if (m < 1 || m > 12 || day < 1 || day > daysInMonth(y, m)) return null;
    return date;
  }
  const mo = MONTH.exec(date);
  if (mo) {
    const [y, m] = [Number(mo[1]), Number(mo[2])];
    if (m < 1 || m > 12) return null;
    return `${mo[1]}-${mo[2]}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
  }
  return null;
}

export function catalystPhase(c: CatalystRecord, today: string): CatalystPhase {
  const end = typeof c.date === "string" ? windowEnd(c.date) : null;
  if (end === null) return "undated";
  if (c.status === "completed") return "past";
  return end < today ? "past" : "upcoming";
}

/** A sortable YYYY-MM-DD: a month-level window sorts at the start of its month. */
export function catalystSortDate(c: CatalystRecord): string {
  return MONTH.test(c.date) ? `${c.date}-01` : c.date;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 5, 2026", "Dec 2026" for a month-level window, "around ..." when the date is an estimate. */
export function catalystDateLabel(c: CatalystRecord): string {
  if (windowEnd(c.date) === null) return "date not set";
  const [y, m, d] = c.date.split("-").map(Number);
  const text = d ? `${MONTH_NAMES[m - 1]} ${d}, ${y}` : `${MONTH_NAMES[m - 1]} ${y}`;
  return c.dateKind === "estimated" ? `around ${text}` : text;
}

/**
 * A short label for a date that is not one exact, confirmed day: "Oct 2026" for
 * a month window, "around Oct 15" for an estimate. Null for an exact confirmed
 * day, which callers format themselves (a weekday, "in 3 days"). A month
 * window printed as its first day ("Thu, Oct 1") claimed a date nobody set.
 */
export function catalystShortLabel(c: CatalystRecord): string | null {
  if (windowEnd(c.date) === null) return "date not set";
  const [y, m, d] = c.date.split("-").map(Number);
  const around = c.dateKind === "estimated" ? "around " : "";
  if (!d) return `${around}${MONTH_NAMES[m - 1]} ${y}`;
  return around ? `${around}${MONTH_NAMES[m - 1]} ${d}` : null;
}

/** Upcoming catalysts, earliest first; optionally one ticker's, or only those starting by a horizon day. */
export function upcomingCatalysts(
  list: CatalystRecord[],
  today: string,
  opts: { ticker?: string; through?: string } = {},
): CatalystRecord[] {
  return list
    .filter((c) => catalystPhase(c, today) === "upcoming")
    .filter((c) => !opts.ticker || (c.tickers ?? []).includes(opts.ticker))
    .filter((c) => !opts.through || c.date <= opts.through)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}
