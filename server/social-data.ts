// ─── What each weekday post and share card says ─────────────────────────────
//
// Pure functions from GridTilt's own parsed files to the inputs of the post
// builders (social-format.ts) and to share cards (og-card.ts). routes.ts reads
// the files and the clock and calls these, so the post and its card draw the
// same facts from the same rows, and both match the page they link to.

import { computeClusterMetrics, type ClusterLite } from "./clusters";
import { formatAsOf, type MapDot, type OgCard, type OgStat } from "./og-card";
import type { Snapshot } from "./gpu-history";
import { sortChanges, type ChangeRecord } from "./change-log";
import {
  shortDate,
  type BuildoutInput,
  type ChangeInput,
  type GpuObservedInput,
  type ProjectInput,
  type QueueInput,
} from "./social-format";
import { NERC_LTRA, STATES, STATE_NERC_NOTE, REGION_AREAS, NERC_AREAS, areaForState, cushion } from "./state-facts";

const SITE = "https://gridtilt.com";

/** Provenance for the cluster list. Keep it specific and true; it is a public claim. */
const SOURCE_CLUSTERS = "company filings, utility records, trade press";

// ── shared ─────────────────────────────────────────────────────────────────

/** Weeks since 1970-01-01 for an Eastern YYYY-MM-DD; turns over on Thursdays. */
export function weekIndex(today: string): number {
  return Math.floor(Date.parse(`${today.slice(0, 10)}T00:00:00Z`) / (7 * 86_400_000));
}

const withCommas = (n: number) => n.toLocaleString("en-US");
const gw = (mw: number) => {
  const g = Math.round(mw / 100) / 10;
  return Number.isInteger(g) ? String(g) : g.toFixed(1);
};
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export interface ClusterEvidence {
  field: string;
  value: string;
  kind?: string;
  basis?: string;
  asOf?: string;
  source: string;
  published?: string;
}

export interface ClusterRecord extends ClusterLite {
  name: string;
  location?: { city?: string; state?: string; lat?: number; lng?: number };
  estimated?: string[];
  sources?: string[];
  reviewed?: string;
  evidence?: ClusterEvidence[];
}

export interface ClusterRoot {
  lastRefreshed?: string;
  clusters?: ClusterRecord[];
}

export function clusterSourceLine(clusters: ClusterRecord[]): string {
  const sourced = clusters.filter((c) => Array.isArray(c.sources) && c.sources.length > 0).length;
  return `${sourced}/${clusters.length} entries sourced · ${SOURCE_CLUSTERS}`;
}

export function clusterDots(clusters: ClusterRecord[], highlightId?: string): MapDot[] {
  return clusters
    .filter((c) => typeof c.location?.lat === "number" && typeof c.location?.lng === "number")
    .map((c) => ({
      lat: c.location!.lat as number,
      lng: c.location!.lng as number,
      mw: c.plannedPowerMW,
      status: c.status,
      ...(highlightId ? { highlight: c.id === highlightId } : {}),
    }));
}

/** "Stargate Abilene (OpenAI/Oracle)" -> "Stargate Abilene". */
export function displayName(c: ClusterRecord): string {
  return String(c.name).replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/** "Abilene, TX", or "TX" when the name already carries the city, or "". */
export function displayPlace(c: ClusterRecord): string {
  const name = displayName(c);
  const city = c.location?.city;
  const state = c.location?.state;
  if (city && state) return name.includes(city) ? state : `${city}, ${state}`;
  return state ?? "";
}

const STATUS_WORDS: Record<string, string> = {
  operational: "operating",
  construction: "under construction",
  announced: "announced",
};

// ── Monday: the tracked clusters by status ─────────────────────────────────

export function buildoutInputFrom(root: ClusterRoot, today: string, maxAgeDays: number): BuildoutInput {
  const m = computeClusterMetrics((root.clusters ?? []) as ClusterLite[]);
  const bucket = (s: string) => {
    const b = m.byStatus.find((x) => x.status === s);
    return { count: b?.count ?? 0, plannedMW: b?.plannedMW ?? 0 };
  };
  return {
    clusterCount: m.clusterCount,
    operational: bucket("operational"),
    construction: bucket("construction"),
    announced: bucket("announced"),
    asOf: root.lastRefreshed ?? null,
    today,
    maxAgeDays,
  };
}

export function buildoutCard(root: ClusterRoot): OgCard {
  const clusters = root.clusters ?? [];
  const i = buildoutInputFrom(root, root.lastRefreshed ?? "", 0);
  return {
    title: "AI compute clusters, by status",
    subtitle: `${withCommas(i.clusterCount)} clusters tracked, not exhaustive. Planned power is the full announced build, not what runs today.`,
    stats: [
      { label: `${i.operational.count} operating`, value: `${gw(i.operational.plannedMW)} GW` },
      { label: `${i.construction.count} building`, value: `${gw(i.construction.plannedMW)} GW` },
      { label: `${i.announced.count} announced`, value: `${gw(i.announced.plannedMW)} GW` },
    ],
    asOf: formatAsOf(root.lastRefreshed),
    source: clusterSourceLine(clusters),
    visual: { kind: "map", dots: clusterDots(clusters), legend: true },
  };
}

// ── Tuesday: observed GPU rental prices ────────────────────────────────────

/** The models the post and card show, in this order, when observed. */
export const GPU_POST_MODELS = ["H100", "H200", "B200", "B300"];

const PROVIDER_NAMES: Record<string, string> = {
  "runpod-secure": "RunPod",
  "runpod-community": "RunPod",
  vast: "Vast.ai",
};

/** The newest live snapshot, or null when none is recorded. */
export function newestLiveSnapshot(history: Snapshot[]): Snapshot | null {
  let best: Snapshot | null = null;
  for (const s of history) if (s.source === "live" && (!best || s.date > best.date)) best = s;
  return best;
}

export function gpuObservedInputFrom(history: Snapshot[], today: string, maxAgeDays: number): GpuObservedInput {
  const snap = newestLiveSnapshot(history);
  return {
    observedOn: snap?.date ?? null,
    today,
    maxAgeDays,
    models: snap
      ? GPU_POST_MODELS.filter((model) => typeof snap.prices[model] === "number").map((model) => ({
          model,
          price: snap.prices[model],
          listings: snap.meta?.[model]?.n ?? 0,
          providers: Array.from(new Set((snap.meta?.[model]?.sources ?? []).map((s) => PROVIDER_NAMES[s] ?? s))),
        }))
      : [],
  };
}

export interface CuratedGpuModel {
  model: string;
  currentUsdPerHr: number;
}

const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/**
 * The GPU card shows what the GPU Prices page serves: the live observation
 * when it is recent enough for the page to serve it, otherwise the curated
 * list with its own date. The two are never mixed on one card.
 */
export function gpuCard(
  history: Snapshot[],
  curated: { lastRefreshed?: string; models?: CuratedGpuModel[] },
  today: string,
  maxAgeDays: number,
): OgCard {
  const live = gpuObservedInputFrom(history, today, maxAgeDays);
  const ageOk =
    live.observedOn !== null &&
    Date.parse(`${today}T00:00:00Z`) - Date.parse(`${live.observedOn}T00:00:00Z`) <= maxAgeDays * 86_400_000;
  const observed = live.models.filter((m) => m.price > 0 && m.listings >= 2);
  if (ageOk && observed.length > 0) {
    const providers = Array.from(new Set(observed.flatMap((m) => m.providers)));
    return {
      title: "GPU rental prices, observed",
      subtitle: `On demand, per GPU-hour. Each price is the median of public listings on ${providers.join(" and ")}.`,
      stats: observed.slice(0, 3).map((m) => ({ label: m.model, value: usd(m.price) })),
      asOf: formatAsOf(live.observedOn),
      source: `Public listings: ${providers.join(", ")} · observed daily by GridTilt`,
      visual: {
        kind: "columns",
        columns: [...observed].sort((a, b) => b.price - a.price).map((m) => ({ label: m.model, value: m.price, display: usd(m.price) })),
      },
    };
  }
  const models = (curated.models ?? []).filter((m) => typeof m.currentUsdPerHr === "number" && m.currentUsdPerHr > 0);
  const pick = (name: string) => models.find((m) => m.model === name);
  return {
    title: "GPU rental prices",
    subtitle: "Curated estimates, per GPU-hour, from neocloud and marketplace list prices and public trackers. No live observation is recent enough to serve.",
    stats: ["H100", "H200", "B200"]
      .map(pick)
      .filter((m): m is CuratedGpuModel => Boolean(m))
      .map((m) => ({ label: m.model, value: `${usd(m.currentUsdPerHr)} est.` })),
    asOf: formatAsOf(curated.lastRefreshed),
    source: "GridTilt curated list: neocloud and marketplace list prices, getdeploying.com, Silicon Data",
    visual: {
      kind: "columns",
      columns: [...models]
        .sort((a, b) => b.currentUsdPerHr - a.currentUsdPerHr)
        .slice(0, 6)
        .map((m) => ({ label: m.model, value: m.currentUsdPerHr, display: usd(m.currentUsdPerHr) })),
    },
  };
}

// ── Wednesday: one project's status ─────────────────────────────────────────

/** Clusters the Wednesday post rotates through: named, 500 MW planned or more, in id order. */
export function projectCandidates(clusters: ClusterRecord[]): ClusterRecord[] {
  return clusters
    .filter((c) => c.id && c.name && (c.plannedPowerMW ?? 0) >= 500)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** This week's project, the same for the post and its card. */
export function weeklyProject(clusters: ClusterRecord[], today: string): ClusterRecord | null {
  const list = projectCandidates(clusters);
  return list.length ? list[weekIndex(today) % list.length] : null;
}

function evidenceFor(c: ClusterRecord, field: string, kind?: string): ClusterEvidence | null {
  return (c.evidence ?? []).find((e) => e.field === field && (kind === undefined || e.kind === kind)) ?? null;
}

/** "facility (grid interconnection)" -> "grid interconnection"; "not stated" -> null. */
export function basisWords(basis?: string): string | null {
  if (!basis || /not stated/i.test(basis)) return null;
  const inner = /\(([^)]+)\)/.exec(basis);
  return (inner ? inner[1] : basis).trim() || null;
}

export function projectInputFrom(c: ClusterRecord, listAsOf: string | null, today: string, maxListAgeDays: number): ProjectInput {
  const rated = evidenceFor(c, "ratedPowerMW", "operating");
  const planned = evidenceFor(c, "plannedPowerMW");
  return {
    name: displayName(c),
    place: displayPlace(c),
    status: c.status,
    plannedMW: typeof c.plannedPowerMW === "number" ? c.plannedPowerMW : null,
    plannedBasis: basisWords(planned?.basis),
    operating:
      rated && rated.asOf && typeof c.ratedPowerMW === "number" && c.ratedPowerMW > 0
        ? { mw: c.ratedPowerMW, asOf: rated.asOf, source: rated.source }
        : null,
    reviewed: c.reviewed ?? null,
    listAsOf,
    today,
    maxListAgeDays,
    url: `${SITE}/compute-frontier/${c.id}`,
  };
}

/**
 * A project's card: rated and planned power under the record page's own
 * labels, the record's date (its review, else the list's), and its sources.
 * For a reviewed record the subtitle quotes what each figure measures.
 */
export function projectCard(c: ClusterRecord, root: ClusterRoot): OgCard {
  const clusters = root.clusters ?? [];
  const est = (field: string) => ((c.estimated ?? []).includes(field) ? " est." : "");
  const rated = evidenceFor(c, "ratedPowerMW", "operating");
  const planned = evidenceFor(c, "plannedPowerMW");
  // The card's title and place sit on separate lines, so the city stays even
  // when the name carries it ("Stargate Abilene" / "Abilene, TX").
  const place = [c.location?.city, c.location?.state].filter(Boolean).join(", ");
  const status = STATUS_WORDS[c.status] ?? c.status;
  const reviewed = Boolean(c.reviewed && rated && planned);
  const subtitle = reviewed
    ? `${place ? `${place} · ` : ""}${status}. Rated: ${rated!.value} (${rated!.source}, ${shortDate(rated!.asOf ?? rated!.published ?? "")}). Planned: ${planned!.value}. Different bases.`
    : `${place ? `${place} · ` : ""}${status}. Planned power is the full announced build.`;
  const sources = reviewed
    ? Array.from(new Set([rated!, planned!].map((e) => e.source))).join("; ")
    : `${(c.sources ?? []).length} source${(c.sources ?? []).length === 1 ? "" : "s"} on the record · ${SOURCE_CLUSTERS}`;
  return {
    title: displayName(c),
    subtitle,
    stats: [
      { label: "Rated power", value: c.ratedPowerMW > 0 ? `${withCommas(c.ratedPowerMW)} MW${est("ratedPowerMW")}` : "—" },
      { label: "Planned power", value: `${withCommas(c.plannedPowerMW)} MW${est("plannedPowerMW")}` },
    ],
    asOf: formatAsOf(c.reviewed ?? root.lastRefreshed),
    source: reviewed ? `Reviewed record · ${sources}` : sources,
    visual: { kind: "map", dots: clusterDots(clusters, c.id) },
  };
}

// ── Thursday: the national interconnection queue ───────────────────────────

export interface QueueHeadline {
  queueOverallGW?: number;
  queueOverallProjects?: number;
  queueOverallAsOf?: string;
}

/** Parses "End of 2025 (LBNL Queued Up 2026)"; anything else is not posted. */
export function queueInputFrom(h: QueueHeadline | null | undefined): QueueInput | null {
  const m = /^End of (\d{4}) \(LBNL Queued Up (\d{4})\)$/.exec(h?.queueOverallAsOf ?? "");
  if (!h || !m || typeof h.queueOverallGW !== "number") return null;
  return {
    edition: `LBNL's Queued Up ${m[2]}`,
    editionYear: Number(m[2]),
    gw: h.queueOverallGW,
    projects: typeof h.queueOverallProjects === "number" ? h.queueOverallProjects : null,
    asOf: `the end of ${m[1]}`,
  };
}

export function queueCard(h: QueueHeadline | null | undefined): OgCard {
  const q = queueInputFrom(h);
  const stats: OgStat[] = q
    ? [
        { label: "Waiting to connect", value: `${withCommas(q.gw)} GW` },
        ...(q.projects ? [{ label: "Projects", value: withCommas(q.projects) }] : []),
      ]
    : [];
  return {
    title: "The US interconnection queue",
    subtitle: q
      ? `Generation and storage asking to connect to the grid, at ${q.asOf}. A queue request is not a commitment to build.`
      : "The queue total is missing its edition or date, so no figure is shown.",
    stats,
    asOf: q ? `END OF ${q.asOf.slice(-4)}` : null,
    source: q ? `Lawrence Berkeley National Laboratory, Queued Up ${q.editionYear}` : "Lawrence Berkeley National Laboratory, Queued Up",
    visual: { kind: "none" },
  };
}

// ── Friday: one documented change ───────────────────────────────────────────

/** The newest change with a short form; "checked, no change" records are never posted. */
export function latestChange(changes: ChangeRecord[]): ChangeRecord | null {
  return sortChanges(changes).find((c) => c.kind !== "checked-no-change" && c.short) ?? null;
}

export function changeInputFrom(c: ChangeRecord | null): ChangeInput | null {
  if (!c || !c.short || c.kind === "checked-no-change") return null;
  return {
    kind: c.kind,
    label: c.short.label,
    before: c.short.before,
    after: c.short.after,
    source: c.short.source,
    sourceDate: c.sourceDate,
    reviewed: c.reviewed,
    url: c.short.url,
  };
}

export function changeCard(c: ChangeRecord): OgCard | null {
  if (!c.short || c.kind === "checked-no-change") return null;
  return {
    title: capitalize(c.short.label),
    subtitle: `${c.kind === "correction" ? "Corrected" : "Updated"} ${shortDate(c.reviewed)}. ${c.rationale}`,
    stats: [
      { label: "Before", value: c.short.before },
      { label: "Now", value: c.short.after },
    ],
    asOf: formatAsOf(c.reviewed),
    source: `${c.source}, ${shortDate(c.sourceDate)}`,
    visual: { kind: "none" },
  };
}

// ── State fact (share card) ─────────────────────────────────────────────────

/**
 * A state's grid as My Grid shows it: the primary operator, its NERC area's
 * summer margin against that area's own reference, and NERC's risk rating,
 * with the notes My Grid prints where a state spans more than one area.
 * Null for a code My Grid does not cover.
 */
export function stateCard(code: string): OgCard | null {
  const s = STATES[code];
  if (!s) return null;
  const area = areaForState(code);
  const notes = [s.note, STATE_NERC_NOTE[code]].filter(Boolean).join(" ");
  if (area) {
    const c = cushion(area);
    return {
      title: `${s.name}'s grid`,
      subtitle: `${s.operatorLabel}. NERC area ${area.key}: ${area.risk.toLowerCase()} risk.${area.outlook ? ` Later years: ${area.outlook}.` : ""}${notes ? ` ${notes}` : ""}`,
      stats: [
        { label: `Reserve margin, ${area.season}`, value: `${area.margin.toFixed(1)}%` },
        { label: area.referenceDefault ? "NERC default reference" : "NERC reference", value: `${area.reference}%` },
        { label: "Versus reference", value: `${c >= 0 ? "+" : ""}${c.toFixed(1)} pts` },
      ],
      asOf: "JAN 2026",
      source: `${NERC_LTRA.label}; operator from FERC and EIA footprints`,
      visual: { kind: "none" },
    };
  }
  const regionAreas = s.region ? (REGION_AREAS[s.region] ?? []).map((k) => NERC_AREAS[k]).filter(Boolean) : [];
  return {
    title: `${s.name}'s grid`,
    subtitle:
      regionAreas.length > 1
        ? `${s.operatorLabel}. NERC reports ${s.region} by sub-area, and ${s.name} is not assigned to one of them here.${notes ? ` ${notes}` : ""}`
        : `${s.operatorLabel}. No NERC assessment area covers ${s.name}'s grid.${notes ? ` ${notes}` : ""}`,
    stats: [],
    asOf: "JAN 2026",
    source: `${NERC_LTRA.label}; operator from FERC and EIA footprints`,
    visual: { kind: "none" },
  };
}
