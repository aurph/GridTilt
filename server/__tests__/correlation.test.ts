// Locks the uranium correlation math. The scatter is built only from real
// observed weekly closes joined on bar date; r reads null (never a made-up
// number) when there is no usable overlap. This test exists because the card
// previously shipped Box-Muller synthetic data tuned to a target r.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pearson, alignByDate, buildScatter, type WeeklyClose } from "../correlation";

test("pearson: perfectly linear series reads 1 / -1", () => {
  const up = pearson([1, 2, 3, 4], [2, 4, 6, 8]);
  const down = pearson([1, 2, 3, 4], [8, 6, 4, 2]);
  assert.ok(up !== null && Math.abs(up - 1) < 1e-12);
  assert.ok(down !== null && Math.abs(down + 1) < 1e-12);
});

test("pearson: refuses to fabricate a coefficient", () => {
  assert.equal(pearson([1, 2], [2, 4]), null); // too short
  assert.equal(pearson([5, 5, 5, 5], [1, 2, 3, 4]), null); // zero variance
  assert.equal(pearson([], []), null);
});

test("pearson: known mixed series matches hand-computed value", () => {
  // xs=[1,2,3,4,5], ys=[2,1,4,3,5]: num=8, denX=denY=sqrt(10) -> r = 0.8
  const r = pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]);
  assert.ok(r !== null && Math.abs(r - 0.8) < 1e-9);
});

test("alignByDate: joins on bar date, drops one-sided weeks instead of shifting", () => {
  const a: WeeklyClose[] = [
    { date: "2026-06-01", close: 10 },
    { date: "2026-06-08", close: 11 },
    { date: "2026-06-15", close: 12 },
  ];
  // b is missing 06-08 (OTC gap). Index pairing would wrongly pair 06-08 with 06-15.
  const b: WeeklyClose[] = [
    { date: "2026-06-01", close: 100 },
    { date: "2026-06-15", close: 120 },
  ];
  const aligned = alignByDate(a, b);
  assert.deepEqual(aligned, [
    { date: "2026-06-01", a: 10, b: 100 },
    { date: "2026-06-15", a: 12, b: 120 },
  ]);
});

test("alignByDate: non-finite closes are excluded", () => {
  const a: WeeklyClose[] = [
    { date: "2026-06-01", close: NaN },
    { date: "2026-06-08", close: 11 },
  ];
  const b: WeeklyClose[] = [
    { date: "2026-06-01", close: 100 },
    { date: "2026-06-08", close: 110 },
  ];
  assert.deepEqual(alignByDate(a, b), [{ date: "2026-06-08", a: 11, b: 110 }]);
});

test("buildScatter: points come from the observed joins and r from the same series", () => {
  const proxy: WeeklyClose[] = [
    { date: "2026-05-25", close: 20.111 },
    { date: "2026-06-01", close: 21 },
    { date: "2026-06-08", close: 22 },
    { date: "2026-06-15", close: 23 },
  ];
  const stock: WeeklyClose[] = [
    { date: "2026-05-25", close: 100.555 },
    { date: "2026-06-01", close: 105 },
    { date: "2026-06-08", close: 110 },
    { date: "2026-06-15", close: 115 },
  ];
  const { points, r, weeks } = buildScatter(proxy, stock);
  assert.equal(weeks, 4);
  assert.equal(points.length, 4);
  assert.deepEqual(points[0], { date: "2026-05-25", uranium: 20.11, ccj: 100.56 });
  assert.ok(r !== null && r > 0.999); // near-linear input
});

test("buildScatter: empty overlap yields empty points and null r, not defaults", () => {
  const { points, r, weeks } = buildScatter(
    [{ date: "2026-06-01", close: 20 }],
    [{ date: "2026-06-08", close: 100 }]
  );
  assert.deepEqual(points, []);
  assert.equal(r, null);
  assert.equal(weeks, 0);
});
