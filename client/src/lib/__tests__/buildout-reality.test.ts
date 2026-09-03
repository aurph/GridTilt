// The proportion bar must partition the announced build-out exactly; a
// segment sum that drifts from the total would make the chart quietly lie.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBuildoutReality, EPOCH_CAPEX_B_PER_GW } from "../buildout-reality";

const METRICS = {
  totalPlannedMW: 124_646,
  operationalMW: 11_189,
  byStatus: [
    { status: "operational", ratedMW: 11_189, plannedMW: 19_309 },
    { status: "construction", ratedMW: 852, plannedMW: 70_000 },
    { status: "announced", ratedMW: 0, plannedMW: 35_337 },
  ],
};

test("segments partition totalPlannedMW exactly", () => {
  const r = computeBuildoutReality(METRICS);
  assert.equal(r.energizedMW + r.growingOnSiteMW + r.constructionMW + r.announcedMW, r.totalPlannedMW);
  assert.equal(r.energizedMW, 11_189);
  assert.equal(r.growingOnSiteMW, 19_309 - 11_189);
  assert.equal(r.announcedMW, 35_337);
});

test("energized share and capex context", () => {
  const r = computeBuildoutReality(METRICS);
  assert.ok(Math.abs(r.energizedShare - 11_189 / 124_646) < 1e-9);
  assert.equal(r.unbuiltMW, 124_646 - 11_189);
  assert.equal(r.unbuiltCapexB, Math.round(((124_646 - 11_189) / 1000) * EPOCH_CAPEX_B_PER_GW));
});

test("degenerate inputs stay safe", () => {
  const r = computeBuildoutReality({ totalPlannedMW: 0, operationalMW: 0, byStatus: [] });
  assert.equal(r.energizedShare, 0);
  assert.equal(r.unbuiltCapexB, 0);
  // rated above planned on operational clusters must not go negative
  const odd = computeBuildoutReality({
    totalPlannedMW: 100,
    operationalMW: 90,
    byStatus: [{ status: "operational", ratedMW: 90, plannedMW: 80 }],
  });
  assert.equal(odd.growingOnSiteMW, 0);
});
