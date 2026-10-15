// ─── Timeline: dated events across GridTilt's datasets ──────────────────────
//
// One event list built from the records that carry a real, day-precise date.
// Pure: callers read the files and pass the parsed data in; nothing here
// fetches, so building the timeline can never reach a provider API.
//
// Rules every builder follows:
//   - A record without a valid YYYY-MM-DD date produces no event. Dates are
//     copied from the record, never derived, estimated or defaulted.
//   - Titles come from fixed templates over record fields. No free text is
//     generated.
//   - Same input, same output: ids derive from source ids and the final list
//     is sorted on (date, type, id).

import { normalizeOfftaker, isPowerAgreement, type DealProject } from "./deals";
import { knownTicker } from "./company-registry";
import { isDay, isHttps, sourcedAnnouncement } from "./announced";

export const TIMELINE_EVENT_TYPES = [
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
export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

/** How big an event is, typed per unit. Estimated figures are never carried. */
export type Magnitude =
  | { unit: "MW"; value: number; qualifier?: "up to" | "rated" | "planned" }
  | { unit: "GPUs"; value: number }
  | { unit: "USD/GPU-hr"; value: number; direction: "above" | "below" }
  | { unit: "USD/M tokens"; value: number };

/** What the date means for this event. */
export type DateBasis = "announced" | "released" | "published" | "scheduled" | "issued" | "corrected" | "observed" | "priced";

export interface TimelineEvent {
  id: string;
  date: string; // YYYY-MM-DD
  dateBasis: DateBasis;
  eventType: TimelineEventType;
  title: string;
  description?: string;
  magnitude?: Magnitude;
  relatedTickers?: string[];
  /** The GridTilt route the event belongs to, e.g. "/power-map". */
  sourceTool: string;
  /** In-app path to the exact record. */
  sourceUrl: string;
  /** Original external sources, https only. */
  sourceLinks: string[];
  /** Stable key of the source record ("deal:<id>", "cluster:<id>", "ticker:<T>"), for record filters. */
  recordKey: string;
}

export { isDay, sourcedAnnouncement };

const httpsOnly = (list: unknown[] | undefined): string[] => Array.from(new Set((list ?? []).filter(isHttps)));

// Company names as they appear in deal, cluster and lab records, mapped to the
// tickers GridTilt has stock pages for. Matched on whole words; a name not in
// this table gets no ticker.
const COMPANY_TICKERS: Array<[RegExp, string]> = [
  [/\bmicrosoft\b/i, "MSFT"],
  [/\b(google|alphabet)\b/i, "GOOGL"],
  [/\bmeta\b/i, "META"],
  [/\b(amazon|aws)\b/i, "AMZN"],
  [/\bnvidia\b/i, "NVDA"],
  [/\bamd\b/i, "AMD"],
  [/\btesla\b/i, "TSLA"],
  [/\bconstellation\b/i, "CEG"],
  [/\bvistra\b/i, "VST"],
  [/\btalen\b/i, "TLN"],
  [/\bnrg\b/i, "NRG"],
  [/\boklo\b/i, "OKLO"],
  [/\bnuscale\b/i, "SMR"],
  [/\bnextera\b/i, "NEE"],
  [/\bentergy\b/i, "ETR"],
  [/\bdominion\b/i, "D"],
  [/\bgeorgia power\b|\bsouthern company\b/i, "SO"],
  [/\bduke energy\b/i, "DUK"],
  [/\baes\b/i, "AES"],
  [/\bequinix\b/i, "EQIX"],
  [/\bdigital realty\b/i, "DLR"],
  [/\biren\b/i, "IREN"],
];

export function tickersFor(...names: Array<string | null | undefined>): string[] {
  const text = names.filter(Boolean).join(" ");
  const out: string[] = [];
  for (const [re, t] of COMPANY_TICKERS) if (re.test(text) && knownTicker(t) && !out.includes(t)) out.push(t);
  return out;
}

// ─── Power deals ────────────────────────────────────────────────────────────

/** A deal row with its sourced announcement date. Both fields or neither. */
export interface DatedDeal extends DealProject {
  announced?: string;
  announcedSource?: string;
}

/**
 * A party's name as it reads in a title: the curated row keeps notes in
 * parentheses ("Avangrid (Iberdrola)", "Amentum (NNSA phased lease)"); titles
 * drop them. The full string stays on the record.
 */
export function partyName(raw: string): string {
  return raw.replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim() || raw;
}

export function buildDealEvents(projects: DatedDeal[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const p of projects) {
    // Company-wide rollups, rulings and power not sold to an AI buyer are not
    // AI power deals; the deal templates would misdescribe them.
    if (p.category === "aggregate" || p.category === "regulatory" || p.firmness === "not-ai-offtake") continue;
    const a = sourcedAnnouncement(p);
    if (!a) continue;
    const agreement = isPowerAgreement(p);
    const buyer = p.offtaker ? normalizeOfftaker(p.offtaker) : null;
    const undisclosed = !buyer || /^(undisclosed|multiple)/i.test(buyer);
    // A purchase agreement names both sides. Leases, campuses, acquisitions and
    // generation projects are named by their sponsor and project instead.
    const ppa = p.category === "ppa";
    const sponsor = partyName(p.sponsor);
    const title = !ppa
      ? `${sponsor} announced ${p.projectName}`
      : undisclosed
        ? `${sponsor} announced a power deal with an undisclosed buyer`
        : `${partyName(buyer)} announced a power deal with ${sponsor}`;
    const description = ppa ? p.projectName : p.offtaker ?? undefined;
    const mw = typeof p.capacityMW === "number" && p.capacityMW > 0 ? p.capacityMW : null;
    out.push({
      id: `power_deal:${p.id}`,
      date: a.date,
      dateBasis: "announced",
      eventType: "power_deal",
      title,
      ...(description ? { description } : {}),
      ...(mw ? { magnitude: { unit: "MW" as const, value: mw, ...(p.upTo ? { qualifier: "up to" as const } : {}) } } : {}),
      relatedTickers: tickersFor(p.sponsor, p.offtaker),
      sourceTool: "/power-map",
      sourceUrl: agreement ? `/power-map?tab=deals&deal=${encodeURIComponent(p.id)}` : "/power-map?tab=queue",
      sourceLinks: [a.source, ...httpsOnly(p.sources).filter((u) => u !== a.source)],
      recordKey: `deal:${p.id}`,
    });
  }
  return out;
}

// ─── Compute Frontier clusters ──────────────────────────────────────────────

export interface ClusterRecord {
  id: string;
  name: string;
  operator: string;
  gpuCount: number | null;
  ratedPowerMW: number | null;
  plannedPowerMW: number | null;
  estimated: string[];
  sources: string[];
  announced?: string;
  announcedSource?: string;
}

/** GPU count, else rated, else planned power; only a figure the record does not flag as estimated. */
export function clusterMagnitude(c: ClusterRecord): Magnitude | undefined {
  const est = new Set(c.estimated ?? []);
  if (typeof c.gpuCount === "number" && c.gpuCount > 0 && !est.has("gpuCount")) return { unit: "GPUs", value: c.gpuCount };
  if (typeof c.ratedPowerMW === "number" && c.ratedPowerMW > 0 && !est.has("ratedPowerMW")) return { unit: "MW", value: c.ratedPowerMW, qualifier: "rated" };
  if (typeof c.plannedPowerMW === "number" && c.plannedPowerMW > 0 && !est.has("plannedPowerMW")) return { unit: "MW", value: c.plannedPowerMW, qualifier: "planned" };
  return undefined;
}

export function buildClusterEvents(clusters: ClusterRecord[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const c of clusters) {
    const a = sourcedAnnouncement(c);
    if (!a) continue;
    const magnitude = clusterMagnitude(c);
    out.push({
      id: `cluster_announced:${c.id}`,
      date: a.date,
      dateBasis: "announced",
      eventType: "cluster_announced",
      title: `${partyName(c.operator)} announced ${c.name}`,
      ...(magnitude ? { magnitude } : {}),
      relatedTickers: tickersFor(c.operator, c.name),
      sourceTool: "/compute-frontier",
      sourceUrl: `/compute-frontier/${encodeURIComponent(c.id)}`,
      sourceLinks: [a.source, ...httpsOnly(c.sources).filter((u) => u !== a.source)],
      recordKey: `cluster:${c.id}`,
    });
  }
  return out;
}

// ─── Earnings ───────────────────────────────────────────────────────────────

export interface EarningsDate {
  ticker: string;
  company: string;
  date: string;
  /** "confirmed" only when Yahoo does not flag the date as an estimate. */
  dateStatus: "confirmed" | "estimated";
}

/**
 * A chosen next-report day is confirmed only when Yahoo's calendarEvents says
 * its earnings dates are not an estimate AND the chosen day is one of those
 * dates. A day that came only from quote timestamps, or any flag other than an
 * explicit false, counts as an estimate.
 */
export function earningsDateStatus(chosenDay: string, calendarDays: string[], isEarningsDateEstimate: unknown): "confirmed" | "estimated" {
  return isEarningsDateEstimate === false && calendarDays.includes(chosenDay) ? "confirmed" : "estimated";
}

/** Confirmed upcoming report dates become events; estimates never do. */
export function buildEarningsEvents(items: EarningsDate[]): TimelineEvent[] {
  return items
    .filter((e) => e.dateStatus === "confirmed" && isDay(e.date) && knownTicker(e.ticker))
    .map((e) => ({
      id: `earnings:${e.ticker}:${e.date}`,
      date: e.date,
      dateBasis: "scheduled" as const,
      eventType: "earnings" as const,
      title: `${e.company} (${e.ticker}) reports earnings`,
      relatedTickers: [e.ticker],
      sourceTool: "/catalysts",
      sourceUrl: `/stock/${encodeURIComponent(e.ticker)}`,
      sourceLinks: [],
      recordKey: `ticker:${e.ticker}`,
    }));
}

// ─── GPU price milestones ───────────────────────────────────────────────────

export interface PriceSnapshot {
  date: string;
  source?: string;
  prices: Record<string, number>;
}

/** Round-number thresholds: every half dollar per GPU-hour. */
export const PRICE_STEP = 0.5;

/**
 * Crossings of half-dollar thresholds in one model's recorded series. For each
 * threshold t a point is either at-or-above t or below it; a crossing is a
 * change of that state between two consecutive recorded points, dated on the
 * later point. A series that never changes side yields nothing, and a
 * threshold can only be crossed again in the opposite direction.
 */
export function detectPriceCrossings(series: Array<{ date: string; price: number }>, step = PRICE_STEP): Array<{ date: string; threshold: number; direction: "above" | "below"; price: number }> {
  const pts = series
    .filter((p) => isDay(p.date) && typeof p.price === "number" && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: Array<{ date: string; threshold: number; direction: "above" | "below"; price: number }> = [];
  const stepC = Math.round(step * 100);
  for (let i = 1; i < pts.length; i++) {
    const prev = Math.round(pts[i - 1].price * 100);
    const cur = Math.round(pts[i].price * 100);
    if (cur < prev) {
      // Thresholds t with cur < t <= prev, highest first.
      for (let t = Math.floor(prev / stepC) * stepC; t > cur; t -= stepC) {
        if (t > 0) out.push({ date: pts[i].date, threshold: t / 100, direction: "below", price: pts[i].price });
      }
    } else if (cur > prev) {
      // Thresholds t with prev < t <= cur, lowest first.
      for (let t = (Math.floor(prev / stepC) + 1) * stepC; t <= cur; t += stepC) {
        out.push({ date: pts[i].date, threshold: t / 100, direction: "above", price: pts[i].price });
      }
    }
  }
  return out;
}

/**
 * Price milestone events from recorded GPU prices. `permitted` must reflect
 * written permission from the data's providers (GPU_LIVE_SWEEP_ENABLED); while
 * it is false the recorded RunPod/Vast observations are not republished here.
 */
export function buildPriceMilestoneEvents(history: PriceSnapshot[], permitted: boolean): TimelineEvent[] {
  if (!permitted) return [];
  const byModel = new Map<string, Array<{ date: string; price: number }>>();
  for (const s of history) {
    if (s.source !== "live") continue;
    for (const [model, price] of Object.entries(s.prices ?? {})) {
      if (!byModel.has(model)) byModel.set(model, []);
      byModel.get(model)!.push({ date: s.date, price });
    }
  }
  const out: TimelineEvent[] = [];
  for (const model of Array.from(byModel.keys()).sort()) {
    for (const x of detectPriceCrossings(byModel.get(model)!)) {
      out.push({
        id: `price_milestone:${model}:${x.date}:${x.direction}:${x.threshold.toFixed(2)}`,
        date: x.date,
        dateBasis: "observed",
        eventType: "price_milestone",
        title: x.direction === "below"
          ? `${model} median rental price fell below $${x.threshold.toFixed(2)} per GPU-hour`
          : `${model} median rental price reached $${x.threshold.toFixed(2)} per GPU-hour`,
        magnitude: { unit: "USD/GPU-hr", value: x.threshold, direction: x.direction },
        sourceTool: "/neocloud-intel",
        sourceUrl: `/neocloud-intel?gpus=${encodeURIComponent(model)}`,
        sourceLinks: [],
        recordKey: `gpu:${model}`,
      });
    }
  }
  return out;
}

// ─── Frontier model releases ────────────────────────────────────────────────

export interface FrontierModelsRoot {
  labs: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; url: string }>;
  models: Array<{ id: string; labId: string; name: string; releaseDate: string; releaseStatus: string; sourceIds: string[] }>;
}

const LAB_TICKERS: Record<string, string> = { google: "GOOGL", meta: "META" };

export function buildModelReleaseEvents(root: FrontierModelsRoot): TimelineEvent[] {
  const labs = new Map(root.labs.map((l) => [l.id, l.name]));
  const urls = new Map(root.sources.map((s) => [s.id, s.url]));
  const out: TimelineEvent[] = [];
  for (const m of root.models) {
    if (!isDay(m.releaseDate)) continue;
    const lab = labs.get(m.labId);
    if (!lab) continue;
    const verb = m.releaseStatus === "preview" ? "previewed" : m.releaseStatus === "open-weights" ? "released open weights for" : "released";
    const t = LAB_TICKERS[m.labId];
    out.push({
      id: `model_release:${m.id}`,
      date: m.releaseDate,
      dateBasis: "released",
      eventType: "model_release",
      title: `${lab} ${verb} ${m.name}`,
      ...(t && knownTicker(t) ? { relatedTickers: [t] } : {}),
      sourceTool: "/neocloud-intel",
      sourceUrl: "/neocloud-intel?tab=frontier",
      sourceLinks: httpsOnly(m.sourceIds.map((id) => urls.get(id))),
      recordKey: `model:${m.id}`,
    });
  }
  return out;
}

// ─── Token prices ───────────────────────────────────────────────────────────

export interface InferencePricesRoot {
  sources: Array<{ id: string; url: string }>;
  trajectory?: { points: Array<{ id: string; name: string; tier: string; date: string; inputPerMTok: number; sourceId: string }> };
  events?: Array<{ id: string; date: string; headline: string; sourceIds: string[] }>;
}

export function buildTokenPriceEvents(root: InferencePricesRoot): TimelineEvent[] {
  const urls = new Map(root.sources.map((s) => [s.id, s.url]));
  const out: TimelineEvent[] = [];
  for (const p of root.trajectory?.points ?? []) {
    if (!isDay(p.date) || !(p.inputPerMTok > 0)) continue;
    out.push({
      id: `token_price:${p.id}`,
      date: p.date,
      dateBasis: "priced",
      eventType: "token_price",
      title: `OpenAI listed ${p.name} input tokens at $${p.inputPerMTok} per million`,
      magnitude: { unit: "USD/M tokens", value: p.inputPerMTok },
      sourceTool: "/neocloud-intel",
      sourceUrl: "/neocloud-intel?tab=economics",
      sourceLinks: httpsOnly([urls.get(p.sourceId)]),
      recordKey: `token:${p.id}`,
    });
  }
  for (const e of root.events ?? []) {
    if (!isDay(e.date)) continue;
    out.push({
      id: `token_price:${e.id}`,
      date: e.date,
      dateBasis: "announced",
      eventType: "token_price",
      title: "OpenAI cut token prices",
      description: e.headline,
      sourceTool: "/neocloud-intel",
      sourceUrl: "/neocloud-intel?tab=economics",
      sourceLinks: httpsOnly(e.sourceIds.map((id) => urls.get(id))),
      recordKey: `token:${e.id}`,
    });
  }
  return out;
}

// ─── Research posts ─────────────────────────────────────────────────────────

export function buildResearchEvents(articles: Array<{ slug: string; title: string; date: string }>): TimelineEvent[] {
  return articles
    .filter((a) => isDay(a.date) && typeof a.slug === "string" && typeof a.title === "string")
    .map((a) => ({
      id: `research:${a.slug}`,
      date: a.date,
      dateBasis: "published" as const,
      eventType: "research" as const,
      title: `GridTilt published "${a.title}"`,
      sourceTool: "/blog",
      sourceUrl: `/blog/${encodeURIComponent(a.slug)}`,
      sourceLinks: [],
      recordKey: `post:${a.slug}`,
    }));
}

// ─── State pages ────────────────────────────────────────────────────────────

export interface StatePagesRoot {
  states: Array<{
    slug: string;
    code: string;
    documents?: Array<{ date: string; jurisdiction: string; title: string; url?: string }>;
    nextDates?: Array<{ date: string; through?: string; what: string; url?: string }>;
  }>;
}

export function buildStateEvents(root: StatePagesRoot): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const s of root.states) {
    (s.documents ?? []).forEach((d, i) => {
      if (!isDay(d.date)) return;
      out.push({
        id: `state_action:${s.slug}:doc:${d.date}:${i}`,
        date: d.date,
        dateBasis: "issued",
        eventType: "state_action",
        title: `${d.jurisdiction}: ${d.title}`,
        sourceTool: "/state",
        sourceUrl: `/state/${encodeURIComponent(s.slug)}`,
        sourceLinks: httpsOnly([d.url]),
        recordKey: `state:${s.slug}`,
      });
    });
    (s.nextDates ?? []).forEach((d, i) => {
      if (!isDay(d.date)) return;
      out.push({
        id: `state_action:${s.slug}:next:${d.date}:${i}`,
        date: d.date,
        dateBasis: "scheduled",
        eventType: "state_action",
        title: d.what,
        ...(isDay(d.through) ? { description: `Through ${d.through}.` } : {}),
        sourceTool: "/state",
        sourceUrl: `/state/${encodeURIComponent(s.slug)}`,
        sourceLinks: httpsOnly([d.url]),
        recordKey: `state:${s.slug}`,
      });
    });
  }
  return out;
}

// ─── Published corrections ──────────────────────────────────────────────────

export interface ChangeLogRoot {
  changes: Array<{ id: string; kind: string; reviewed: string; sourceUrl?: string; short?: { label: string; before: string; after: string; url: string } }>;
}

/** A gridtilt.com URL reduced to its in-app path; anything else is not a GridTilt link. */
export function inAppPath(url: string | undefined): string | null {
  if (!url) return null;
  const m = /^https:\/\/(?:www\.)?gridtilt\.com(\/[^\s]*)?$/.exec(url);
  return m ? m[1] || "/" : null;
}

export function buildCorrectionEvents(root: ChangeLogRoot): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const c of root.changes) {
    if (!isDay(c.reviewed) || !c.short) continue;
    const path = inAppPath(c.short.url);
    if (!path) continue;
    out.push({
      id: `correction:${c.id}`,
      date: c.reviewed,
      dateBasis: "corrected",
      eventType: "correction",
      title: `Correction: ${c.short.label}`,
      description: `Was ${c.short.before}. Now ${c.short.after}.`,
      sourceTool: path.split("?")[0].split("/").slice(0, 2).join("/") || "/",
      sourceUrl: path,
      sourceLinks: httpsOnly([c.sourceUrl]),
      recordKey: `correction:${c.id}`,
    });
  }
  return out;
}

// ─── Assembly ───────────────────────────────────────────────────────────────

export interface TimelineInputs {
  deals: DatedDeal[];
  clusters: ClusterRecord[];
  earnings: EarningsDate[];
  gpuHistory: PriceSnapshot[];
  gpuDataPermitted: boolean;
  frontierModels: FrontierModelsRoot;
  inferencePrices: InferencePricesRoot;
  articles: Array<{ slug: string; title: string; date: string }>;
  statePages: StatePagesRoot;
  changeLog: ChangeLogRoot;
}

const TYPE_ORDER = new Map(TIMELINE_EVENT_TYPES.map((t, i) => [t, i]));

/** Newest first; ties by type order, then id. */
export function compareEvents(a: TimelineEvent, b: TimelineEvent): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ta = TYPE_ORDER.get(a.eventType)!;
  const tb = TYPE_ORDER.get(b.eventType)!;
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildTimeline(input: TimelineInputs): TimelineEvent[] {
  const all = [
    ...buildDealEvents(input.deals),
    ...buildClusterEvents(input.clusters),
    ...buildEarningsEvents(input.earnings),
    ...buildPriceMilestoneEvents(input.gpuHistory, input.gpuDataPermitted),
    ...buildModelReleaseEvents(input.frontierModels),
    ...buildTokenPriceEvents(input.inferencePrices),
    ...buildResearchEvents(input.articles),
    ...buildStateEvents(input.statePages),
    ...buildCorrectionEvents(input.changeLog),
  ];
  const seen = new Set<string>();
  const unique = all.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  return unique.sort(compareEvents);
}

