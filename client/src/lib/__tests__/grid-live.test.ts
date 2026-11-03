import { test } from "node:test";
import assert from "node:assert/strict";
import { aiSharePct, fmtGW, fmtPeriodET, periodToDate, sparkAxis } from "../grid-live";

test("periodToDate reads an EIA UTC hour", () => {
  assert.equal(periodToDate("2026-11-03T16").toISOString(), "2026-11-03T16:00:00.000Z");
});

test("fmtPeriodET renders the hour in Eastern time with the date", () => {
  // 16:00 UTC on Nov 3 is 11 AM EST (DST ended Nov 1)
  assert.equal(fmtPeriodET("2026-11-03T16"), "11 AM ET, Nov 3");
  // 03:00 UTC on Nov 4 is still Nov 3 in the East
  assert.equal(fmtPeriodET("2026-11-04T03"), "10 PM ET, Nov 3");
});

test("fmtGW converts megawatts to gigawatts with one decimal by default", () => {
  assert.equal(fmtGW(459058), "459.1");
  assert.equal(fmtGW(459058, 0), "459");
  assert.equal(fmtGW(1_250_000), "1,250.0");
});

test("aiSharePct is the tracked nameplate as a share of current demand, one decimal", () => {
  assert.equal(aiSharePct(9_500, 95_000), 10);
  assert.equal(aiSharePct(1_234, 459_058), 0.3);
  assert.equal(aiSharePct(100, 0), null);
  assert.equal(aiSharePct(NaN, 100), null);
});

test("sparkAxis pads the data range and never starts at zero for a flat series", () => {
  const axis = sparkAxis([
    { t: "a", mw: 440_000 },
    { t: "b", mw: 460_000 },
  ]);
  assert.ok(axis.min < 440_000 && axis.min > 400_000);
  assert.ok(axis.max > 460_000 && axis.max < 500_000);
  assert.deepEqual(sparkAxis([]), { min: 0, max: 1 });
});
