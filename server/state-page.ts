// ─── State pages (/state/:slug) ──────────────────────────────────────────────
//
// One composed record per published state, used three ways so they cannot
// differ: the JSON the client page renders (/api/state-pages/:slug), the facts
// written into the page's HTML for readers and crawlers without JavaScript,
// and the page's metadata. Grid facts come from the server copy of My Grid's
// tables (state-facts.ts); projects come from the Compute Frontier records and
// the 400 MW facility registry; documents and dates are hand-curated in
// server/data/state-pages.json with the day they were checked.
//
// The interactive tool stays at /my-grid?state=XX, whose canonical is
// /my-grid; the state page is the one indexable address for the state.

import { readFileSync } from "fs";
import { join } from "path";
import { STATES, STATE_NERC_NOTE, NERC_LTRA, REGION_AREAS, NERC_AREAS, areaForState, cushion, type NercAreaFact } from "./state-facts";

const SITE = "https://gridtilt.com";

/** EIA's own table of average prices by state. */
export const EIA_STATE_PRICES_URL = "https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a";

export interface StateDocument {
  /**
   * "decision": something an authority decided or ordered on that date.
   * "status": a snapshot of where things stood on that date (a map, a list),
   * which decides nothing on it. Defaults to "decision".
   */
  kind?: "decision" | "status";
  /** YYYY-MM-DD: the document's own date (for a status record, its as-of date). */
  date: string;
  jurisdiction: string;
  title: string;
  /** What the document says, in its own terms and tense, and nothing it does not. */
  summary: string;
  source: string;
  url: string;
}

export interface StateNextDate {
  date: string;
  /** Last day, for an event that runs over several days. */
  through?: string;
  what: string;
  source: string;
  url: string;
}

export interface CuratedState {
  code: string;
  /** The state's name in lowercase words: "maryland", "new-york". */
  slug: string;
  /** YYYY-MM-DD: every document, date and the bill source were checked that day. */
  reviewed: string;
  /** What is on a bill, as the state's own consumer source explains it. */
  bill: { explanation: string; source: string; url: string };
  documents: StateDocument[];
  nextDates: StateNextDate[];
}

export interface CuratedStates {
  states: CuratedState[];
}

export interface StateProject {
  id: string;
  name: string;
  operator: string;
  status: string;
  plannedMW: number | null;
  /** The planned figure is a GridTilt estimate or an announced target not yet realized. */
  plannedEstimated: boolean;
  city: string | null;
  /** The record's field-by-field review date, or null when it has none. */
  reviewed: string | null;
  url: string;
}

export interface StatePageData {
  code: string;
  slug: string;
  name: string;
  operatorLabel: string;
  operatorNote: string | null;
  /** The NERC area My Grid shows for the state, or null with the reason in nercGap. */
  nerc: { key: string; label: string; season: string; margin: number; reference: number; referenceDefault: boolean; risk: string; outlook: string | null; cushion: number } | null;
  nercGap: string | null;
  /** Where another NERC area covers part of the state. */
  nercNote: string | null;
  nercSource: { label: string; url: string };
  registry: { floorMW: number; tracked: number };
  projects: StateProject[];
  /** Decisions, newest first. */
  documents: StateDocument[];
  /** Status snapshots, newest first. */
  statusRecords: StateDocument[];
  nextDates: StateNextDate[];
  bill: { explanation: string; source: string; url: string };
  /** The day the curated rows (documents, dates, bill source) were checked. */
  reviewed: string;
  canonical: string;
  myGridUrl: string;
}

/** The facility registry's floor, the same filter My Grid applies. */
export const REGISTRY_FLOOR_MW = 400;

const SLUG = /^[a-z][a-z-]{1,40}$/;

/** A real calendar day written YYYY-MM-DD. */
function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v;
}

/** "Maryland" -> "maryland", "District of Columbia" -> "district-of-columbia". */
export function slugForState(name: string): string {
  return name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Every problem with the curated file; empty when it is valid. With `today`,
 * a review dated after it is an error too.
 */
export function validateStatePages(raw: unknown, today?: string): string[] {
  const errors: string[] = [];
  const states = (raw as { states?: unknown })?.states;
  if (!Array.isArray(states)) return ["states must be a list"];
  const slugs = new Set<string>();
  const codes = new Set<string>();
  const https = (u: unknown) => {
    try {
      return new URL(String(u)).protocol === "https:";
    } catch {
      return false;
    }
  };
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  states.forEach((s: any, i) => {
    const at = `states[${i}]${typeof s?.code === "string" ? ` (${s.code})` : ""}`;
    const known = STATES[s?.code];
    if (!known) errors.push(`${at}: code is not a state My Grid covers`);
    else if (codes.has(s.code)) errors.push(`${at}: duplicate code`);
    else codes.add(s.code);
    if (typeof s?.slug !== "string" || !SLUG.test(s.slug)) errors.push(`${at}: slug must be lowercase words`);
    else if (known && s.slug !== slugForState(known.name)) errors.push(`${at}: slug must be "${slugForState(known.name)}", the state's name`);
    else if (slugs.has(s.slug)) errors.push(`${at}: duplicate slug`);
    else slugs.add(s.slug);
    if (!isDay(s?.reviewed)) errors.push(`${at}: reviewed must be a real YYYY-MM-DD day`);
    else if (today && s.reviewed > today) errors.push(`${at}: reviewed is after today`);
    if (!text(s?.bill?.explanation) || !text(s?.bill?.source) || !https(s?.bill?.url)) {
      errors.push(`${at}: bill needs an explanation, a source and an https url`);
    }
    if (!Array.isArray(s?.documents)) errors.push(`${at}: documents must be a list`);
    else
      s.documents.forEach((d: any, j: number) => {
        const where = `${at}.documents[${j}]`;
        if (d?.kind !== undefined && d.kind !== "decision" && d.kind !== "status") errors.push(`${where}: kind must be decision or status`);
        if (!isDay(d?.date)) errors.push(`${where}: date must be a real YYYY-MM-DD day`);
        else if (typeof s.reviewed === "string" && d.date > s.reviewed) errors.push(`${where}: dated after the review`);
        for (const k of ["jurisdiction", "title", "summary", "source"]) if (!text(d?.[k])) errors.push(`${where}: ${k} is required`);
        if (!https(d?.url)) errors.push(`${where}: url must be https`);
      });
    if (!Array.isArray(s?.nextDates)) errors.push(`${at}: nextDates must be a list`);
    else
      s.nextDates.forEach((d: any, j: number) => {
        const where = `${at}.nextDates[${j}]`;
        if (!isDay(d?.date)) errors.push(`${where}: date must be a real YYYY-MM-DD day`);
        if (d?.through !== undefined && (!isDay(d.through) || (isDay(d?.date) && d.through < d.date))) errors.push(`${where}: through must be a real day on or after date`);
        for (const k of ["what", "source"]) if (!text(d?.[k])) errors.push(`${where}: ${k} is required`);
        if (!https(d?.url)) errors.push(`${where}: url must be https`);
      });
  });
  return errors;
}

/** The published slugs, for routing, metadata and the sitemap. */
export function statePageSlugs(curated: CuratedStates): Array<{ slug: string; code: string; reviewed: string }> {
  return curated.states.map((s) => ({ slug: s.slug, code: s.code, reviewed: s.reviewed }));
}

export interface StatePageInput {
  curated: CuratedStates;
  clusters: Array<{
    id: string;
    name: string;
    operator: string;
    status: string;
    plannedPowerMW?: number | null;
    estimated?: string[];
    reviewed?: string;
    location?: { state?: string; city?: string };
  }>;
  facilities: Array<{ state: string; powerMW: number | null }>;
  /** Eastern YYYY-MM-DD; events over before it drop out of "next dates". */
  today: string;
}

const newestFirst = (a: StateDocument, b: StateDocument) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export function composeStatePage(slug: string, input: StatePageInput): StatePageData | null {
  const curated = input.curated.states.find((s) => s.slug === slug);
  const s = curated ? STATES[curated.code] : undefined;
  if (!curated || !s) return null;
  const code = curated.code;
  const area: NercAreaFact | null = areaForState(code);
  const regionAreas = s.region ? (REGION_AREAS[s.region] ?? []).map((k) => NERC_AREAS[k]).filter(Boolean) : [];

  const projects = input.clusters
    .filter((c) => c.location?.state === code)
    .map((c) => ({
      id: c.id,
      name: String(c.name).replace(/\s*\([^)]*\)\s*$/, "").trim(),
      operator: c.operator,
      status: c.status,
      plannedMW: typeof c.plannedPowerMW === "number" && c.plannedPowerMW > 0 ? c.plannedPowerMW : null,
      plannedEstimated: (c.estimated ?? []).includes("plannedPowerMW"),
      city: c.location?.city ?? null,
      reviewed: isDay(c.reviewed) ? c.reviewed : null,
      url: `${SITE}/compute-frontier/${c.id}`,
    }))
    .sort((a, b) => (b.plannedMW ?? 0) - (a.plannedMW ?? 0) || a.id.localeCompare(b.id));

  return {
    code,
    slug,
    name: s.name,
    operatorLabel: s.operatorLabel,
    operatorNote: s.note ?? null,
    nerc: area
      ? {
          key: area.key,
          label: area.label,
          season: area.season,
          margin: area.margin,
          reference: area.reference,
          referenceDefault: Boolean(area.referenceDefault),
          risk: area.risk,
          outlook: area.outlook ?? null,
          cushion: cushion(area),
        }
      : null,
    nercGap: area
      ? null
      : regionAreas.length > 1
        ? `NERC reports ${s.region} by sub-area, and ${s.name} is not assigned to one of them here.`
        : `No NERC assessment area covers ${s.name}'s grid.`,
    nercNote: STATE_NERC_NOTE[code] ?? null,
    nercSource: { label: NERC_LTRA.label, url: NERC_LTRA.url },
    registry: {
      floorMW: REGISTRY_FLOOR_MW,
      tracked: input.facilities.filter((f) => f.state === code && (f.powerMW ?? 0) >= REGISTRY_FLOOR_MW).length,
    },
    projects,
    documents: curated.documents.filter((d) => (d.kind ?? "decision") === "decision").sort(newestFirst),
    statusRecords: curated.documents.filter((d) => d.kind === "status").sort(newestFirst),
    // An event stays listed through its last day.
    nextDates: curated.nextDates
      .filter((d) => (d.through ?? d.date) >= input.today)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    bill: curated.bill,
    reviewed: curated.reviewed,
    canonical: `${SITE}/state/${slug}`,
    myGridUrl: `${SITE}/my-grid?state=${code}`,
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-09-14" -> "September 14, 2026" */
export function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}, ${y}` : day;
}

/** "May 11 to 21, 2027" for a span in one month, else both dates in full. */
export function dateSpan(from: string, through?: string): string {
  if (!through || through === from) return longDate(from);
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = through.split("-").map(Number);
  if (fy === ty && fm === tm && MONTHS[fm - 1]) return `${MONTHS[fm - 1]} ${fd} to ${td}, ${fy}`;
  return `${longDate(from)} to ${longDate(through)}`;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const STATUS_WORDS: Record<string, string> = {
  operational: "operating",
  construction: "under construction",
  announced: "announced",
};

/** The page's title tag (seo.ts adds nothing to it). */
export function stateTitle(d: StatePageData): string {
  return `${d.name}'s grid: operator, reliability and data center decisions | GridTilt`;
}

export function stateDescription(d: StatePageData): string {
  const margin = d.nerc ? ` NERC's ${d.nerc.season} reserve margin for ${d.nerc.label}: ${d.nerc.margin.toFixed(1)}%, with a reference level of ${d.nerc.reference}%.` : "";
  return `${d.name}'s grid operator, reliability outlook and recent public decisions on data centers and transmission, each with its date and source.${margin}`.slice(0, 300);
}

/**
 * The page's facts as plain HTML, written into #root so they are in the
 * response itself; the app replaces them when it starts. Every value comes
 * from the composed record, and every string is escaped.
 */
export function renderStateHtml(d: StatePageData): string {
  const p = (t: string) => `<p>${t}</p>`;
  const a = (href: string, label: string) => `<a href="${esc(href)}">${esc(label)}</a>`;
  const out: string[] = [];
  out.push(`<main data-prerender="state-page">`);
  out.push(`<h1>${esc(d.name)}'s grid</h1>`);
  out.push(p(a(d.myGridUrl, `Open ${d.name} in My Grid`)));

  out.push(`<h2>Grid operator and reliability</h2>`);
  out.push(p(`${esc(d.operatorLabel)}.${d.operatorNote ? ` ${esc(d.operatorNote)}` : ""}`));
  if (d.nerc) {
    out.push(
      p(
        `NERC area ${esc(d.nerc.key)}: anticipated reserve margin ${d.nerc.margin.toFixed(1)}% for ${esc(d.nerc.season)}, against ${d.nerc.referenceDefault ? "NERC's default" : "its"} reference level of ${d.nerc.reference}% (${d.nerc.cushion >= 0 ? "+" : ""}${d.nerc.cushion.toFixed(1)} points). NERC rates the area ${esc(d.nerc.risk.toLowerCase())} risk${d.nerc.outlook ? `; later years: ${esc(d.nerc.outlook)}` : ""}.`,
      ),
    );
  } else if (d.nercGap) {
    out.push(p(esc(d.nercGap)));
  }
  if (d.nercNote) out.push(p(esc(d.nercNote)));
  out.push(p(`Source: ${a(d.nercSource.url, d.nercSource.label)}.`));

  out.push(`<h2>Recent public decisions</h2>`);
  out.push(p(`Each checked against its document on ${esc(longDate(d.reviewed))}.`));
  if (d.documents.length === 0) out.push(p("None recorded."));
  else {
    out.push(`<ul>`);
    for (const doc of d.documents) {
      out.push(`<li><strong>${esc(longDate(doc.date))}, ${esc(doc.jurisdiction)}: ${esc(doc.title)}.</strong> ${esc(doc.summary)} ${a(doc.url, doc.source)}</li>`);
    }
    out.push(`</ul>`);
  }

  if (d.statusRecords.length) {
    out.push(`<h2>Where things stood</h2>`);
    out.push(`<ul>`);
    for (const doc of d.statusRecords) {
      out.push(`<li><strong>As of ${esc(longDate(doc.date))}, ${esc(doc.jurisdiction)}: ${esc(doc.title)}.</strong> ${esc(doc.summary)} ${a(doc.url, doc.source)}</li>`);
    }
    out.push(`</ul>`);
  }

  out.push(`<h2>Next public dates</h2>`);
  if (d.nextDates.length === 0) out.push(p("None recorded."));
  else {
    out.push(`<ul>`);
    for (const n of d.nextDates) out.push(`<li>${esc(dateSpan(n.date, n.through))}: ${esc(n.what)}. ${a(n.url, n.source)}</li>`);
    out.push(`</ul>`);
  }

  out.push(`<h2>Data center projects GridTilt records here</h2>`);
  out.push(p("From Compute Frontier records, each with its own sources. An estimate marks a GridTilt estimate or an announced target not yet realized."));
  if (d.projects.length === 0) out.push(p(`None recorded.`));
  else {
    out.push(`<ul>`);
    for (const pr of d.projects) {
      const mw = pr.plannedMW ? `, ${pr.plannedMW.toLocaleString("en-US")} MW planned${pr.plannedEstimated ? " (estimate or announced target)" : ""}` : "";
      const review = pr.reviewed ? `reviewed field by field ${esc(longDate(pr.reviewed))}` : "not yet reviewed field by field";
      out.push(`<li>${a(pr.url, pr.name)}: ${esc(pr.operator)}${pr.city ? `, ${esc(pr.city)}` : ""}; ${esc(STATUS_WORDS[pr.status] ?? pr.status)}${mw}; ${review}.</li>`);
    }
    out.push(`</ul>`);
  }
  out.push(
    p(
      `My Grid's facility map covers campuses of ${d.registry.floorMW} MW and up and lists ${d.registry.tracked} in ${esc(d.name)}. Neither list is a complete count of the state's data centers; a project missing here is not evidence that none exists.`,
    ),
  );

  out.push(`<h2>What this page cannot tell you about a bill</h2>`);
  out.push(
    p(
      `${esc(d.bill.explanation)} (${a(d.bill.url, d.bill.source)}). A statewide residential average blends every utility's residential customers, and nothing on this page shows how much any project or power line added to a household's bill. EIA publishes the averages by state: ${a(EIA_STATE_PRICES_URL, "Electric Power Monthly, Table 5.6.A")}.`,
    ),
  );
  out.push(`</main>`);
  return out.join("\n");
}

// ── Loading (the only IO here) ──────────────────────────────────────────────

const readData = (file: string) => JSON.parse(readFileSync(join(process.cwd(), "server", "data", file), "utf-8"));

/** Today in US Eastern time, YYYY-MM-DD: the calendar the documents' dates use. */
export function easternToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

/**
 * The curated file, or null when it is unreadable or invalid. An invalid
 * file publishes no state page rather than a half-checked one; the errors go
 * to the log, and server/__tests__/state-page.test.ts fails on them first.
 */
function readCurated(today: string): CuratedStates | null {
  try {
    const raw = readData("state-pages.json");
    const errors = validateStatePages(raw, today);
    if (errors.length) {
      console.error(`state-pages.json is invalid; no state page is published: ${errors.join("; ")}`);
      return null;
    }
    return raw as CuratedStates;
  } catch (e) {
    console.error("state-pages.json could not be read:", (e as Error)?.message);
    return null;
  }
}

/** The published pages, for the sitemap and My Grid's link. */
export function loadStatePageSlugs(today: string = easternToday()): Array<{ slug: string; code: string; reviewed: string }> {
  const curated = readCurated(today);
  return curated ? statePageSlugs(curated) : [];
}

/**
 * "page" when the slug is published and composed; "absent" when the curated
 * file is sound and does not publish it (a 404); "unavailable" when the data
 * could not be read or checked (a 503: a fault, not an absence, so a crawler
 * retries instead of dropping the page).
 */
export type StatePageResult = { kind: "page"; page: StatePageData } | { kind: "absent" } | { kind: "unavailable" };

export function loadStatePage(slug: string, today: string = easternToday()): StatePageResult {
  const curated = readCurated(today);
  if (!curated) return { kind: "unavailable" };
  if (!curated.states.some((s) => s.slug === slug)) return { kind: "absent" };
  try {
    const page = composeStatePage(slug, {
      curated,
      clusters: readData("clusters.json").clusters ?? [],
      facilities: readData("datacenters.json"),
      today,
    });
    return page ? { kind: "page", page } : { kind: "absent" };
  } catch (e) {
    console.error("state page could not be composed:", (e as Error)?.message);
    return { kind: "unavailable" };
  }
}

/** The address's slug when it has the shape of a state page address. */
export function stateSlugFromPath(pathname: string): string | null {
  const m = /^\/state\/([a-z][a-z-]{1,40})$/.exec(pathname);
  return m ? m[1] : null;
}

/** The page's facts as HTML for an address, when the address is a published state page. */
export function statePagePrerender(pathname: string, today: string = easternToday()): string | null {
  const slug = stateSlugFromPath(pathname);
  const result = slug ? loadStatePage(slug, today) : null;
  return result?.kind === "page" ? renderStateHtml(result.page) : null;
}

/**
 * Writes the rendered facts into the shell's empty #root. Returns the html
 * unchanged when there is no empty root. The replacement is a function, so
 * "$&", "$'" and "$$" in the text are written as text, not expanded.
 */
export function injectStateHtml(html: string, body: string): string {
  const root = `<div id="root"></div>`;
  return html.includes(root) ? html.replace(root, () => `<div id="root">${body}</div>`) : html;
}
