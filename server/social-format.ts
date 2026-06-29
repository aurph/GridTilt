// ─── Tweet formatting (pure) ─────────────────────────────────────────────
//
// Every template the daily poster ships is built here from plain inputs,
// so the exact copy is unit-tested (server/__tests__/social-format.test.ts)
// and routes.ts only gathers data.
//
// The daily rotation posts real, concrete facts about the AI buildout drawn
// from GridTilt's own datasets (clusters, GPU rental prices, the grid queue).
// No "indices", no sentiment "gauges" — those were removed on purpose.
//
// Voice rules:
//   - lowercase prose, short sentences; tickers, acronyms and units KEEP case
//     (H100, GB200, GW, US, AI, ERCOT)
//   - state what's in the data; don't editorialize
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

// ── Monday: buildout snapshot (Compute Frontier) ───────────────────────────

export interface BuildoutSnapshot {
  clusterCount: number;
  plannedGW: number;
  operationalGW: number;
  operatorCount: number;
}

export function buildBuildoutTweet(s: BuildoutSnapshot): string {
  return [
    `the AI buildout, tracked: ${s.clusterCount} named US compute clusters, ${gwStr(s.plannedGW)} GW of planned power across ${s.operatorCount} operators. ${gwStr(s.operationalGW)} GW already live.`,
    "",
    "https://gridtilt.com/compute-frontier",
  ].join("\n");
}

// ── Tuesday: GPU rental watch (Neocloud Intel) ─────────────────────────────

export interface GpuRentalSnapshot {
  h100: number;
  h200: number;
  gb200: number;
  moverModel: string;
  moverChangePct: number; // 1Y % change of the biggest mover
}

export function buildGpuRentalTweet(s: GpuRentalSnapshot): string {
  const dir = s.moverChangePct < 0 ? "down" : "up";
  const abs = Math.abs(Math.round(s.moverChangePct));
  return [
    `renting a GPU by the hour right now: H100 ~${usd(s.h100)}, H200 ~${usd(s.h200)}, GB200 ~${usd(s.gb200)}/GPU-hr. ${s.moverModel} ${dir} ${abs}% over the past year.`,
    "",
    "https://gridtilt.com/neocloud-intel",
  ].join("\n");
}

// ── Wednesday: cluster spotlight (rotates weekly) ──────────────────────────

export interface ClusterSpotlight {
  name: string;
  plannedGW: number;
  location: string; // "City, ST" or "" if unknown
  energy: string; // cleaned, lowercase
  clusterCount: number;
}

export function buildClusterSpotlightTweet(s: ClusterSpotlight): string {
  const loc = s.location ? `, ${s.location}` : "";
  const power = s.energy ? `, powered by ${s.energy}` : "";
  return [
    `${s.name}${loc}: ${gwStr(s.plannedGW)} GW of compute planned${power}. one of ${s.clusterCount} AI clusters we track.`,
    "",
    "https://gridtilt.com/compute-frontier",
  ].join("\n");
}

// ── Thursday: grid backlog (interconnection queue) ─────────────────────────

export interface BacklogHeadline {
  queueOverallGW: number;
  medianWaitMonths: number;
  ercotLargeLoadGW: number;
  ercotLargeLoadDataCenterPct: number;
}

export function buildGridBacklogTweet(h: BacklogHeadline | null): string {
  if (!h) {
    return ["us interconnection backlog: dataset refreshing.", "", "https://gridtilt.com/queue"].join("\n");
  }
  return [
    `the grid is the bottleneck: ~${withCommas(h.queueOverallGW)} GW waiting in US interconnection queues, ~${h.medianWaitMonths}-month median wait. ERCOT's large-load queue alone is ${h.ercotLargeLoadGW} GW, ${Math.round(h.ercotLargeLoadDataCenterPct)}% data centers.`,
    "",
    "https://gridtilt.com/queue",
  ].join("\n");
}

// ── Friday: power mix (how the buildout gets power) ─────────────────────────

export interface PowerMixSnapshot {
  topSource: string;
  topGW: number;
  nextSource: string;
  nextGW: number;
  linkedDealCount: number;
}

export function buildPowerMixTweet(s: PowerMixSnapshot): string {
  const deals = s.linkedDealCount > 0
    ? ` ${s.linkedDealCount} nuclear-for-AI deals tracked.`
    : "";
  return [
    `how the AI buildout plans to get power: ${s.topSource} leads at ${gwStr(s.topGW)} GW of planned compute, then ${s.nextSource} at ${gwStr(s.nextGW)} GW.${deals}`,
    "",
    "https://gridtilt.com/compute-frontier",
  ].join("\n");
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
    return `${d}: ${c.title}`;
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
