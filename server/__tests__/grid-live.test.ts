// Pure-parser tests for the live grid snapshot. Fixtures mirror the real
// payload shapes captured from each feed on 2026-09-01 (trimmed to
// hand-computable size); the fetch/cache layer is not network-tested here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFuel,
  foldFuel,
  parseErcot,
  parseCaiso,
  parseMiso,
  misoIntervalKey,
  isLiveRto,
  LIVE_RTOS,
} from "../grid-live";

test("normalizeFuel folds source vocabularies onto canonical keys", () => {
  assert.equal(normalizeFuel("Natural Gas"), "gas");
  assert.equal(normalizeFuel("Coal and Lignite"), "coal");
  assert.equal(normalizeFuel("Power Storage"), "storage");
  assert.equal(normalizeFuel("Battery Storage"), "storage");
  assert.equal(normalizeFuel("Batteries"), "storage");
  assert.equal(normalizeFuel("Small hydro"), "hydro");
  assert.equal(normalizeFuel("Large Hydro"), "hydro");
  assert.equal(normalizeFuel("Biogas"), "biomass");
  assert.equal(normalizeFuel("Imports"), "imports");
  assert.equal(normalizeFuel("Other"), "other");
});

test("foldFuel merges same-canonical slices and sorts by MW desc", () => {
  const out = foldFuel([
    { fuel: "hydro", mw: 215 },
    { fuel: "hydro", mw: 2390 },
    { fuel: "gas", mw: 9701 },
    { fuel: "storage", mw: -865.9 },
  ]);
  assert.deepEqual(out, [
    { fuel: "gas", mw: 9701 },
    { fuel: "hydro", mw: 2605 },
    { fuel: "storage", mw: -866 },
  ]);
});

test("parseErcot: actuals only, latest day + interval for fuel, peak and current", () => {
  const supplyDemand = {
    lastUpdated: "2026-09-01 10:40:00-0500",
    data: [
      { demand: 67304, forecast: 0, timestamp: "2026-09-01 00:00:00-0500" },
      { demand: 71210.4, forecast: 0, timestamp: "2026-09-01 00:05:00-0500" },
      // Future rows keep a populated demand but are flagged forecast:1 —
      // they must not leak into "today's peak so far" (real bug caught live).
      { demand: 85553, forecast: 1, timestamp: "2026-09-01 16:40:00-0500" },
      { demand: 0, forecast: 0, timestamp: "2026-09-01 00:10:00-0500" },
    ],
  };
  const fuelMix = {
    data: {
      "2026-08-31": { "2026-08-31 23:55:00-0500": { Wind: { gen: 1 } } },
      "2026-09-01": {
        "2026-09-01 10:35:00-0500": { Wind: { gen: 100 } },
        "2026-09-01 10:40:00-0500": {
          "Natural Gas": { gen: 29495.6 },
          "Coal and Lignite": { gen: 9494.5 },
          "Power Storage": { gen: -865.9 },
        },
      },
    },
  };
  const s = parseErcot(supplyDemand, fuelMix);
  assert.equal(s.asOf, "2026-09-01 10:40:00-0500");
  assert.deepEqual(s.demand, [
    { time: "00:00", mw: 67304 },
    { time: "00:05", mw: 71210 },
  ]);
  assert.equal(s.currentDemandMW, 71210);
  assert.equal(s.peakDemandMW, 71210);
  assert.deepEqual(s.fuelMix, [
    { fuel: "gas", mw: 29496 },
    { fuel: "coal", mw: 9495 },
    { fuel: "storage", mw: -866 },
  ]);
});

test("parseCaiso: skips empty-actual future rows; folds hydro columns", () => {
  const demandCsv = [
    "Time,Day ahead forecast,Hour ahead forecast,Current demand,Demand response",
    "00:00,28618,27050,26956,",
    "00:05,26794,27050,27121,",
    "00:10,26794,27050,,", // future: no actual yet
  ].join("\n");
  const fuelCsv = [
    "Time,Solar,Wind,Small hydro,Large Hydro,Natural Gas,Batteries",
    "00:00,-64,3421,215,2390,9701,2026",
    "00:05,-65,3423,,,,", // incomplete row must be ignored
  ].join("\n");
  const s = parseCaiso(demandCsv, fuelCsv);
  assert.deepEqual(s.demand, [
    { time: "00:00", mw: 26956 },
    { time: "00:05", mw: 27121 },
  ]);
  assert.equal(s.currentDemandMW, 27121);
  assert.equal(s.peakDemandMW, 27121);
  assert.deepEqual(s.fuelMix, [
    { fuel: "gas", mw: 9701 },
    { fuel: "wind", mw: 3421 },
    { fuel: "hydro", mw: 2605 },
    { fuel: "storage", mw: 2026 },
    { fuel: "solar", mw: -64 },
  ]);
  assert.equal(s.asOf, "00:00 PT"); // last complete fuel row stamps the mix
});

test("parseMiso: five-minute load series + comma-tolerant fuel numbers", () => {
  const load = {
    LoadInfo: {
      RefId: "01-Sep-2026 - Interval 10:35 EST",
      FiveMinTotalLoad: [
        { Load: { Time: "00:00", Value: "87744" } },
        { Load: { Time: "00:05", Value: "87394" } },
      ],
    },
  };
  const fuel = {
    Fuel: {
      Type: [
        // An earlier interval of the same day: must be excluded, not summed
        // (the feed returns every interval; folding them read ~4 TW of gas).
        { INTERVALEST: "2026-09-01 12:00:00 AM", CATEGORY: "Coal", ACT: "30000" },
        { INTERVALEST: "2026-09-01 12:00:00 AM", CATEGORY: "Natural Gas", ACT: "29000" },
        { INTERVALEST: "2026-09-01 10:35:00 AM", CATEGORY: "Coal", ACT: "32,290" },
        { INTERVALEST: "2026-09-01 10:35:00 AM", CATEGORY: "Natural Gas", ACT: "31890" },
        { INTERVALEST: "2026-09-01 10:35:00 AM", CATEGORY: "Battery Storage", ACT: "-236" },
        // The freshest interval streams in partially (observed live: only
        // Imports present); an incomplete latest interval must be skipped
        // in favor of the newest complete one.
        { INTERVALEST: "2026-09-01 10:40:00 AM", CATEGORY: "Imports", ACT: "1891" },
      ],
    },
  };
  const s = parseMiso(load, fuel);
  assert.equal(s.asOf, "01-Sep-2026 - Interval 10:35 EST");
  assert.equal(s.currentDemandMW, 87394);
  assert.equal(s.peakDemandMW, 87744);
  assert.deepEqual(s.fuelMix, [
    { fuel: "coal", mw: 32290 },
    { fuel: "gas", mw: 31890 },
    { fuel: "storage", mw: -236 },
  ]);
});

test("misoIntervalKey orders 12-hour interval stamps correctly", () => {
  // Lexical string order would put "1:00 PM" before "2:00 AM"; the key must not.
  assert.ok(misoIntervalKey("2026-09-01 1:00:00 PM") > misoIntervalKey("2026-09-01 2:00:00 AM"));
  assert.equal(misoIntervalKey("2026-09-01 12:00:00 AM"), 0); // midnight
  assert.equal(misoIntervalKey("2026-09-01 12:05:00 PM"), 725); // noon + 5
  assert.equal(misoIntervalKey("garbage"), -1);
});

test("route guard vocabulary is exactly the supported set", () => {
  assert.deepEqual(LIVE_RTOS, ["ercot", "caiso", "miso"]);
  assert.ok(isLiveRto("ercot") && isLiveRto("caiso") && isLiveRto("miso"));
  assert.ok(!isLiveRto("pjm") && !isLiveRto("spp") && !isLiveRto(""));
});
