// ─── Tweet formatting (pure) ─────────────────────────────────────────────
//
// Every template the poster ships is built here from plain inputs, so the
// exact copy is unit-tested (server/__tests__/social-format.test.ts) and
// routes.ts only gathers data.
//
// Posting model (2026-06-10 redesign): event-driven. The cron evaluates the
// buildout scoreboard against the last-posted snapshot and speaks only when
// something changed, plus one Friday digest. The retired gauge/NPI templates
// are gone with the indices they described.
//
// Voice rules:
//   - lowercase prose, short sentences; tickers, names, and acronyms KEEP
//     their case
//   - describe what's in the data; don't editorialize
//   - no manual column alignment ever: X renders proportional fonts, so
//     padded columns look ragged. one item per line, or interpunct rows.
//   - vary the copy from real numbers; never ship a sentence that would read
//     identically every week. the digest embeds its week label so even a
//     flat week is never byte-identical.
//   - full https:// urls so X cards the link

export function fmtPct(n: number): string {
  const v = n.toFixed(2);
  return n >= 0 ? `+${v}%` : `${v}%`;
}

/** GW with one decimal, thousands separated ("2,290" / "6.5"). */
export function fmtGw(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
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

// ── Event: new signed nuclear deal ────────────────────────────────────────

export interface NewDealInput {
  projectName: string;
  capacityMW: number;
  sponsor: string;
  offtaker?: string | null;
}

export function buildNewDealTweet(
  p: NewDealInput,
  totals: { signedGW: number; signedDeals: number },
): string {
  const who = p.offtaker ? `${p.sponsor}, offtaker ${p.offtaker}` : p.sponsor;
  return [
    "new signed nuclear-for-ai deal:",
    "",
    `${p.projectName}: ${p.capacityMW.toLocaleString("en-US")} MW, ${who}.`,
    "",
    `signed total now ${fmtGw(totals.signedGW)} GW across ${totals.signedDeals} deals.`,
    "",
    "https://gridtilt.com/queue",
  ].join("\n");
}

// ── Event: datacenter pipeline moved ──────────────────────────────────────

export interface PipelineBuckets {
  operationalGW: number;
  constructionGW: number;
  announcedGW: number;
}

export function buildPipelineMoveTweet(
  prev: PipelineBuckets,
  now: PipelineBuckets,
  siteCount: number,
): string {
  const rows: Array<[string, number, number]> = [
    ["operational", prev.operationalGW, now.operationalGW],
    ["under construction", prev.constructionGW, now.constructionGW],
    ["announced", prev.announcedGW, now.announcedGW],
  ];
  const lines = rows
    .filter(([, a, b]) => Math.abs(a - b) >= 0.05)
    .map(([label, a, b]) => `${label}: ${fmtGw(a)} -> ${fmtGw(b)} GW`);
  return [
    "tracked ai datacenter pipeline moved:",
    "",
    ...lines,
    "",
    `registry: ${siteCount} sites at 400 MW or more.`,
    "",
    "https://gridtilt.com/power-map",
  ].join("\n");
}

// ── Event: interconnection backlog update ─────────────────────────────────

export interface BacklogChangeLite {
  label: string;
  before: number;
  after: number;
  unit: string;
}

export function buildBacklogUpdateTweet(changes: BacklogChangeLite[]): string {
  const lines = changes.map(
    (c) => `${c.label}: ${fmtGw(c.before)} -> ${fmtGw(c.after)}${c.unit}`,
  );
  return [
    "interconnection backlog update:",
    "",
    ...lines,
    "",
    "source: lbnl queued up + iso filings.",
    "",
    "https://gridtilt.com/queue",
  ].join("\n");
}

// ── Event: hyperscaler capex revision ─────────────────────────────────────

export function buildCapexUpdateTweet(beforeB: number, afterB: number): string {
  const dir = afterB > beforeB ? "up from" : "down from";
  return [
    "hyperscaler capex update:",
    "",
    `fy2025 disclosed guides now total $${fmtGw(afterB)}B, ${dir} $${fmtGw(beforeB)}B.`,
    "",
    "MSFT, GOOGL, META, AMZN.",
    "",
    "https://gridtilt.com",
  ].join("\n");
}

// ── Friday digest ─────────────────────────────────────────────────────────

export interface DigestSnapshot {
  signedGW: number;
  constructionGW: number;
  queueOverallGW: number;
}

function deltaTag(now: number, ago: number | null): string {
  if (ago == null) return "";
  const d = parseFloat((now - ago).toFixed(1));
  if (Math.abs(d) < 0.1) return "";
  return ` (${d > 0 ? "+" : ""}${fmtGw(d)})`;
}

export function buildWeeklyDigestTweet(
  now: DigestSnapshot,
  weekAgo: DigestSnapshot | null,
  weekLabel: string,
  topCatalyst?: string | null,
): string {
  const row = [
    `signed nuclear ${fmtGw(now.signedGW)} GW${deltaTag(now.signedGW, weekAgo?.signedGW ?? null)}`,
    `dc construction ${fmtGw(now.constructionGW)} GW${deltaTag(now.constructionGW, weekAgo?.constructionGW ?? null)}`,
    `queue ${fmtGw(now.queueOverallGW)} GW${deltaTag(now.queueOverallGW, weekAgo?.queueOverallGW ?? null)}`,
  ].join(" · ");

  let insight: string;
  if (!weekAgo) {
    insight = "first digest; week-over-week deltas start next week.";
  } else {
    const all: Array<[string, number]> = [
      ["signed nuclear", now.signedGW - weekAgo.signedGW],
      ["dc construction", now.constructionGW - weekAgo.constructionGW],
      ["the queue", now.queueOverallGW - weekAgo.queueOverallGW],
    ];
    const moves = all.filter(([, d]) => Math.abs(d) >= 0.1);
    if (moves.length === 0) {
      insight = "no change on the scoreboard this week.";
    } else {
      const [name, d] = moves.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      insight = `biggest move: ${name} ${d > 0 ? "+" : ""}${fmtGw(parseFloat(d.toFixed(1)))} GW on the week.`;
    }
  }

  const lines = [
    `the buildout, week of ${weekLabel}:`,
    "",
    row,
    "",
    insight,
  ];
  if (topCatalyst) lines.push(`next week: ${topCatalyst}.`);
  lines.push("", "https://gridtilt.com");
  return lines.join("\n");
}

// ── Manual template: top movers ───────────────────────────────────────────

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

// ── Manual template: interconnection queue ────────────────────────────────

export interface QueueHeadline {
  queueOverallGW: number;
  medianWaitMonths: number;
  ercotLargeLoadGW: number;
  ercotLargeLoadDataCenterPct: number;
  trackedProjects: number;
  trackedCapacityGW: number;
}

export function buildQueueTweet(h: QueueHeadline | null): string {
  if (!h) {
    return ["us interconnection backlog", "", "dataset refreshing.", "", "https://gridtilt.com/queue"].join("\n");
  }
  return [
    "us interconnection backlog",
    "",
    `~${h.queueOverallGW.toLocaleString()} GW waiting in queues. median wait ${h.medianWaitMonths} months. ERCOT large-load alone: ${h.ercotLargeLoadGW} GW, ${h.ercotLargeLoadDataCenterPct}% of it datacenters.`,
    "",
    `gridtilt tracks ${h.trackedProjects} named projects, ${h.trackedCapacityGW} GW.`,
    "",
    "https://gridtilt.com/queue",
  ].join("\n");
}

// ── Manual template: catalyst preview ─────────────────────────────────────

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
