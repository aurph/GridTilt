import { test } from "node:test";
import assert from "node:assert/strict";
import { electricityView, fmtMonth, type ElectricityUse } from "../electricity-live";
import { electricityData } from "../../data/electricity-demand";
import { US_SECTOR_DEMAND } from "../sector-demand";

const sectors = [{ sector: "Residential", twh: 1600, yoy: 3 }];
const live: Extract<ElectricityUse, { configured: true }> = {
  configured: true,
  source: "EIA MER",
  sourceUrl: "https://eia",
  retrievedAt: "2026-11-03T00:00:00Z",
  stale: false,
  endUse: [
    { year: "2023", twh: 4011 },
    { year: "2024", twh: 4110 },
  ],
  annual: { period: "2024", retailTotalTwh: 3900, sectors },
  rolling: {
    period: "12 months through 2026-07",
    through: "2026-07",
    endUseTwh: 4300,
    endUseYoy: 2.5,
    retailTotalTwh: 4100,
    retailYoy: 2,
    sectors,
  },
};

test("fmtMonth renders a data month without a timezone shift", () => {
  assert.equal(fmtMonth("2026-07"), "Jul 2026");
  assert.equal(fmtMonth("2026-01"), "Jan 2026");
});

test("falls back to the static tables, dated by retrieval, with no data", () => {
  for (const data of [undefined, { configured: false, howTo: "x" } as ElectricityUse]) {
    const v = electricityView(data);
    assert.equal(v.live, false);
    assert.equal(v.series, electricityData);
    assert.equal(v.sectors, US_SECTOR_DEMAND);
    assert.match(v.asOf, /^retrieved /);
    assert.equal(v.rolling, null);
  }
});

test("prefers EIA's rolling figures and attaches the data-center report years", () => {
  const v = electricityView(live);
  assert.equal(v.live, true);
  assert.equal(v.sectorPeriod, "12 months through Jul 2026");
  assert.equal(v.sectorTotal, 4100);
  assert.equal(v.asOf, "data through Jul 2026");
  assert.deepEqual(v.series[1], { year: "2024", demand: 4110, dcDemand: 192 });
  assert.equal(v.series[0].dcDemand, 176);
});

test("uses the annual figures when no rolling window is complete", () => {
  const v = electricityView({ ...live, rolling: null });
  assert.equal(v.sectorPeriod, "2024");
  assert.equal(v.sectorTotal, 3900);
  assert.equal(v.asOf, "data through 2024");
});

test("an empty end-use answer stays on the static tables", () => {
  assert.equal(electricityView({ ...live, endUse: [] }).live, false);
});

test("carries the stale flag through", () => {
  assert.equal(electricityView({ ...live, stale: true }).stale, true);
});
