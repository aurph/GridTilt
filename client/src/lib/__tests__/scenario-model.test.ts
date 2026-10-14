// Regression guard: the scenario calculator started from an unsourced 4,490 TWh
// "2025E" US total, multiplied a data-center share that already includes cooling
// by PUE again, added data-center use on top of a total that already contained
// it, and divided a six-year build by five.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEMAND_ANCHOR,
  FLEET_PUE,
  LBNL_2030_RANGE,
  SCENARIO_YEARS,
  perScenarioYear,
  scenarioUse,
} from "../scenario-model";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("the model starts from EIA's 2024 total and LBNL's 2024 data-center estimate and PUE", () => {
  assert.deepEqual(
    { year: DEMAND_ANCHOR.year, us: DEMAND_ANCHOR.usTwh, dc: DEMAND_ANCHOR.dataCenterTwh, pue: FLEET_PUE[2024] },
    { year: 2024, us: 4110, dc: 192, pue: 1.45 },
  );
});

test("with no growth and LBNL's own PUE, every year reproduces the measured 2024 figures", () => {
  for (const year of SCENARIO_YEARS) {
    const u = scenarioUse(year, 0, 1.45);
    assert.ok(near(u.dataCenterTwh, 192));
    // The total is the measured total, not the total plus data centers again.
    assert.ok(near(u.totalTwh, 4110));
  }
});

test("PUE is applied once, to the computing load, not on top of a facility total", () => {
  // Same computing load, a more efficient fleet: less electricity, in proportion.
  const at145 = scenarioUse(2030, 20, 1.45).dataCenterTwh;
  const at130 = scenarioUse(2030, 20, 1.3).dataCenterTwh;
  assert.ok(near(at130 / at145, 1.3 / 1.45));
});

test("only data-center use grows; the rest of US use stays at its 2024 level", () => {
  const u = scenarioUse(2030, 28, 1.3);
  assert.equal(u.otherTwh, 4110 - 192);
  assert.ok(near(u.totalTwh, u.otherTwh + u.dataCenterTwh));
  // (192 / 1.45) x 1.28^6 x 1.30, the base preset
  assert.equal(Math.round(u.dataCenterTwh), 757);
  assert.equal(u.dataCenterSharePct.toFixed(1), "16.2");
});

test("LBNL's 2030 range is carried as context, low <= reference <= high", () => {
  assert.ok(LBNL_2030_RANGE.low <= LBNL_2030_RANGE.reference && LBNL_2030_RANGE.reference <= LBNL_2030_RANGE.high);
  assert.deepEqual([LBNL_2030_RANGE.low, LBNL_2030_RANGE.reference, LBNL_2030_RANGE.high], [521, 649, 843]);
});

test("per-year pace spreads a total over the six timeline years, not five", () => {
  assert.equal(SCENARIO_YEARS.length, 6);
  assert.equal(perScenarioYear(60), 10);
  assert.equal(perScenarioYear(50).toFixed(1), "8.3");
});
