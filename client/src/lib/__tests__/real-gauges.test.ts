/**
 * Real gauges: the numbers replacing the synthetic indices. A silent bug
 * here puts a wrong headline on the front page - full coverage.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildBuildoutHistory,
  computeTrackedPower,
  filterTrackedFacilities,
  fmtGW,
  parseOpenDate,
  tightestRTO,
  type FacilityLite,
} from "../real-gauges";

const F = (status: string, powerMW: number | null, openDate?: string, name?: string): FacilityLite => ({
  status,
  powerMW,
  openDate,
  name,
});

describe("filterTrackedFacilities", () => {
  it("applies the same >=400 MW floor the Power map advertises", () => {
    const kept = filterTrackedFacilities([F("operational", 400), F("operational", 399), F("operational", null)]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].powerMW, 400);
  });
  it("empty and missing input yield empty output", () => {
    assert.deepEqual(filterTrackedFacilities([]), []);
    assert.deepEqual(filterTrackedFacilities(undefined as never), []);
  });
});

describe("computeTrackedPower", () => {
  it("buckets MW and counts by status; tracked = operational + construction", () => {
    const t = computeTrackedPower([
      F("operational", 1000),
      F("operational", 500),
      F("construction", 700),
      F("announced", 9000),
    ]);
    assert.equal(t.operationalMW, 1500);
    assert.equal(t.constructionMW, 700);
    assert.equal(t.announcedMW, 9000);
    assert.equal(t.trackedMW, 2200);
    assert.equal(t.operationalCount, 2);
    assert.equal(t.constructionCount, 1);
    assert.equal(t.announcedCount, 1);
  });
  it("announced is never in the headline number", () => {
    const t = computeTrackedPower([F("announced", 5000)]);
    assert.equal(t.trackedMW, 0);
  });
  it("null/negative/NaN MW counts the facility but adds zero", () => {
    const t = computeTrackedPower([F("operational", null), F("operational", -50), F("operational", NaN)]);
    assert.equal(t.operationalMW, 0);
    assert.equal(t.operationalCount, 3);
  });
  it("unknown statuses are ignored; empty input is all zeros", () => {
    assert.equal(computeTrackedPower([F("retired", 100)]).trackedMW, 0);
    assert.equal(computeTrackedPower([]).trackedMW, 0);
    assert.equal(computeTrackedPower(undefined as never).trackedMW, 0);
  });
});

describe("fmtGW", () => {
  it("formats MW as GW", () => {
    assert.equal(fmtGW(23600), "23.6 GW");
    assert.equal(fmtGW(500), "0.5 GW");
    assert.equal(fmtGW(30200, 2), "30.20 GW");
  });
});

describe("parseOpenDate", () => {
  it("bare year -> Jan 1", () => {
    assert.equal(parseOpenDate("2023"), Date.UTC(2023, 0, 1));
  });
  it("year + quarter -> quarter start", () => {
    assert.equal(parseOpenDate("2026 Q1"), Date.UTC(2026, 0, 1));
    assert.equal(parseOpenDate("2026 Q2"), Date.UTC(2026, 3, 1));
    assert.equal(parseOpenDate("2026 Q4"), Date.UTC(2026, 9, 1));
  });
  it("tolerates spacing", () => {
    assert.equal(parseOpenDate(" 2025  Q3 "), Date.UTC(2025, 6, 1));
  });
  it("garbage, empty, and null are excluded, not guessed", () => {
    for (const bad of [null, undefined, "", "soon", "Q3 2026", "2026 Q5", "2026-03"]) {
      assert.equal(parseOpenDate(bad as never), null, String(bad));
    }
  });
});

describe("buildBuildoutHistory", () => {
  it("cumulative operational series ordered by open date", () => {
    const h = buildBuildoutHistory([
      F("operational", 500, "2024", "B"),
      F("operational", 1000, "2022", "A"),
      F("construction", 700, "2026 Q3", "C"),
    ]);
    assert.deepEqual(h.online.map((p) => p.cumMW), [1000, 1500]);
    assert.deepEqual(h.online.map((p) => p.addedMW), [1000, 500]);
    assert.ok(h.online[0].t < h.online[1].t);
  });
  it("pipeline continues cumulatively from the operational total", () => {
    const h = buildBuildoutHistory([
      F("operational", 1000, "2022"),
      F("construction", 700, "2026 Q3"),
      F("construction", 300, "2027"),
    ]);
    assert.deepEqual(h.pipeline.map((p) => p.cumMW), [1700, 2000]);
  });
  it("same-date facilities merge into one step and drop the single-name label", () => {
    const h = buildBuildoutHistory([
      F("operational", 100, "2023", "X"),
      F("operational", 200, "2023", "Y"),
    ]);
    assert.equal(h.online.length, 1);
    assert.equal(h.online[0].addedMW, 300);
    assert.equal(h.online[0].name, undefined);
  });
  it("single facility at a date keeps its name", () => {
    const h = buildBuildoutHistory([F("operational", 100, "2023", "Solo")]);
    assert.equal(h.online[0].name, "Solo");
  });
  it("undated facilities are excluded and counted honestly", () => {
    const h = buildBuildoutHistory([
      F("operational", 100, "2023"),
      F("operational", 200, undefined),
      F("construction", 300, "soon"),
    ]);
    assert.equal(h.online.length, 1);
    assert.equal(h.undatedCount, 2);
  });
  it("announced facilities never enter either series", () => {
    const h = buildBuildoutHistory([F("announced", 5000, "2028")]);
    assert.deepEqual(h.online, []);
    assert.deepEqual(h.pipeline, []);
  });
  it("empty input yields empty series", () => {
    const h = buildBuildoutHistory([]);
    assert.deepEqual(h.online, []);
    assert.deepEqual(h.pipeline, []);
    assert.equal(h.undatedCount, 0);
  });
});

describe("tightestRTO", () => {
  it("picks the minimum reserve margin", () => {
    const t = tightestRTO({
      ERCOT: { label: "ERCOT", reserveMargin: 15.8, aiSignal: "Critical" },
      MISO: { label: "MISO", reserveMargin: 13.4, aiSignal: "Critical" },
      SPP: { label: "SPP", reserveMargin: 27.8, aiSignal: "Low" },
    });
    assert.ok(t);
    assert.equal(t.rto, "MISO");
    assert.equal(t.reserveMarginPct, 13.4);
  });
  it("skips non-finite margins; null on empty", () => {
    const t = tightestRTO({ X: { label: "X", reserveMargin: NaN, aiSignal: "Low" } });
    assert.equal(t, null);
    assert.equal(tightestRTO({}), null);
  });
});
