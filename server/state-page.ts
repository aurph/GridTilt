// ─── State pages (/state/:slug) ──────────────────────────────────────────────
//
// One composed record per published state, used three ways so they cannot
// differ: the JSON the client page renders (/api/state-pages/:slug), the facts
// written into the page's HTML for readers and crawlers without JavaScript,
// and the page's metadata. Grid facts come from the server copy of My Grid's
// tables (state-facts.ts); projects come from the Compute Frontier records and
// the 400 MW facility registry; documents and dates are hand-curated in
// server/data/state-pages.json with the day they were last reviewed.
//
// The interactive tool stays at /my-grid?state=XX, whose canonical is
// /my-grid; the state page is the one indexable address for the state.

import { readFileSync } from "fs";
import { join } from "path";
import { STATES, STATE_NERC_NOTE, NERC_LTRA, REGION_AREAS, NERC_AREAS, areaForState, cushion, type NercAreaFact } from "./state-facts";

const SITE = "https://gridtilt.com";

export interface StateDocument {
  /** YYYY-MM-DD, the document's own date. */
  date: string;
  jurisdiction: string;
  title: string;
  /** What the document says, in plain words, and nothing it does not. */
  summary: string;
  source: string;
  url: string;
}

export interface StateNextDate {
  date: string;
  what: string;
  source: string;
  url: string;
}

export interface CuratedState {
  code: string;
  slug: string;
  /** YYYY-MM-DD: every document and date was checked against its source that day. */
  reviewed: string;
  /** The state's own consumer explanation of what is on a bill. */
  billSource: { source: string; url: string };
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
  /** The planned figure is a GridTilt estimate or an announced target. */
  plannedEstimated: boolean;
  city: string | null;
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
  documents: StateDocument[];
  nextDates: StateNextDate[];
  billSource: { source: string; url: string };
  reviewed: string;
  canonical: string;
  myGridUrl: string;
}

/** The facility registry's floor, the same filter My Grid applies. */
export const REGISTRY_FLOOR_MW = 400;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z][a-z-]{1,40}$/;

/** Every problem with the curated file; empty when it is valid. */
export function validateStatePages(raw: unknown): string[] {
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
    if (!STATES[s?.code]) errors.push(`${at}: code is not a state My Grid covers`);
    else if (codes.has(s.code)) errors.push(`${at}: duplicate code`);
    else codes.add(s.code);
    if (typeof s?.slug !== "string" || !SLUG.test(s.slug)) errors.push(`${at}: slug must be lowercase words`);
    else if (slugs.has(s.slug)) errors.push(`${at}: duplicate slug`);
    else slugs.add(s.slug);
    if (typeof s?.reviewed !== "string" || !DAY.test(s.reviewed)) errors.push(`${at}: reviewed must be YYYY-MM-DD`);
    if (!text(s?.billSource?.source) || !https(s?.billSource?.url)) errors.push(`${at}: billSource needs a source and an https url`);
    if (!Array.isArray(s?.documents)) errors.push(`${at}: documents must be a list`);
    else
      s.documents.forEach((d: any, j: number) => {
        const where = `${at}.documents[${j}]`;
        if (typeof d?.date !== "string" || !DAY.test(d.date)) errors.push(`${where}: date must be YYYY-MM-DD`);
        else if (typeof s.reviewed === "string" && d.date > s.reviewed) errors.push(`${where}: dated after the review`);
        for (const k of ["jurisdiction", "title", "summary", "source"]) if (!text(d?.[k])) errors.push(`${where}: ${k} is required`);
        if (!https(d?.url)) errors.push(`${where}: url must be https`);
      });
    if (!Array.isArray(s?.nextDates)) errors.push(`${at}: nextDates must be a list`);
    else
      s.nextDates.forEach((d: any, j: number) => {
        const where = `${at}.nextDates[${j}]`;
        if (typeof d?.date !== "string" || !DAY.test(d.date)) errors.push(`${where}: date must be YYYY-MM-DD`);
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
    location?: { state?: string; city?: string };
  }>;
  facilities: Array<{ state: string; powerMW: number | null }>;
  /** Eastern YYYY-MM-DD; dates before it drop out of "next dates". */
  today: string;
}

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
    documents: [...curated.documents].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    nextDates: curated.nextDates.filter((d) => d.date >= input.today).sort((a, b) => (a.date < b.date ? -1 : 1)),
    billSource: curated.billSource,
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
  out.push(p(`Reviewed ${esc(longDate(d.reviewed))}. ${a(d.myGridUrl, `Open ${d.name} in My Grid`)}.`));

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
  if (d.documents.length === 0) out.push(p("None recorded yet."));
  else {
    out.push(`<ul>`);
    for (const doc of d.documents) {
      out.push(`<li><strong>${esc(longDate(doc.date))}, ${esc(doc.jurisdiction)}: ${esc(doc.title)}.</strong> ${esc(doc.summary)} ${a(doc.url, doc.source)}</li>`);
    }
    out.push(`</ul>`);
  }

  out.push(`<h2>Next public dates</h2>`);
  if (d.nextDates.length === 0) out.push(p("None recorded."));
  else {
    out.push(`<ul>`);
    for (const n of d.nextDates) out.push(`<li>${esc(longDate(n.date))}: ${esc(n.what)}. ${a(n.url, n.source)}</li>`);
    out.push(`</ul>`);
  }

  out.push(`<h2>Data center projects GridTilt records here</h2>`);
  if (d.projects.length === 0) out.push(p(`None recorded. GridTilt's records are not a complete list of the state's data centers.`));
  else {
    out.push(`<ul>`);
    for (const pr of d.projects) {
      const mw = pr.plannedMW ? `, ${pr.plannedMW.toLocaleString("en-US")} MW planned${pr.plannedEstimated ? " (estimate)" : ""}` : "";
      out.push(`<li>${a(pr.url, pr.name)}: ${esc(pr.operator)}${pr.city ? `, ${esc(pr.city)}` : ""}; ${esc(STATUS_WORDS[pr.status] ?? pr.status)}${mw}.</li>`);
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
      `A bill has a delivery part, set by the state's utility regulator in rate cases, and a supply part bought on the market (${a(d.billSource.url, d.billSource.source)}). A statewide average price blends every utility and customer, and nothing on this page shows how much any project or power line added to a household's bill. EIA publishes average prices by state: ${a("https://www.eia.gov/electricity/monthly/epm_table_grapher.php?t=epmt_5_6_a", "Electric Power Monthly, Table 5.6.A")}.`,
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
function readCurated(): CuratedStates | null {
  try {
    const raw = readData("state-pages.json");
    const errors = validateStatePages(raw);
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
export function loadStatePageSlugs(): Array<{ slug: string; code: string; reviewed: string }> {
  const curated = readCurated();
  return curated ? statePageSlugs(curated) : [];
}

/** The composed page for a slug, or null when no page is published under it. */
export function loadStatePage(slug: string, today: string = easternToday()): StatePageData | null {
  const curated = readCurated();
  if (!curated || !curated.states.some((s) => s.slug === slug)) return null;
  try {
    return composeStatePage(slug, {
      curated,
      clusters: readData("clusters.json").clusters ?? [],
      facilities: readData("datacenters.json"),
      today,
    });
  } catch (e) {
    console.error("state page could not be composed:", (e as Error)?.message);
    return null;
  }
}

/** The page's facts as HTML for an address, when the address is a published state page. */
export function statePagePrerender(pathname: string, today: string = easternToday()): string | null {
  const m = /^\/state\/([a-z][a-z-]{1,40})$/.exec(pathname);
  const page = m ? loadStatePage(m[1], today) : null;
  return page ? renderStateHtml(page) : null;
}

/** Writes the rendered facts into the shell's empty #root. Returns the html unchanged when there is no empty root. */
export function injectStateHtml(html: string, body: string): string {
  return html.includes(`<div id="root"></div>`) ? html.replace(`<div id="root"></div>`, `<div id="root">${body}</div>`) : html;
}
