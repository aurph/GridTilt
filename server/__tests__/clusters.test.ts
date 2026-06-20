// Locks the Compute Frontier metrics math. Like indices/metrics tests, this
// asserts known vectors against a fixed fixture so the displayed numbers, the
// dataset, and the formulas can never silently diverge. If a formula changes,
// this file changes with it, in the same commit, on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeClusterMetrics, type ClusterLite } from "../clusters";

// Fixed fixture with hand-computable totals (see comments per assertion).
const FIXTURE: ClusterLite[] = [
  { id: "a", operator: "Acme", status: "operational", gridRegion: "ERCOT", gpuCount: 100, ratedPowerMW: 100, plannedPowerMW: 200, linkedDeal: "deal-1" },
  { id: "b", operator: "Acme", status: "construction", gridRegion: "ERCOT", gpuCount: null, ratedPowerMW: 0, plannedPowerMW: 300, linkedDeal: null },
  { id: "c", operator: "Beta", status: "operational", gridRegion: "PJM", gpuCount: 50, ratedPowerMW: 50, plannedPowerMW: 50, linkedDeal: "deal-2" },
  { id: "d", operator: "Beta", status: "announced", gridRegion: "PJM", gpuCount: null, ratedPowerMW: 0, plannedPowerMW: 100, linkedDeal: "deal-1" },
  { id: "e", operator: "Gamma", status: "construction", gridRegion: "MISO", gpuCount: 200, ratedPowerMW: 150, plannedPowerMW: 400, linkedDeal: null },
];

test("counts clusters by status", () => {
  const m = computeClusterMetrics(FIXTURE);
  assert.equal(m.clusterCount, 5);
  assert.equal(m.operationalCount, 2); // a, c
  assert.equal(m.constructionCount, 2); // b, e
  assert.equal(m.announcedCount, 1); // d
});

test("sums rated, operational, and planned MW", () => {
  const m = computeClusterMetrics(FIXTURE);
  assert.equal(m.totalRatedMW, 300); // 100+0+50+0+150
  assert.equal(m.operationalMW, 150); // rated of operational: 100+50
  assert.equal(m.totalPlannedMW, 1050); // 200+300+50+100+400
});

test("sums GPUs skipping nulls and counts disclosing clusters", () => {
  const m = computeClusterMetrics(FIXTURE);
  assert.equal(m.totalGpus, 350); // 100+50+200 (b, d null skipped)
  assert.equal(m.clustersWithGpuData, 3); // a, c, e
});

test("byStatus carries count, ratedMW, plannedMW per bucket", () => {
  const m = computeClusterMetrics(FIXTURE);
  const op = m.byStatus.find((b) => b.status === "operational");
  const con = m.byStatus.find((b) => b.status === "construction");
  const ann = m.byStatus.find((b) => b.status === "announced");
  assert.deepEqual(op, { status: "operational", count: 2, ratedMW: 150, plannedMW: 250 }); // a+c
  assert.deepEqual(con, { status: "construction", count: 2, ratedMW: 150, plannedMW: 700 }); // b+e
  assert.deepEqual(ann, { status: "announced", count: 1, ratedMW: 0, plannedMW: 100 }); // d
});

test("byOperator aggregates and sorts by planned MW desc", () => {
  const m = computeClusterMetrics(FIXTURE);
  assert.deepEqual(
    m.byOperator,
    [
      { operator: "Acme", count: 2, ratedMW: 100, plannedMW: 500, gpus: 100 },
      { operator: "Gamma", count: 1, ratedMW: 150, plannedMW: 400, gpus: 200 },
      { operator: "Beta", count: 2, ratedMW: 50, plannedMW: 150, gpus: 50 },
    ],
  );
});

test("byIso aggregates and sorts by planned MW desc", () => {
  const m = computeClusterMetrics(FIXTURE);
  assert.deepEqual(
    m.byIso,
    [
      { iso: "ERCOT", count: 2, ratedMW: 100, plannedMW: 500 }, // a+b
      { iso: "MISO", count: 1, ratedMW: 150, plannedMW: 400 }, // e
      { iso: "PJM", count: 2, ratedMW: 50, plannedMW: 150 }, // c+d
    ],
  );
});

test("gpusPerMW divides GPUs by rated MW of only the GPU-disclosing clusters", () => {
  const m = computeClusterMetrics(FIXTURE);
  // 350 GPUs / (100 + 50 + 150) rated MW = 1.1666… -> 1.17
  assert.equal(m.gpusPerMW, 1.17);
});

test("concentration reports HHI, top operator, and share of planned MW", () => {
  const m = computeClusterMetrics(FIXTURE);
  assert.equal(m.concentration.operatorCount, 3);
  assert.equal(m.concentration.topOperator, "Acme"); // 500 planned MW is the max
  assert.equal(m.concentration.topOperatorPlannedShare, 0.4762); // 500/1050
  // HHI = (500/1050)^2 + (150/1050)^2 + (400/1050)^2 = 0.392290 -> 0.3923
  assert.equal(m.concentration.hhi, 0.3923);
});

test("linkedDealCount counts non-null links; ids are distinct in first-seen order", () => {
  const m = computeClusterMetrics(FIXTURE);
  assert.equal(m.linkedDealCount, 3); // a, c, d
  assert.deepEqual(m.linkedDealIds, ["deal-1", "deal-2"]);
});

test("empty input yields safe zeroes and nulls, never NaN", () => {
  const m = computeClusterMetrics([]);
  assert.equal(m.clusterCount, 0);
  assert.equal(m.totalRatedMW, 0);
  assert.equal(m.operationalMW, 0);
  assert.equal(m.totalPlannedMW, 0);
  assert.equal(m.totalGpus, 0);
  assert.equal(m.clustersWithGpuData, 0);
  assert.equal(m.gpusPerMW, null); // no cluster has both GPUs and MW
  assert.deepEqual(m.byStatus, []);
  assert.deepEqual(m.byOperator, []);
  assert.deepEqual(m.byIso, []);
  assert.deepEqual(m.concentration, { topOperator: null, topOperatorPlannedShare: 0, hhi: 0, operatorCount: 0 });
  assert.equal(m.linkedDealCount, 0);
  assert.deepEqual(m.linkedDealIds, []);
});

test("all-null GPU counts give totalGpus 0 and gpusPerMW null", () => {
  const noGpu = FIXTURE.map((c) => ({ ...c, gpuCount: null }));
  const m = computeClusterMetrics(noGpu);
  assert.equal(m.totalGpus, 0);
  assert.equal(m.clustersWithGpuData, 0);
  assert.equal(m.gpusPerMW, null);
});

test("the shipped dataset satisfies the integrity contract every entry promises", () => {
  // Guards the curated file itself: estimated[] only names real numeric
  // fields, gpuCount is a number or null, status is in the enum, and metrics
  // compute without throwing on the live data.
  const root = JSON.parse(
    readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"),
  );
  const clusters = root.clusters as Array<Record<string, unknown>>;
  const ESTIMABLE = new Set(["gpuCount", "ratedPowerMW", "plannedPowerMW", "onlineDate"]);
  const STATUS = new Set(["operational", "construction", "announced"]);
  for (const c of clusters) {
    assert.ok(STATUS.has(c.status as string), `${c.id} status`);
    assert.ok(c.gpuCount === null || typeof c.gpuCount === "number", `${c.id} gpuCount`);
    for (const f of c.estimated as string[]) {
      assert.ok(ESTIMABLE.has(f), `${c.id} estimated names real field: ${f}`);
    }
    assert.ok(Array.isArray(c.sources) && (c.sources as unknown[]).length > 0, `${c.id} sources`);
  }
  // Metrics run on the real data and stay self-consistent.
  const m = computeClusterMetrics(clusters as unknown as ClusterLite[]);
  assert.equal(m.clusterCount, clusters.length);
  assert.ok(m.operationalMW <= m.totalRatedMW);
  assert.ok(m.concentration.hhi >= 0 && m.concentration.hhi <= 1);
});

// ── Concentration and sorting edge cases ───────────────────────────────────

test("a single operator yields HHI 1.0 and a 100% top share", () => {
  const oneOp = FIXTURE.filter((c) => c.operator === "Acme"); // a + b, 500 planned
  const m = computeClusterMetrics(oneOp);
  assert.equal(m.concentration.operatorCount, 1);
  assert.equal(m.concentration.topOperator, "Acme");
  assert.equal(m.concentration.topOperatorPlannedShare, 1);
  assert.equal(m.concentration.hhi, 1);
});

test("operator and ISO sorts break planned-MW ties alphabetically", () => {
  const tie: ClusterLite[] = [
    { id: "x", operator: "Zeta", status: "operational", gridRegion: "ZZZ", gpuCount: null, ratedPowerMW: 0, plannedPowerMW: 100, linkedDeal: null },
    { id: "y", operator: "Alpha", status: "operational", gridRegion: "AAA", gpuCount: null, ratedPowerMW: 0, plannedPowerMW: 100, linkedDeal: null },
  ];
  const m = computeClusterMetrics(tie);
  assert.deepEqual(m.byOperator.map((o) => o.operator), ["Alpha", "Zeta"]);
  assert.deepEqual(m.byIso.map((i) => i.iso), ["AAA", "ZZZ"]);
});

test("gpusPerMW is null when the only GPU-disclosing cluster has 0 rated MW", () => {
  const m = computeClusterMetrics([
    { id: "z", operator: "Q", status: "announced", gridRegion: "ERCOT", gpuCount: 1000, ratedPowerMW: 0, plannedPowerMW: 500, linkedDeal: null },
  ]);
  assert.equal(m.totalGpus, 1000);
  assert.equal(m.clustersWithGpuData, 1);
  assert.equal(m.gpusPerMW, null); // GPUs disclosed but no rated MW to divide by
});

test("linkedDealCount counts every link but linkedDealIds dedupes a shared deal", () => {
  const m = computeClusterMetrics([
    { id: "a", operator: "Q", status: "operational", gridRegion: "ERCOT", gpuCount: null, ratedPowerMW: 0, plannedPowerMW: 100, linkedDeal: "shared" },
    { id: "b", operator: "Q", status: "operational", gridRegion: "ERCOT", gpuCount: null, ratedPowerMW: 0, plannedPowerMW: 100, linkedDeal: "shared" },
  ]);
  assert.equal(m.linkedDealCount, 2);
  assert.deepEqual(m.linkedDealIds, ["shared"]);
});
