import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLUSTER_RTOS,
  clusterLabelMinMW,
  clusterPassesFilters,
  clusterPinRadius,
  clusterRTO,
  clusterStats,
  formatClusterMW,
  hasCoords,
  isEstimated,
  knownChip,
  parseView,
  type ClusterPoint,
} from "../power-map-clusters";

function row(over: Partial<ClusterPoint> = {}): ClusterPoint {
  return {
    id: "x",
    name: "X",
    operator: "Op",
    status: "construction",
    location: { city: "Abilene", state: "TX", lat: 32.5, lng: -99.7 },
    gridRegion: "ERCOT",
    gpuCount: null,
    ratedPowerMW: 0,
    plannedPowerMW: 500,
    ...over,
  };
}

// ─── view param ──────────────────────────────────────────────────────────────

test("parseView: known views pass, anything else is the facility view", () => {
  assert.equal(parseView("clusters"), "clusters");
  assert.equal(parseView("stress"), "stress");
  assert.equal(parseView("dc"), "dc");
  assert.equal(parseView(null), "dc");
  assert.equal(parseView(undefined), "dc");
  assert.equal(parseView("CLUSTERS"), "dc");
  assert.equal(parseView("<script>"), "dc");
});

// ─── region bucket ──────────────────────────────────────────────────────────

test("clusterRTO: the seven buckets pass through, sub-ISOs fold into their region", () => {
  for (const rto of CLUSTER_RTOS) assert.equal(clusterRTO(rto), rto);
  assert.equal(clusterRTO("CAISO"), "WECC");
  assert.equal(clusterRTO(" caiso "), "WECC");
  assert.equal(clusterRTO("ISO-NE"), "NPCC");
  assert.equal(clusterRTO("NYISO"), "NPCC");
  assert.equal(clusterRTO("PJM (Dominion)"), "PJM");
});

test("clusterRTO: blank or unknown regions are null, never a default bucket", () => {
  assert.equal(clusterRTO(""), null);
  assert.equal(clusterRTO(null), null);
  assert.equal(clusterRTO(undefined), null);
  assert.equal(clusterRTO("Non-RTO"), null);
  assert.equal(clusterRTO("Hydro-Québec"), null);
});

test("clusterRTO: every gridRegion in the shipped dataset lands in a bucket", () => {
  // Otherwise an RTO focus from the Grid Operator table would silently drop
  // clusters the map cannot place. Add the new region to clusterRTO instead.
  const file = join(process.cwd(), "server", "data", "clusters.json");
  const root = JSON.parse(readFileSync(file, "utf8")) as { clusters: Array<{ id: string; gridRegion?: string }> };
  const unplaced = root.clusters.filter((c) => clusterRTO(c.gridRegion) === null).map((c) => `${c.id}:${c.gridRegion}`);
  assert.deepEqual(unplaced, []);
});

// ─── marker size ────────────────────────────────────────────────────────────

test("clusterPinRadius: 4 px floor, 7 px at a gigawatt, 13 px ceiling, never NaN", () => {
  assert.equal(clusterPinRadius(0), 4);
  assert.equal(clusterPinRadius(-5), 4);
  assert.equal(clusterPinRadius(Number.NaN), 4);
  assert.equal(clusterPinRadius(1000), 7);
  assert.ok(Math.abs(clusterPinRadius(5000) - 10.708) < 0.01);
  assert.equal(clusterPinRadius(1e9), 13);
});

test("clusterPinRadius: monotonic in planned MW", () => {
  let prev = -1;
  for (const mw of [0, 10, 50, 100, 300, 600, 1000, 2000, 5000, 9000]) {
    const r = clusterPinRadius(mw);
    assert.ok(r >= prev, `${mw} MW gave ${r} after ${prev}`);
    prev = r;
  }
});

// ─── coordinates ────────────────────────────────────────────────────────────

test("hasCoords: finite, in-range pairs only", () => {
  assert.equal(hasCoords(row()), true);
  assert.equal(hasCoords(row({ location: { lat: Number.NaN, lng: -99 } })), false);
  assert.equal(hasCoords(row({ location: { lat: 95, lng: -99 } })), false);
  assert.equal(hasCoords(row({ location: { lat: 32, lng: 181 } })), false);
  assert.equal(hasCoords({ location: undefined as unknown as ClusterPoint["location"] }), false);
});

// ─── filters ────────────────────────────────────────────────────────────────

test("clusterPassesFilters: empty status list means every status", () => {
  assert.equal(clusterPassesFilters(row({ status: "announced" }), [], null), true);
  assert.equal(clusterPassesFilters(row({ status: "announced" }), ["operational"], null), false);
  assert.equal(clusterPassesFilters(row({ status: "announced" }), ["operational", "announced"], null), true);
});

test("clusterPassesFilters: an RTO focus keeps placed clusters in that region only", () => {
  assert.equal(clusterPassesFilters(row({ gridRegion: "ERCOT" }), [], "ERCOT"), true);
  assert.equal(clusterPassesFilters(row({ gridRegion: "CAISO" }), [], "WECC"), true);
  assert.equal(clusterPassesFilters(row({ gridRegion: "PJM" }), [], "ERCOT"), false);
  assert.equal(clusterPassesFilters(row({ gridRegion: "" }), [], "ERCOT"), false);
  assert.equal(clusterPassesFilters(row({ gridRegion: "" }), [], null), true);
});

// ─── overlay numbers ────────────────────────────────────────────────────────

test("clusterStats: planned sums every row, energized sums rated MW at operational rows only", () => {
  const s = clusterStats([
    row({ status: "operational", plannedPowerMW: 1200, ratedPowerMW: 618, gpuCount: 100_000 }),
    row({ status: "construction", plannedPowerMW: 2000, ratedPowerMW: 300, gpuCount: null }),
    row({ status: "announced", plannedPowerMW: 5000, ratedPowerMW: 0, gpuCount: 0 }),
    row({ status: "operational", plannedPowerMW: 0, ratedPowerMW: 50, gpuCount: 4_000 }),
  ]);
  assert.equal(s.count, 4);
  assert.equal(s.plannedMW, 8200);
  assert.equal(s.operationalMW, 668);
  assert.deepEqual(s.byStatus, { operational: 2, construction: 1, announced: 1 });
  assert.equal(s.gpus, 104_000);
  assert.equal(s.withGpuData, 2);
});

test("clusterStats: bad numbers count as zero and an empty list is all zeros", () => {
  const s = clusterStats([row({ plannedPowerMW: Number.NaN, ratedPowerMW: -1, status: "operational" })]);
  assert.equal(s.plannedMW, 0);
  assert.equal(s.operationalMW, 0);
  const empty = clusterStats([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.plannedMW, 0);
  assert.deepEqual(empty.byStatus, { operational: 0, construction: 0, announced: 0 });
});

// ─── field helpers ──────────────────────────────────────────────────────────

test("isEstimated reads the row's estimated field list", () => {
  assert.equal(isEstimated(row({ estimated: ["plannedPowerMW"] }), "plannedPowerMW"), true);
  assert.equal(isEstimated(row({ estimated: ["gpuCount"] }), "plannedPowerMW"), false);
  assert.equal(isEstimated(row({ estimated: [] }), "plannedPowerMW"), false);
  assert.equal(isEstimated(row({ estimated: "plannedPowerMW" }), "plannedPowerMW"), false);
  assert.equal(isEstimated(row({ estimated: undefined }), "plannedPowerMW"), false);
});

test("clusterLabelMinMW follows the facility view's zoom rule", () => {
  assert.equal(clusterLabelMinMW(3), null);
  assert.equal(clusterLabelMinMW(5.9), null);
  assert.equal(clusterLabelMinMW(6), 1000);
  assert.equal(clusterLabelMinMW(7), 1000);
  assert.equal(clusterLabelMinMW(8), 0);
  assert.equal(clusterLabelMinMW(Number.NaN), null);
});

test("formatClusterMW: MW below a gigawatt, GW with one decimal from there", () => {
  assert.equal(formatClusterMW(618), "618 MW");
  assert.equal(formatClusterMW(999.6), "1,000 MW");
  assert.equal(formatClusterMW(1000), "1.0 GW");
  assert.equal(formatClusterMW(1200), "1.2 GW");
  assert.equal(formatClusterMW(5000), "5.0 GW");
  assert.equal(formatClusterMW(0), "0 MW");
  assert.equal(formatClusterMW(Number.NaN), "0 MW");
});

test("knownChip hides placeholder chip names", () => {
  assert.equal(knownChip("NVIDIA GB200"), "NVIDIA GB200");
  assert.equal(knownChip("Google TPU"), "Google TPU");
  assert.equal(knownChip("undisclosed"), null);
  assert.equal(knownChip("Unknown"), null);
  assert.equal(knownChip("unspecified"), null);
  assert.equal(knownChip(""), null);
  assert.equal(knownChip(null), null);
});
