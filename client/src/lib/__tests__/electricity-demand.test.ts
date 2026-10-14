// Regression guard: the landing chart plotted 310 TWh of US data-center use for
// 2023 where DOE/LBNL publish 176, ran a smooth curve through years nobody
// modelled, carried a 2026-2030 "GridTilt projection" with no stated
// assumptions, and labelled an inflated 2023-2025 total as EIA's.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  electricityData,
  DATA_CENTER_ANCHORS,
  US_END_USE_SOURCE,
} from "../../data/electricity-demand";

const byYear = (y: string) => electricityData.find((d) => d.year === y);

test("2023 data-center use is the published 176 TWh, not 310", () => {
  assert.equal(byYear("2023")?.dcDemand, 176);
});

test("years no report models stay unknown instead of being interpolated", () => {
  const modelled = new Set(DATA_CENTER_ANCHORS.map((a) => a.year));
  for (const d of electricityData) {
    if (!modelled.has(d.year)) {
      assert.equal(d.dcDemand, null, `${d.year} has no published data-center figure`);
    }
  }
});

test("every data-center point is one a named source published", () => {
  for (const d of electricityData) {
    if (d.dcDemand === null) continue;
    const anchor = DATA_CENTER_ANCHORS.find((a) => a.year === d.year);
    assert.ok(anchor, `${d.year} is plotted without a source`);
    assert.equal(anchor.twh, d.dcDemand);
    assert.ok(anchor.source.length > 0);
    assert.ok(anchor.sourceUrl.startsWith("https://"));
  }
});

test("the series holds measurements only: no projection fields or future years", () => {
  const latest = Math.max(...electricityData.map((d) => Number(d.year)));
  assert.ok(latest <= 2025, `a ${latest} row can only be a projection`);
  for (const d of electricityData) {
    assert.deepEqual(Object.keys(d).sort(), ["dcDemand", "demand", "year"]);
  }
});

test("totals are EIA's end use for the years that were overstated", () => {
  // MER Table 7.1 "Electricity End Use, Total", billion kWh. The chart showed
  // 4,195, 4,380 and 4,490 for these years.
  assert.equal(byYear("2023")?.demand, 4011);
  assert.equal(byYear("2024")?.demand, 4110);
  assert.equal(byYear("2025")?.demand, 4195);
  assert.ok(US_END_USE_SOURCE.url.startsWith("https://www.eia.gov/"));
});

test("both series are in TWh at a plausible scale", () => {
  for (const d of electricityData) {
    if (d.demand !== null) {
      assert.ok(d.demand > 3000 && d.demand < 5000, `${d.year} total ${d.demand} is not US TWh`);
    }
    if (d.dcDemand !== null && d.demand !== null) {
      const share = d.dcDemand / d.demand;
      assert.ok(share > 0 && share < 0.1, `${d.year} data-center share ${share} is off by a unit`);
    }
  }
});

test("a gap in the total series stays a gap", () => {
  for (const d of electricityData) {
    assert.ok(d.demand === null || Number.isFinite(d.demand), `${d.year} is not a number or null`);
  }
});
