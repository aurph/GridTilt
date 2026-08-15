// These rollups drive three consumer-facing views that all claim to describe the
// same facility set. The tests pin the two ways that claim could quietly become
// false: counting unbuilt capacity as running, and treating missing power as zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  byState,
  byCompany,
  totalTrackedMW,
  shareOfTotal,
  byYear,
  parseOpenYear,
  type FacilityLike,
} from "../facility-aggregates";

function fac(over: Partial<FacilityLike> & { id: number }): FacilityLike {
  return {
    name: `Site ${over.id}`,
    company: "Amazon",
    city: "Somewhere",
    state: "VA",
    powerMW: 100,
    status: "operational",
    annualMWh: 100 * 8760,
    gridOperator: "PJM",
    ...over,
  } as FacilityLike;
}

test("groups by state, biggest total first", () => {
  const rows = byState([
    fac({ id: 1, state: "VA", powerMW: 100 }),
    fac({ id: 2, state: "TX", powerMW: 500 }),
    fac({ id: 3, state: "VA", powerMW: 300 }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.key, r.totalMW]),
    [
      ["TX", 500],
      ["VA", 400],
    ],
  );
  assert.equal(rows[1].count, 2);
});

test("running and building are never summed together", () => {
  const [row] = byState([
    fac({ id: 1, powerMW: 200, status: "operational" }),
    fac({ id: 2, powerMW: 900, status: "construction" }),
    fac({ id: 3, powerMW: 400, status: "announced" }),
  ]);
  assert.equal(row.runningMW, 200, "only operational counts as running");
  assert.equal(row.buildingMW, 1300, "construction and announced are both unbuilt");
  assert.equal(row.totalMW, 1500);
});

test("missing power is excluded and reported, never counted as zero", () => {
  const [row] = byState([
    fac({ id: 1, powerMW: 400 }),
    fac({ id: 2, powerMW: null as unknown as number }),
    fac({ id: 3, powerMW: 0 }),
  ]);
  assert.equal(row.totalMW, 400, "unusable power adds nothing");
  assert.equal(row.unknownPower, 2, "and is surfaced so the UI can say so");
  assert.equal(row.count, 3, "but the facility still exists");
});

test("largest picks the true maximum, not the first seen", () => {
  const [row] = byCompany([
    fac({ id: 1, powerMW: 300 }),
    fac({ id: 2, powerMW: 900, name: "The big one" }),
    fac({ id: 3, powerMW: 500 }),
  ]);
  assert.equal(row.largest?.name, "The big one");
});

test("a group with no usable power reports no largest", () => {
  const [row] = byCompany([fac({ id: 1, powerMW: 0 })]);
  assert.equal(row.largest, null);
  assert.equal(row.totalMW, 0);
});

test("equal totals sort by name so the order is stable", () => {
  const rows = byState([
    fac({ id: 1, state: "WY", powerMW: 100 }),
    fac({ id: 2, state: "AZ", powerMW: 100 }),
  ]);
  assert.deepEqual(rows.map((r) => r.key), ["AZ", "WY"]);
});

test("company grouping is independent of state grouping", () => {
  const rows = byCompany([
    fac({ id: 1, company: "Meta", state: "TX", powerMW: 100 }),
    fac({ id: 2, company: "Meta", state: "VA", powerMW: 100 }),
    fac({ id: 3, company: "Google", state: "TX", powerMW: 150 }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.key, r.totalMW, r.count]),
    [
      ["Meta", 200, 2],
      ["Google", 150, 1],
    ],
  );
});

test("shares are computed against the tracked total", () => {
  const all = [fac({ id: 1, powerMW: 250 }), fac({ id: 2, powerMW: 750 })];
  assert.equal(totalTrackedMW(all), 1000);
  assert.equal(shareOfTotal(250, 1000), 25);
});

test("no denominator means no share rather than zero percent", () => {
  assert.equal(shareOfTotal(100, 0), null);
  assert.equal(shareOfTotal(100, NaN), null);
  assert.equal(totalTrackedMW([]), 0);
});

test("empty input produces no rows rather than an empty group", () => {
  assert.deepEqual(byState([]), []);
  assert.deepEqual(byCompany([]), []);
});

test("opening years parse from both curated formats", () => {
  assert.equal(parseOpenYear("2023"), 2023);
  assert.equal(parseOpenYear("2026 Q1"), 2026);
});

test("an unparseable date drops the facility instead of landing in year zero", () => {
  for (const bad of [null, undefined, "", "soon", "Q1", "26", "0001", "3000"]) {
    assert.equal(parseOpenYear(bad), null, `should refuse ${JSON.stringify(bad)}`);
  }
});

test("the timeline accumulates forward", () => {
  const years = byYear([
    fac({ id: 1, openDate: "2023", powerMW: 100 }),
    fac({ id: 2, openDate: "2025 Q2", powerMW: 400 }),
  ]);
  assert.deepEqual(
    years.map((y) => [y.year, y.arrivingMW, y.cumulativeMW]),
    [
      [2023, 100, 100],
      [2024, 0, 100],
      [2025, 400, 500],
    ],
  );
});

test("a quiet year stays as a zero bar rather than closing the gap", () => {
  const years = byYear([
    fac({ id: 1, openDate: "2020", powerMW: 100 }),
    fac({ id: 2, openDate: "2024", powerMW: 100 }),
  ]);
  assert.deepEqual(years.map((y) => y.year), [2020, 2021, 2022, 2023, 2024]);
  assert.equal(years[2].arrivingMW, 0);
  assert.equal(years[2].allPlanned, false, "an empty year is not a planned year");
});

test("a year with nothing running is flagged as a target date", () => {
  const years = byYear([
    fac({ id: 1, openDate: "2027", powerMW: 500, status: "construction" }),
    fac({ id: 2, openDate: "2027", powerMW: 500, status: "announced" }),
  ]);
  assert.equal(years[0].allPlanned, true);
});

test("a year with anything running is not a target date", () => {
  const years = byYear([
    fac({ id: 1, openDate: "2024", powerMW: 500, status: "operational" }),
    fac({ id: 2, openDate: "2024", powerMW: 500, status: "construction" }),
  ]);
  assert.equal(years[0].allPlanned, false);
});

test("facilities without a usable year or power stay out of the timeline", () => {
  const years = byYear([
    fac({ id: 1, openDate: "2024", powerMW: 100 }),
    fac({ id: 2, openDate: "unknown", powerMW: 900 }),
    fac({ id: 3, openDate: "2024", powerMW: 0 }),
  ]);
  assert.deepEqual(years, [
    { year: 2024, arrivingMW: 100, cumulativeMW: 100, count: 1, allPlanned: false },
  ]);
});

test("no usable dates yields no timeline", () => {
  assert.deepEqual(byYear([]), []);
  assert.deepEqual(byYear([fac({ id: 1, openDate: null })]), []);
});
