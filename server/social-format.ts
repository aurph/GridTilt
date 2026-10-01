// ─── Tweet formatting (pure) ─────────────────────────────────────────────
//
// Every template the daily poster ships is built here from plain inputs,
// so the exact copy is unit-tested (server/__tests__/social-format.test.ts)
// and routes.ts only gathers data.
//
// The weekday rotation posts dated facts from GridTilt's own datasets, each
// with its basis and date, or skips the day with a reason (see below). No
// indices or sentiment gauges.
//
// Voice rules:
//   - plain sentences; tickers, acronyms and units keep their case
//     (H100, GB200, GW, US, AI, ERCOT)
//   - state what is in the data and its date; don't editorialize
//   - one info paragraph, a blank line, then the full https:// url so X cards it
//   - no manual column alignment ever (X uses proportional fonts)

export function fmtPct(n: number): string {
  const v = n.toFixed(2);
  return n >= 0 ? `+${v}%` : `${v}%`;
}

export function ensureTweetLength(text: string): string {
  if (text.length <= 280) return text;
  // Trim trailing lines until it fits. Always keep first line.
  const lines = text.split("\n");
  while (lines.length > 1 && lines.join("\n").length > 280) {
    lines.splice(lines.length - 2, 1);
  }
  let out = lines.join("\n");
  if (out.length > 280) out = out.slice(0, 277) + "…";
  return out;
}

// ── shared number formatting ───────────────────────────────────────────────

/** GW value: whole numbers print plain, fractions to one decimal. 125 -> "125",
 *  5 -> "5", 1.2 -> "1.2", 4.32 -> "4.3". */
function gwStr(g: number): string {
  return Number.isInteger(g) ? String(g) : g.toFixed(1);
}

/** Price: whole dollars print plain, cents to two decimals. 13 -> "$13",
 *  2.79 -> "$2.79". */
function usd(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** Thousands separators, locale-pinned so tests are deterministic. */
function withCommas(n: number): string {
  return n.toLocaleString("en-US");
}

// ── The weekday rotation ─────────────────────────────────────────────────────
//
// Each builder returns a post or a reason to skip. A post states one basis,
// one population and its date. When the source is stale, missing or cannot
// support the total, the day is skipped and the reason goes to the dry-run
// log. Nothing replaces a skipped post: no "change today" when there was none.

export type PostResult = { ok: true; text: string } | { ok: false; skip: string };

const skip = (reason: string): PostResult => ({ ok: false, skip: reason });

/** Posts are built to fit; a text over 280 is a builder bug, not something to trim. */
function post(lines: string[]): PostResult {
  const text = lines.join("\n");
  if (text.length > 280) return skip(`the post would be ${text.length} characters, over the 280 limit`);
  return { ok: true, text };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Whole days from one YYYY-MM-DD to another (negative when `from` is later). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * A source date as precise as it is: "2026-09-28" -> "Sep 28, 2026",
 * "2026-01" -> "Jan 2026", "2026" -> "2026". Anything else prints as given.
 */
export function shortDate(day: string): string {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(day.trim());
  if (!m) return day;
  const mon = m[2] ? MONTHS[Number(m[2]) - 1] : null;
  if (m[2] && !mon) return day;
  if (m[3]) return `${mon} ${Number(m[3])}, ${m[1]}`;
  if (mon) return `${mon} ${m[1]}`;
  return m[1];
}

/** Rounded GW from MW, one decimal: 29_400 -> "29.4", 62_000 -> "62". */
function gwFromMw(mw: number): string {
  return gwStr(Math.round(mw / 100) / 10);
}

// ── Monday: the tracked clusters by status (Compute Frontier) ─────────────

export interface StatusCount {
  count: number;
  plannedMW: number;
}

export interface BuildoutInput {
  clusterCount: number;
  operational: StatusCount;
  construction: StatusCount;
  announced: StatusCount;
  /** The cluster list's own date (clusters.json lastRefreshed). */
  asOf: string | null;
  /** Today, Eastern, YYYY-MM-DD. */
  today: string;
  /** The freshness registry's limit for this list, in days. */
  maxAgeDays: number;
}

export function buildBuildoutPost(i: BuildoutInput): PostResult {
  if (!i.asOf || !DAY_RE.test(i.asOf)) return skip("the cluster list carries no data date");
  const age = daysBetween(i.asOf, i.today);
  if (age > i.maxAgeDays) {
    return skip(`the cluster list was last refreshed ${i.asOf}, ${age} days ago; the freshness registry allows ${i.maxAgeDays}`);
  }
  if (i.clusterCount <= 0) return skip("the cluster list is empty");
  const counted = i.operational.count + i.construction.count + i.announced.count;
  if (counted !== i.clusterCount) {
    return skip(`${i.clusterCount - counted} of ${i.clusterCount} clusters have no recognized status, so the breakdown would not add up`);
  }
  return post([
    `GridTilt tracks ${withCommas(i.clusterCount)} AI compute clusters: ${i.operational.count} operating, ${i.construction.count} under construction and ${i.announced.count} announced. Their planned power, the full announced build: ${gwFromMw(i.operational.plannedMW)} GW, ${gwFromMw(i.construction.plannedMW)} GW and ${gwFromMw(i.announced.plannedMW)} GW. Data as of ${shortDate(i.asOf)}.`,
    "",
    "https://gridtilt.com/compute-frontier",
  ]);
}

// ── Tuesday: observed GPU rental prices (GPU Prices) ───────────────────────

export interface GpuObservedInput {
  /** The newest live observation's date, YYYY-MM-DD, or null when none is recorded. */
  observedOn: string | null;
  today: string;
  /** The page serves a live price this many days old at most. */
  maxAgeDays: number;
  /**
   * Models observed that day, in display order: the median price, how many
   * listings it came from, and the providers behind them ("RunPod", "Vast.ai").
   */
  models: Array<{ model: string; price: number; listings: number; providers: string[] }>;
}

export function buildGpuObservedPost(i: GpuObservedInput): PostResult {
  if (!i.observedOn || !DAY_RE.test(i.observedOn)) return skip("no live GPU price observation is recorded");
  const age = daysBetween(i.observedOn, i.today);
  if (age > i.maxAgeDays) {
    return skip(`the newest live GPU price observation is from ${i.observedOn}, ${age} days ago; the page serves one at most ${i.maxAgeDays} days old`);
  }
  const usable = i.models.filter((m) => m.price > 0 && m.listings >= 2).slice(0, 4);
  if (!usable.some((m) => m.model === "H100")) return skip(`H100 was not observed in at least two listings on ${i.observedOn}`);
  const names = Array.from(new Set(usable.flatMap((m) => m.providers)));
  if (names.length === 0) return skip("the observation names no provider");
  const providers = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return post([
    `On-demand GPU rental prices observed ${shortDate(i.observedOn)}, each the median of public listings on ${providers}: ${usable.map((m) => `${m.model} ${usd(m.price)}`).join(", ")} per GPU-hour.`,
    "",
    "https://gridtilt.com/neocloud-intel",
  ]);
}

// ── Wednesday: one project's status (Compute Frontier record) ──────────────

export interface ProjectInput {
  /** Display name, without the operator parenthetical. */
  name: string;
  /** "City, ST", "ST" when the name already carries the city, or "". */
  place: string;
  status: string;
  plannedMW: number | null;
  /** The source's own words for what the planned figure measures, e.g. "grid interconnection". */
  plannedBasis?: string | null;
  /** For a reviewed record: the operating figure, its date and who stated it. */
  operating?: { mw: number; asOf: string; source: string } | null;
  /** The record's field-by-field review date, YYYY-MM-DD. */
  reviewed?: string | null;
  /** The cluster list's date, for a record without a recent review. */
  listAsOf: string | null;
  today: string;
  /** The freshness registry's limit for the cluster list, in days. */
  maxListAgeDays: number;
  url: string;
}

/** A field-by-field review stays postable as current for this long. */
export const REVIEW_MAX_AGE_DAYS = 30;

const STATUS_WORDS: Record<string, string> = {
  operational: "operating",
  construction: "under construction",
  announced: "announced",
};

export function buildProjectPost(i: ProjectInput): PostResult {
  const status = STATUS_WORDS[i.status];
  if (!status) return skip(`${i.name} has no recognized status`);
  if (!(typeof i.plannedMW === "number" && i.plannedMW > 0)) return skip(`${i.name} has no planned power on record`);
  const head = `${i.name}${i.place ? `, ${i.place}` : ""}: ${status}.`;
  const planned = `${withCommas(i.plannedMW)} MW${i.plannedBasis ? ` ${i.plannedBasis}` : ""}`;

  const reviewAge = i.reviewed && DAY_RE.test(i.reviewed) ? daysBetween(i.reviewed, i.today) : null;
  if (reviewAge !== null && reviewAge >= 0 && reviewAge <= REVIEW_MAX_AGE_DAYS) {
    const reviewed = `Reviewed ${shortDate(i.reviewed as string)}.`;
    if (i.operating && i.operating.mw > 0 && DAY_RE.test(i.operating.asOf)) {
      return post([
        `${head} ${withCommas(i.operating.mw)} MW delivered as of ${shortDate(i.operating.asOf)} (${i.operating.source}). Planned: ${planned}, a different basis. ${reviewed}`,
        "",
        i.url,
      ]);
    }
    return post([`${head} Planned: ${planned}. ${reviewed}`, "", i.url]);
  }

  if (!i.listAsOf || !DAY_RE.test(i.listAsOf)) return skip("the cluster list carries no data date");
  const age = daysBetween(i.listAsOf, i.today);
  if (age > i.maxListAgeDays) {
    return skip(`this week's project is ${i.name}, which has no recent review, and the cluster list was last refreshed ${i.listAsOf}, ${age} days ago`);
  }
  return post([`${head} Planned: ${planned}. Data as of ${shortDate(i.listAsOf)}.`, "", i.url]);
}

// ── Thursday: the national interconnection queue (LBNL) ────────────────────

export interface QueueInput {
  /** "LBNL's Queued Up 2026" */
  edition: string;
  /** The edition's year, for the staleness guard. */
  editionYear: number;
  /** Generation and storage capacity waiting to connect, GW. */
  gw: number;
  projects: number | null;
  /** "the end of 2025" */
  asOf: string;
}

export function buildQueuePost(i: QueueInput | null, todayYear: number): PostResult {
  if (!i || !(i.gw > 0) || !i.asOf || !i.edition) return skip("the queue headline is missing its total, edition or date");
  if (i.editionYear < todayYear - 1) return skip(`the newest queue edition on file is ${i.editionYear}, too old to post as current`);
  const projects = i.projects && i.projects > 0 ? `, across about ${withCommas(i.projects)} projects` : "";
  return post([
    `${i.edition}: about ${withCommas(i.gw)} GW of generation and storage was waiting to connect to the US grid at ${i.asOf}${projects}. A queue request is not a commitment to build.`,
    "",
    "https://gridtilt.com/power-map?tab=queue",
  ]);
}

// ── Friday: one documented change (the change log) ─────────────────────────

export interface ChangeInput {
  kind: "correction" | "update";
  /** Short display values from the change-log entry. */
  label: string;
  before: string;
  after: string;
  /** A short source name. */
  source: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD */
  sourceDate: string;
  reviewed: string;
  url: string;
}

export const CHANGE_WINDOW_DAYS = 7;

export function buildChangePost(change: ChangeInput | null, today: string): PostResult {
  if (!change) return skip("no documented change with a short form is on record");
  const age = daysBetween(change.reviewed, today);
  if (age < 0 || age > CHANGE_WINDOW_DAYS) return skip(`no documented change in the last ${CHANGE_WINDOW_DAYS} days; the latest was reviewed ${change.reviewed}`);
  const kind = change.kind === "correction" ? "Correction" : "Update";
  return post([
    `${kind}, ${shortDate(change.reviewed)}: ${change.label}. Before: ${change.before}. Now: ${change.after}. Source: ${change.source}, ${shortDate(change.sourceDate)}.`,
    "",
    change.url,
  ]);
}

// ── On-demand: top movers (real market moves, manual dry-run only) ──────────

export interface MoverLite {
  ticker: string;
  changePercent: number;
  tag?: string;
}

export function buildTopMoversTweet(movers: MoverLite[]): string {
  const lines = movers.map(
    (s) => `$${s.ticker} ${fmtPct(s.changePercent)}${s.tag ? ` (${s.tag})` : ""}`,
  );

  const upCount = movers.filter((s) => s.changePercent > 0).length;
  const downCount = movers.length - upCount;

  const tagCounts: Record<string, number> = {};
  for (const s of movers) if (s.tag) tagCounts[s.tag] = (tagCounts[s.tag] ?? 0) + 1;
  const repeated = Object.entries(tagCounts).find(([, n]) => n >= 2);

  let line: string;
  if (repeated) {
    const tag = repeated[0];
    const rep = movers.filter((s) => s.tag === tag);
    const repUp = rep.filter((s) => s.changePercent > 0).length;
    const dir = repUp === rep.length ? (rep.length === 2 ? "both up" : "all up") : repUp === 0 ? (rep.length === 2 ? "both down" : "all down") : "split";
    line = `${tag} repeats at the top, ${dir}.`;
  } else if (downCount === movers.length) {
    line = `all ${movers.length} down.`;
  } else if (upCount === movers.length) {
    line = `all ${movers.length} up.`;
  } else {
    line = `${upCount} up, ${downCount} down, no sector repeating.`;
  }

  return [
    "today's biggest moves in ai infra:",
    "",
    ...lines,
    "",
    line,
    "",
    "https://gridtilt.com/stack",
  ].join("\n");
}

// ── On-demand: catalyst preview (real calendar, manual dry-run only) ────────

export interface CatalystLite {
  date: string;
  title: string; // curated case, KEPT as written (tickers/acronyms stay caps)
  tier1?: boolean;
  /** For a month window or an estimate ("Oct 2026", "around Oct 15"); replaces the weekday date. */
  label?: string;
}

export function buildCatalystTweet(upcoming: CatalystLite[]): string {
  if (upcoming.length === 0) {
    return [
      "this week on the ai infra calendar:",
      "",
      "nothing scheduled. quiet docket.",
      "",
      "https://gridtilt.com/catalysts",
    ].join("\n");
  }

  const lines = upcoming.map((c) => {
    // YYYY-MM-DD parses as UTC midnight, which renders a day early in US
    // timezones; anchor to noon so the labeled weekday matches the date.
    const iso = c.date.length === 10 ? `${c.date}T12:00:00` : c.date;
    const d = new Date(iso).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return `${c.label ?? d}: ${c.title}`;
  });

  const tier1 = upcoming.find((c) => c.tier1);
  const tail = tier1 ? `the one to watch: ${tier1.title}.` : "no tier-1 earnings on the docket.";

  return [
    "this week on the ai infra calendar:",
    "",
    ...lines,
    "",
    tail,
    "",
    "https://gridtilt.com/catalysts",
  ].join("\n");
}
