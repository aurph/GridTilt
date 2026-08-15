// Strings are verbatim from clusters.json. energySource is curated prose, so a
// wording change lands here first.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyEnergySource,
  tallyEnergySources,
  classifiedSiteCount,
  clusterPowerMW,
  ENERGY_SOURCES,
  ENERGY_LABELS,
  ENERGY_NOTES,
} from "../energy-source";

test("reads real strings out of clusters.json", () => {
  assert.deepEqual(classifyEnergySource("grid"), ["grid"]);
  assert.deepEqual(classifyEnergySource("grid + on-site gas"), ["gas", "grid"]);
  assert.deepEqual(classifyEnergySource("grid (DTE) + battery"), ["battery", "grid"]);
  assert.deepEqual(classifyEnergySource("nuclear (Susquehanna BTM)"), ["nuclear"]);
  assert.deepEqual(classifyEnergySource("grid (hydro)"), ["hydro", "grid"]);
});

test("a planned SMR counts as nuclear", () => {
  assert.deepEqual(classifyEnergySource("nuclear (Oklo SMR, planned) + grid"), [
    "nuclear",
    "grid",
  ]);
});

test("three sources in one string all survive", () => {
  assert.deepEqual(classifyEnergySource("on-site gas + grid + battery"), [
    "gas",
    "battery",
    "grid",
  ]);
});

test("unrecognised or missing text classifies as nothing, never as grid", () => {
  for (const bad of [null, undefined, "", "   ", "unknown", "TBD"]) {
    assert.deepEqual(classifyEnergySource(bad), [], `should refuse ${JSON.stringify(bad)}`);
  }
});

test("tallies overlap on purpose and must not be read as a share", () => {
  const clusters = [
    { energySource: "grid + on-site gas", ratedPowerMW: 100 },
    { energySource: "grid", ratedPowerMW: 50 },
  ];
  const tally = tallyEnergySources(clusters);
  const grid = tally.find((t) => t.source === "grid");
  const gas = tally.find((t) => t.source === "gas");
  assert.equal(grid?.siteCount, 2);
  assert.equal(gas?.siteCount, 1);
  // 2 + 1 exceeds the 2 real sites. Any UI dividing by a total would be lying.
  assert.equal(
    tally.reduce((s, t) => s + t.siteCount, 0),
    3,
  );
  assert.equal(classifiedSiteCount(clusters), 2, "the honest denominator is the site count");
});

test("planned power stands in when rated power is absent", () => {
  const [row] = tallyEnergySources([{ energySource: "gas", plannedPowerMW: 400 }]);
  assert.equal(row.totalMW, 400);
});

test("a contracted-but-unbuilt reactor reports planned, not rated", () => {
  // Verbatim shape of the Oklo/Kairos SMR rows: rated 0, real number in planned.
  // Printing 0 would say the site has no power; printing it as rated would claim
  // capacity that does not exist yet.
  assert.deepEqual(clusterPowerMW({ ratedPowerMW: 0, plannedPowerMW: 500 }), {
    mw: 500,
    basis: "planned",
  });
});

test("rated wins when both are present", () => {
  assert.deepEqual(clusterPowerMW({ ratedPowerMW: 300, plannedPowerMW: 900 }), {
    mw: 300,
    basis: "rated",
  });
});

test("no usable figure reports a null basis rather than a zero reading", () => {
  for (const c of [{}, { ratedPowerMW: 0 }, { ratedPowerMW: null, plannedPowerMW: null }]) {
    assert.deepEqual(clusterPowerMW(c), { mw: 0, basis: null }, JSON.stringify(c));
  }
});

test("a site with no usable power still counts as a site", () => {
  const [row] = tallyEnergySources([{ energySource: "gas", ratedPowerMW: null }]);
  assert.equal(row.siteCount, 1);
  assert.equal(row.totalMW, 0);
});

test("unclassifiable sites are excluded from the denominator", () => {
  assert.equal(classifiedSiteCount([{ energySource: "grid" }, { energySource: null }]), 1);
});

test("tally is ordered by site count, biggest first", () => {
  const tally = tallyEnergySources([
    { energySource: "gas" },
    { energySource: "grid" },
    { energySource: "grid" },
    { energySource: "grid" },
  ]);
  assert.deepEqual(
    tally.map((t) => [t.source, t.siteCount]),
    [
      ["grid", 3],
      ["gas", 1],
    ],
  );
});

test("every source has a label and a plain-language note", () => {
  for (const s of ENERGY_SOURCES) {
    assert.ok(ENERGY_LABELS[s], `${s} needs a label`);
    assert.ok(ENERGY_NOTES[s], `${s} needs a note`);
  }
});

test("empty input yields no rows", () => {
  assert.deepEqual(tallyEnergySources([]), []);
  assert.equal(classifiedSiteCount([]), 0);
});
