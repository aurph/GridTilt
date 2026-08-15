// Regression guard: the Overview card listed data centers as a fourth end-use
// sector, adding 288 TWh on top of the load already containing it and printing
// 4,490 TWh.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  US_SECTOR_DEMAND,
  DATA_CENTER_LOAD,
  sectorTotalTWh,
  sectorShare,
  demandTrough,
  latestDemand,
  pctChange,
} from "../sector-demand";

test("the end-use sectors are exactly the three that exist", () => {
  assert.deepEqual(
    US_SECTOR_DEMAND.map((s) => s.sector),
    ["Residential", "Commercial", "Industrial"],
  );
});

test("data centers are not one of the sectors", () => {
  const names = US_SECTOR_DEMAND.map((s) => s.sector.toLowerCase());
  assert.ok(
    !names.some((n) => n.includes("data")),
    "data-center load is metered inside commercial and industrial, so listing it as a peer double counts it",
  );
});

test("the sector total excludes data-center load", () => {
  const total = sectorTotalTWh();
  assert.equal(total, 4202, "1,658 + 1,569 + 975");
  assert.notEqual(
    total,
    4202 + DATA_CENTER_LOAD.twh,
    "4,490 was the old double-counted figure and must not come back",
  );
});

test("adding the data-center figure would reproduce the old wrong total", () => {
  // Pinned so the relationship is documented rather than rediscovered: the
  // residual between the sector sum and the total demand figure is close to the
  // data-center load, which is what made the bug plausible.
  assert.equal(sectorTotalTWh() + DATA_CENTER_LOAD.twh, 4490);
});

test("data-center load is flagged as an estimate, not a measurement", () => {
  // EIA's end-use accounting has no data-center category to meter this from, so
  // it is derived however it was arrived at and must render as an estimate.
  assert.equal(DATA_CENTER_LOAD.estimated, true);
});

test("shares are taken against the sector sum", () => {
  const total = sectorTotalTWh();
  const residential = sectorShare(US_SECTOR_DEMAND[0].twh, total);
  assert.ok(residential !== null && Math.abs(residential - 39.46) < 0.1, `got ${residential}`);
  const all = US_SECTOR_DEMAND.reduce((s, x) => s + (sectorShare(x.twh, total) ?? 0), 0);
  assert.ok(Math.abs(all - 100) < 0.001, `sector shares must total 100, got ${all}`);
});

test("no share rather than a fabricated zero", () => {
  assert.equal(sectorShare(100, 0), null);
  assert.equal(sectorShare(100, NaN), null);
  assert.equal(sectorShare(NaN, 100), null);
});

const SERIES = [
  { year: "2019", demand: 3955 },
  { year: "2020", demand: 3802 },
  { year: "2021", demand: 3930 },
  { year: "2022", demand: 4050 },
  { year: "2025", demand: 4490 },
];

test("the trough is 2020, not the 2022 the copy used to claim", () => {
  assert.deepEqual(demandTrough(SERIES), { year: "2020", twh: 3802 });
});

test("the rise from the real trough is not the 15% the copy used to claim", () => {
  const low = demandTrough(SERIES);
  const now = latestDemand(SERIES);
  const change = pctChange(low.twh, now.twh);
  assert.ok(change !== null && Math.abs(change - 18.1) < 0.1, `got ${change}`);
  // And the old sentence's own arithmetic did not hold either: 2022 to 2025 is
  // about 11%, not 15%.
  assert.ok(Math.abs(pctChange(4050, 4490) - 10.86) < 0.1);
});

test("unmeasured years are skipped rather than read as zero", () => {
  const withGaps = [
    { year: "2019", demand: null },
    { year: "2020", demand: 3802 },
    { year: "2021", demand: null },
  ];
  assert.deepEqual(demandTrough(withGaps), { year: "2020", twh: 3802 });
  assert.deepEqual(latestDemand(withGaps), { year: "2020", twh: 3802 });
});

test("an all-null series yields nothing rather than a zero trough", () => {
  const empty = [{ year: "2020", demand: null }];
  assert.equal(demandTrough(empty), null);
  assert.equal(latestDemand(empty), null);
  assert.deepEqual(demandTrough([]), null);
});

test("percent change refuses an unusable base", () => {
  assert.equal(pctChange(0, 100), null);
  assert.equal(pctChange(NaN, 100), null);
});
