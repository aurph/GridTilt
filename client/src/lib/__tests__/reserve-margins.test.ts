// Regression guard: the site showed reserve margins labeled "NERC LTRA 2025"
// that matched no NERC report (PJM 17.5% for NERC's 29.7%), one figure each
// for WECC, SERC and NPCC (NERC reports them only by sub-area), and a GridTilt
// "AI load signal" that contradicted NERC's risk ratings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NERC_AREAS, REGION_AREAS, STATE_NERC_AREA, STATE_NERC_NOTE } from "../../data/nerc-reserve-margins";
import {
  areaForState,
  areasForRegion,
  byCushion,
  cushion,
  regionMarginText,
  regionRisk,
  regionRiskText,
  tightestArea,
} from "../reserve-margins";

test("the four market areas carry NERC's 2025 LTRA summer 2026 figures", () => {
  const pick = (k: string) => [NERC_AREAS[k].margin, NERC_AREAS[k].reference, NERC_AREAS[k].risk];
  assert.deepEqual(pick("PJM"), [29.7, 18.6, "Elevated"]);
  assert.deepEqual(pick("MISO"), [11.0, 8.1, "Normal"]);
  assert.deepEqual(pick("Texas RE-ERCOT"), [28.2, 13.75, "Elevated"]);
  assert.deepEqual(pick("MRO-SPP"), [32.4, 19.0, "Elevated"]);
});

test("every area cites the page of its NERC dashboard", () => {
  for (const a of Object.values(NERC_AREAS)) assert.ok(Number.isInteger(a.page) && a.page > 0, a.key);
});

test("SERC, WECC and NPCC have no single figure; they are shown by sub-area", () => {
  for (const region of ["SERC", "WECC", "NPCC"]) {
    assert.ok(REGION_AREAS[region].length > 1, region);
    assert.match(regionMarginText(region), /across \d areas/);
  }
  assert.equal(regionMarginText("PJM"), "29.7%");
});

test("the tightest area is ranked by cushion above its own reference, not by raw margin", () => {
  const t = tightestArea();
  assert.equal(t?.key, "MISO");
  assert.equal(cushion(t!), 2.9);
  // A winter-peaking area is not compared with summer figures.
  assert.ok(byCushion().every((a) => a.season === "summer 2026"));
});

test("a region's risk is its areas' level, or names the areas that differ", () => {
  assert.equal(regionRisk("PJM"), "Elevated");
  assert.equal(regionRisk("SERC"), "Normal");
  assert.equal(regionRiskText("SERC"), "Normal in all 4 areas");
  assert.equal(regionRisk("WECC"), null);
  assert.equal(regionRiskText("WECC"), "Elevated in WECC-Basin; Normal elsewhere");
  assert.equal(regionRiskText("NPCC"), "Elevated in New York; Normal elsewhere");
  assert.equal(regionRiskText("NOWHERE"), "not assessed");
});

test("no area claims NERC's 15% fallback as its own reference", () => {
  const defaults = Object.values(NERC_AREAS).filter((a) => a.referenceDefault).map((a) => a.key).sort();
  assert.deepEqual(defaults, ["SERC-Central", "SERC-East", "SERC-Southeast"]);
  assert.equal(areasForRegion("SERC").length, 4);
});

test("a state takes its own NERC area, or its region's single one", () => {
  assert.equal(areaForState("NY")?.key, "NPCC-New York");
  assert.equal(areaForState("MA")?.key, "NPCC-New England");
  assert.equal(areaForState("GA")?.key, "SERC-Southeast");
  assert.equal(areaForState("OR")?.key, "WECC-Northwest");
  assert.equal(areaForState("OR")?.season, "winter 2026-27", "a winter-peaking area says so");
  assert.equal(areaForState("MD")?.key, "PJM", "a single-area region needs no listing");
  assert.equal(areaForState("TX")?.key, "Texas RE-ERCOT");
  assert.equal(areaForState("AK"), null, "no assessed region");
});

test("every listed state points at a real area, and every note belongs to a listed state", () => {
  for (const [state, key] of Object.entries(STATE_NERC_AREA)) assert.ok(NERC_AREAS[key], `${state} -> ${key}`);
  for (const state of Object.keys(STATE_NERC_NOTE)) assert.ok(STATE_NERC_AREA[state], state);
});
