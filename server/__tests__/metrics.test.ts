import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeNuclearMetrics,
  computePipelineMetrics,
  computeMarketLine,
  evaluateMetricsEvent,
  type BacklogProjectLite,
  type MetricsSnapshot,
} from "../metrics";

const proj = (over: Partial<BacklogProjectLite>): BacklogProjectLite => ({
  id: "p",
  projectName: "P",
  sponsor: "S",
  capacityMW: 1000,
  type: "nuclear",
  status: "active",
  category: "ppa",
  dcRelevant: true,
  ...over,
});

test("nuclear partition: signed headline excludes options, proposals, and aggregates", () => {
  const m = computeNuclearMetrics([
    proj({ id: "a", capacityMW: 835, firmness: "signed" }),
    proj({ id: "b", capacityMW: 1920, firmness: "signed" }),
    proj({ id: "c", capacityMW: 300, firmness: "optioned" }),
    proj({ id: "d", capacityMW: 1200, firmness: "proposed" }),
    proj({ id: "e", capacityMW: 2100, firmness: "aggregate", category: "aggregate" }),
  ]);
  assert.equal(m.signedGW, 2.8); // 2755 MW
  assert.equal(m.announcedGW, 1.5); // 1500 MW
  assert.equal(m.aggregateGW, 2.1);
  assert.equal(m.signedDeals, 2);
  assert.equal(m.totalDeals, 4); // aggregate row is not a deal
  assert.deepEqual(m.signedIds, ["a", "b"]);
});

test("nuclear partition: unclassified rows default to proposed, never signed", () => {
  const m = computeNuclearMetrics([proj({ id: "x", capacityMW: 5000 })]);
  assert.equal(m.signedGW, 0);
  assert.equal(m.announcedGW, 5);
});

test("nuclear partition: unclassified aggregate-category rows stay out of both buckets", () => {
  const m = computeNuclearMetrics([proj({ id: "x", capacityMW: 2100, category: "aggregate" })]);
  assert.equal(m.signedGW, 0);
  assert.equal(m.announcedGW, 0);
  assert.equal(m.aggregateGW, 2.1);
  assert.equal(m.totalDeals, 0);
});

test("nuclear partition: inactive, withdrawn, and non-dc rows are excluded", () => {
  const m = computeNuclearMetrics([
    proj({ id: "a", firmness: "signed", status: "withdrawn" }),
    proj({ id: "b", firmness: "signed", dcRelevant: false }),
    proj({ id: "c", firmness: "signed", type: "gas" }),
  ]);
  assert.equal(m.signedGW, 0);
  assert.equal(m.signedDeals, 0);
});

test("pipeline sums by status in GW with site count", () => {
  const p = computePipelineMetrics([
    { powerMW: 500, status: "operational" },
    { powerMW: 700, status: "operational" },
    { powerMW: 2000, status: "construction" },
    { powerMW: 400, status: "announced" },
  ]);
  assert.equal(p.operationalGW, 1.2);
  assert.equal(p.constructionGW, 2);
  assert.equal(p.announcedGW, 0.4);
  assert.equal(p.siteCount, 4);
});

test("market line: stale (null) tickers are excluded and counts disclosed", () => {
  const line = computeMarketLine(
    [
      { ticker: "CEG", changePercent: 2 },
      { ticker: "VST", changePercent: null },
      { ticker: "NVDA", changePercent: -1 },
    ],
    ["CEG", "VST"],
  );
  assert.ok(line);
  assert.equal(line.allPct, 0.5);
  assert.equal(line.allCount, 2);
  assert.equal(line.allTotal, 3);
  assert.equal(line.nuclearPct, 2);
  assert.equal(line.nuclearCount, 1);
});

test("market line: no live data means null, never a fabricated zero", () => {
  const line = computeMarketLine(
    [
      { ticker: "CEG", changePercent: null },
      { ticker: "VST", changePercent: null },
    ],
    ["CEG"],
  );
  assert.equal(line, null);
});

const snap = (over: Partial<MetricsSnapshot>): MetricsSnapshot => ({
  date: "2026-06-10",
  signedGW: 6.5,
  announcedGW: 6,
  signedDeals: 6,
  totalDeals: 12,
  operationalGW: 9.4,
  constructionGW: 15.6,
  announcedPipelineGW: 5.1,
  siteCount: 58,
  queueOverallGW: 2290,
  medianWaitMonths: 55,
  historicalWithdrawalPct: 77,
  ercotLargeLoadGW: 230,
  capexUsdBillions: 340,
  uraniumSpotUsdPerLb: 92,
  signedIds: ["a", "b", "c", "d", "e", "f"],
  ...over,
});

test("evaluator: first run initializes instead of tweeting the whole backlog", () => {
  assert.deepEqual(evaluateMetricsEvent(snap({}), null), { type: "init" });
});

test("evaluator: identical snapshots produce no event (honest silence)", () => {
  assert.equal(evaluateMetricsEvent(snap({}), snap({})), null);
});

test("evaluator: a new signed deal outranks every other change", () => {
  const ev = evaluateMetricsEvent(
    snap({ signedIds: ["a", "b", "c", "d", "e", "f", "NEW"], constructionGW: 16.6, queueOverallGW: 2300 }),
    snap({}),
  );
  assert.deepEqual(ev, { type: "new_deal", projectId: "NEW" });
});

test("evaluator: pipeline move outranks backlog and capex changes", () => {
  const ev = evaluateMetricsEvent(snap({ constructionGW: 16.6, queueOverallGW: 2300, capexUsdBillions: 360 }), snap({}));
  assert.equal(ev?.type, "pipeline_move");
  assert.equal(ev?.type === "pipeline_move" && ev.now.constructionGW, 16.6);
});

test("evaluator: backlog field changes are itemized with labels and units", () => {
  const ev = evaluateMetricsEvent(snap({ queueOverallGW: 2350, medianWaitMonths: 58 }), snap({}));
  assert.equal(ev?.type, "backlog_update");
  if (ev?.type === "backlog_update") {
    assert.deepEqual(ev.changes.map((c) => c.label), ["queue total", "median wait"]);
    assert.equal(ev.changes[0].after, 2350);
    assert.equal(ev.changes[1].unit, " mo");
  }
});

test("evaluator: capex revision fires only at >= $1B and is lowest priority", () => {
  assert.equal(evaluateMetricsEvent(snap({ capexUsdBillions: 340.5 }), snap({})), null);
  const ev = evaluateMetricsEvent(snap({ capexUsdBillions: 360 }), snap({}));
  assert.deepEqual(ev, { type: "capex_update", beforeB: 340, afterB: 360 });
});

test("evaluator: sub-threshold pipeline jitter does not fire", () => {
  assert.equal(evaluateMetricsEvent(snap({ constructionGW: 15.64 }), snap({})), null);
});
