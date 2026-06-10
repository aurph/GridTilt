// ─── The buildout scoreboard (pure) ─────────────────────────────────────
//
// Replaces the retired market-sentiment indices. The retirement rationale is
// public: docs/INDEX_VALIDATION.md showed the gauges carried no physical
// signal, so the headline numbers are now physical quantities read straight
// from the curated datasets. Rules of this module:
//   1. No baselines, no clamps, no index anchors, no normalization. Units
//      are GW, deals, months, dollars.
//   2. Every function is a deterministic map from dataset rows to displayed
//      numbers, unit-tested in server/__tests__/metrics.test.ts.
//   3. The headline nuclear number counts SIGNED deals only. Options, LOIs,
//      and aggregate pipelines never inflate it.

export type Firmness = "signed" | "optioned" | "proposed" | "aggregate";

export interface BacklogProjectLite {
  id: string;
  projectName: string;
  sponsor: string;
  capacityMW: number;
  type: string;
  status: string;
  category: string;
  dcRelevant: boolean;
  offtaker?: string | null;
  firmness?: Firmness;
}

export interface NuclearMetrics {
  signedGW: number;
  announcedGW: number; // optioned + proposed
  aggregateGW: number; // LOI pipelines; footnote only, never headlined
  signedDeals: number;
  totalDeals: number; // named projects (excludes aggregate rows)
  signedIds: string[];
}

function toGw(mw: number): number {
  return parseFloat((mw / 1000).toFixed(1));
}

function firmnessOf(p: BacklogProjectLite): Firmness {
  // Unclassified rows count as "proposed": the conservative default keeps a
  // forgotten field from ever inflating the signed headline.
  if (p.firmness) return p.firmness;
  return p.category === "aggregate" ? "aggregate" : "proposed";
}

/** Active, datacenter-relevant nuclear rows partitioned by curated firmness. */
export function computeNuclearMetrics(projects: BacklogProjectLite[]): NuclearMetrics {
  const active = projects.filter(
    (p) => p.type === "nuclear" && p.status === "active" && p.dcRelevant,
  );
  let signedMW = 0;
  let announcedMW = 0;
  let aggregateMW = 0;
  const signedIds: string[] = [];
  let totalDeals = 0;
  for (const p of active) {
    const f = firmnessOf(p);
    if (f === "aggregate") {
      aggregateMW += p.capacityMW;
      continue;
    }
    totalDeals++;
    if (f === "signed") {
      signedMW += p.capacityMW;
      signedIds.push(p.id);
    } else {
      announcedMW += p.capacityMW;
    }
  }
  return {
    signedGW: toGw(signedMW),
    announcedGW: toGw(announcedMW),
    aggregateGW: toGw(aggregateMW),
    signedDeals: signedIds.length,
    totalDeals,
    signedIds,
  };
}

export interface DatacenterLite {
  powerMW: number;
  status: string;
}

export interface PipelineMetrics {
  operationalGW: number;
  constructionGW: number;
  announcedGW: number;
  siteCount: number;
}

/** Tracked-registry sums by status. "Tracked", never "US total". */
export function computePipelineMetrics(sites: DatacenterLite[]): PipelineMetrics {
  const sum = (status: string) =>
    sites.filter((s) => s.status === status).reduce((acc, s) => acc + (s.powerMW || 0), 0);
  return {
    operationalGW: toGw(sum("operational")),
    constructionGW: toGw(sum("construction")),
    announcedGW: toGw(sum("announced")),
    siteCount: sites.length,
  };
}

export interface StockLite {
  ticker: string;
  changePercent: number | null;
}

export interface MarketLine {
  allPct: number;
  allCount: number; // live tickers included in the mean
  allTotal: number; // tracked universe size
  nuclearPct: number | null;
  nuclearCount: number;
}

/**
 * The one market element that survives: an equal-weight mean of today's
 * percent moves. A percent, never a level; equal weight is the no-judgment
 * choice; stale tickers are excluded and the live count is disclosed.
 */
export function computeMarketLine(
  stocks: StockLite[],
  nuclearTickers: string[],
): MarketLine | null {
  const live = stocks.filter(
    (s): s is { ticker: string; changePercent: number } =>
      typeof s.changePercent === "number" && Number.isFinite(s.changePercent),
  );
  if (live.length === 0) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const nuclearSet = new Set(nuclearTickers);
  const nuke = live.filter((s) => nuclearSet.has(s.ticker));
  return {
    allPct: parseFloat(mean(live.map((s) => s.changePercent)).toFixed(2)),
    allCount: live.length,
    allTotal: stocks.length,
    nuclearPct: nuke.length > 0 ? parseFloat(mean(nuke.map((s) => s.changePercent)).toFixed(2)) : null,
    nuclearCount: nuke.length,
  };
}

// ─── Snapshot + event evaluation (drives the event-driven poster) ─────────

export interface MetricsSnapshot {
  date: string; // YYYY-MM-DD US/Eastern
  signedGW: number;
  announcedGW: number;
  signedDeals: number;
  totalDeals: number;
  operationalGW: number;
  constructionGW: number;
  announcedPipelineGW: number;
  siteCount: number;
  queueOverallGW: number;
  medianWaitMonths: number;
  historicalWithdrawalPct: number;
  ercotLargeLoadGW: number;
  capexUsdBillions: number;
  uraniumSpotUsdPerLb: number;
  signedIds: string[];
}

export interface BacklogFieldChange {
  label: string;
  before: number;
  after: number;
  unit: string;
}

export type MetricsEvent =
  | { type: "init" }
  | { type: "new_deal"; projectId: string }
  | {
      type: "pipeline_move";
      prev: Pick<PipelineMetrics, "operationalGW" | "constructionGW" | "announcedGW">;
      now: Pick<PipelineMetrics, "operationalGW" | "constructionGW" | "announcedGW">;
    }
  | { type: "backlog_update"; changes: BacklogFieldChange[] }
  | { type: "capex_update"; beforeB: number; afterB: number };

const PIPELINE_MIN_GW = 0.05;
const CAPEX_MIN_B = 1;

/**
 * Diff the current scoreboard against the last-posted snapshot and return at
 * most ONE event, by priority: new signed deal > pipeline move > backlog
 * update > capex update. First run (no prior snapshot) returns "init" so the
 * poster can initialize state without firing a tweet for every existing deal.
 */
export function evaluateMetricsEvent(
  current: MetricsSnapshot,
  last: MetricsSnapshot | null,
): MetricsEvent | null {
  if (!last) return { type: "init" };

  const lastIds = new Set(last.signedIds);
  const newSigned = current.signedIds.filter((id) => !lastIds.has(id));
  if (newSigned.length > 0) return { type: "new_deal", projectId: newSigned[0] };

  const moved = (a: number, b: number) => Math.abs(a - b) >= PIPELINE_MIN_GW;
  if (
    moved(current.operationalGW, last.operationalGW) ||
    moved(current.constructionGW, last.constructionGW) ||
    moved(current.announcedPipelineGW, last.announcedPipelineGW)
  ) {
    return {
      type: "pipeline_move",
      prev: {
        operationalGW: last.operationalGW,
        constructionGW: last.constructionGW,
        announcedGW: last.announcedPipelineGW,
      },
      now: {
        operationalGW: current.operationalGW,
        constructionGW: current.constructionGW,
        announcedGW: current.announcedPipelineGW,
      },
    };
  }

  const changes: BacklogFieldChange[] = [];
  const diff = (label: string, before: number, after: number, unit: string) => {
    if (before !== after) changes.push({ label, before, after, unit });
  };
  diff("queue total", last.queueOverallGW, current.queueOverallGW, " GW");
  diff("median wait", last.medianWaitMonths, current.medianWaitMonths, " mo");
  diff("ercot large-load", last.ercotLargeLoadGW, current.ercotLargeLoadGW, " GW");
  diff("withdrawal rate", last.historicalWithdrawalPct, current.historicalWithdrawalPct, "%");
  if (changes.length > 0) return { type: "backlog_update", changes };

  if (Math.abs(current.capexUsdBillions - last.capexUsdBillions) >= CAPEX_MIN_B) {
    return { type: "capex_update", beforeB: last.capexUsdBillions, afterB: current.capexUsdBillions };
  }

  return null;
}
