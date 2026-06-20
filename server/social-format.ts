// ─── Tweet formatting (pure) ─────────────────────────────────────────────
//
// Every template the daily poster ships is built here from plain inputs,
// so the exact copy is unit-tested (server/__tests__/social-format.test.ts)
// and routes.ts only gathers data.
//
// Voice rules:
//   - lowercase prose, short sentences; tickers and acronyms KEEP their case
//   - describe what's in the data; don't editorialize
//   - no manual column alignment ever: X renders proportional fonts, so
//     padded columns look ragged. one item per line, or interpunct rows.
//   - vary the insight line from real numbers (week deltas, peaks), never
//     ship a sentence that would read identically every week
//   - full https:// urls so X cards the link

export function fmtPct(n: number): string {
  const v = n.toFixed(2);
  return n >= 0 ? `+${v}%` : `${v}%`;
}

export function fmtPerf(perf: number): string {
  const pct = ((perf - 1) * 100).toFixed(0);
  return perf >= 1 ? `+${pct}%` : `${pct}%`;
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

// ── Monday: gauge status ──────────────────────────────────────────────────

export interface GaugeSnapshot {
  aiPowerIndex: number;
  gridStress: number;
  npiValue: number;
}

export interface HistoryDayLite {
  date: string;
  npiEquityLegs?: number | null;
}

const MONTH_SHORT = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Week delta + peak context from the recorded daily series. */
export function npiHistoryContext(days: HistoryDayLite[]): {
  weekDelta: number | null;
  peakValue: number | null;
  peakLabel: string | null;
} {
  const legs = days.filter((d) => d.npiEquityLegs != null);
  if (legs.length === 0) return { weekDelta: null, peakValue: null, peakLabel: null };
  const last = legs[legs.length - 1].npiEquityLegs!;
  const weekAgo = legs.length > 5 ? legs[legs.length - 6].npiEquityLegs! : null;
  let peak = legs[0];
  for (const d of legs) if (d.npiEquityLegs! > peak.npiEquityLegs!) peak = d;
  const [y, m] = peak.date.split("-");
  return {
    weekDelta: weekAgo != null ? last - weekAgo : null,
    peakValue: peak.npiEquityLegs!,
    peakLabel: `${MONTH_SHORT[Number(m) - 1]} '${y.slice(2)}`,
  };
}

export function buildTiltStatusTweet(k: GaugeSnapshot, history: HistoryDayLite[]): string {
  const ctx = npiHistoryContext(history);

  // Insight assembled from live numbers so the sentence changes with the
  // data instead of repeating verbatim every monday.
  const parts: string[] = [];
  parts.push(`npi sits ${(k.npiValue - 100).toFixed(0)} above its jan 2024 base`);
  if (ctx.peakValue != null && ctx.peakValue - k.npiValue > 5) {
    parts.push(`${(ctx.peakValue - k.npiValue).toFixed(0)} below the ${ctx.peakLabel} peak`);
  }
  if (ctx.weekDelta != null) {
    parts.push(
      Math.abs(ctx.weekDelta) < 1.5
        ? "flat on the week"
        : `${ctx.weekDelta > 0 ? "+" : ""}${ctx.weekDelta.toFixed(0)} on the week`,
    );
  }
  let insight = parts.join(", ") + ".";

  const aiOff = k.aiPowerIndex - 72;
  const gsOff = k.gridStress - 68;
  if (Math.abs(gsOff) > 6 && Math.abs(gsOff) >= Math.abs(aiOff)) {
    insight += ` grid stress gauge ${gsOff > 0 ? "running" : "sitting"} ${Math.abs(gsOff).toFixed(0)} ${gsOff > 0 ? "above" : "below"} baseline.`;
  } else if (Math.abs(aiOff) > 6) {
    insight += ` ai demand gauge ${Math.abs(aiOff).toFixed(0)} ${aiOff > 0 ? "above" : "below"} baseline.`;
  }

  return [
    "gridtilt · daily gauges",
    "",
    `ai demand ${k.aiPowerIndex.toFixed(0)} · grid stress ${k.gridStress.toFixed(0)} · npi ${k.npiValue.toFixed(0)}`,
    "",
    insight,
    "",
    "https://gridtilt.com",
  ].join("\n");
}

// ── Tuesday: top movers ───────────────────────────────────────────────────

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

// ── Wednesday: NPI constituents ───────────────────────────────────────────

export interface NpiConstituentPerfs {
  cegPerf: number;
  vstPerf: number;
  ccjPerf: number;
  nlrPerf: number;
  uPerf: number;
  policyPerf: number;
}

/** Effective weight of each leg after price-relative drift (no rebalance). */
export function effectiveNpiWeights(c: NpiConstituentPerfs): Record<string, number> {
  const terms: Record<string, number> = {
    CEG: 0.25 * c.cegPerf,
    VST: 0.2 * c.vstPerf,
    CCJ: 0.15 * c.ccjPerf,
    NLR: 0.2 * c.nlrPerf,
    uranium: 0.1 * c.uPerf,
    policy: 0.1 * c.policyPerf,
  };
  const denom = Object.values(terms).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, v / denom]));
}

export function buildNpiUpdateTweet(npiValue: number, c: NpiConstituentPerfs): string {
  const perfs = [
    { sym: "VST", perf: c.vstPerf },
    { sym: "CEG", perf: c.cegPerf },
    { sym: "NLR", perf: c.nlrPerf },
    { sym: "CCJ", perf: c.ccjPerf },
    { sym: "uranium", perf: c.uPerf },
  ].sort((a, b) => b.perf - a.perf);

  const row = perfs.map((p) => `${p.sym} ${fmtPerf(p.perf)}`).join(" · ");

  // The honest line: disclose weight drift when one leg dominates, the
  // same finding the validation study publishes.
  const eff = effectiveNpiWeights(c);
  const [domName, domW] = Object.entries(eff).sort((a, b) => b[1] - a[1])[0];
  const insight =
    domW >= 0.35
      ? `un-rebalanced since the base, so ${domName.toLowerCase()} now carries ${(domW * 100).toFixed(0)}% of the basket. methodology and validation are public in the repo.`
      : `leader ${perfs[0].sym}, laggard ${perfs[perfs.length - 1].sym}, since the jan 2024 base.`;

  return [
    `nuclear power index: ${npiValue.toFixed(0)} (jan 2024 = 100)`,
    "",
    row,
    "",
    insight,
    "",
    "https://gridtilt.com",
  ].join("\n");
}

// ── Thursday: interconnection queue ───────────────────────────────────────

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

// ── Friday: catalyst preview ──────────────────────────────────────────────

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

// ── Compute Frontier: AI supercluster tracker ──────────────────────────────

export interface ComputeFrontierSnapshot {
  clusterCount: number;
  operationalMW: number;
  totalPlannedMW: number;
  totalGpus: number;
  clustersWithGpuData: number;
  topOperator: string | null;
  topOperatorPlannedShare: number; // 0..1 share of total planned MW
  securedMW: number; // planned nuclear capacity linked to tracked deals
}

/** Compact accelerator count: 1,315,000 -> "1.32M", 230,000 -> "230k".
 *  Rounds half-up at two decimals of millions (toFixed alone mis-rounds
 *  1.315 down to "1.31" because of float representation). */
function fmtAccel(n: number): string {
  if (n >= 1_000_000) return `${(Math.round(n / 10_000) / 100).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function buildComputeFrontierTweet(s: ComputeFrontierSnapshot): string {
  const gw = (mw: number) => (mw / 1000).toFixed(1);

  // Insight assembled from live numbers so the sentence shifts with the data
  // instead of repeating verbatim. Operator names KEEP their case.
  const parts: string[] = [];
  if (s.topOperator) {
    parts.push(`${s.topOperator} leads at ${(s.topOperatorPlannedShare * 100).toFixed(0)}% of planned MW`);
  }
  if (s.totalGpus > 0) {
    parts.push(`${fmtAccel(s.totalGpus)} accelerators disclosed across ${s.clustersWithGpuData} clusters`);
  }
  if (s.securedMW > 0) {
    parts.push(`${gw(s.securedMW)} GW tied to tracked nuclear deals`);
  }
  const insight = (parts.length ? parts.join(". ") : "tracked from public announcements; estimates labeled") + ".";

  return [
    "gridtilt · compute frontier",
    "",
    `${s.clusterCount} AI superclusters tracked · ${gw(s.operationalMW)} GW operational · ${gw(s.totalPlannedMW)} GW planned`,
    "",
    insight,
    "",
    "https://gridtilt.com/compute-frontier",
  ].join("\n");
}
