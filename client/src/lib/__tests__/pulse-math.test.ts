// The client mirrors server/pulse-math.ts because the Vite root is client/ and
// importing across the boundary would mean a build-config change. A copy is
// only safe if something fails when the two drift, so this file imports BOTH
// and asserts they agree. Node runs these tests, not Vite, so the cross-boundary
// import here is free.
import { test } from "node:test";
import assert from "node:assert/strict";
import { averageLiveChanges, averageLiveChangesOrNull } from "../pulse-math";
import { averageLiveChanges as serverAverageLiveChanges } from "../../../../server/pulse-math";

const CASES: Array<Array<number | null | undefined>> = [
  [4, null, 2, undefined],
  [null, undefined, null],
  [],
  [NaN, Infinity, 6],
  [1, 2, 2],
  [0, 0, 0],
  [-3.5, 3.5],
  [-1, null, -2, NaN],
  [100],
  [0.005, 0.005],
];

test("client and server pulse math agree on every case", () => {
  for (const input of CASES) {
    assert.equal(
      averageLiveChanges(input),
      serverAverageLiveChanges(input),
      `client and server disagree on ${JSON.stringify(input)}; they must stay identical`,
    );
  }
});

test("stale rows are excluded, never coerced to 0", () => {
  // The whole doctrine in one assertion: a throttled ticker must not drag the
  // average toward zero. Coercing null to 0 would give 2, not 3.
  assert.equal(averageLiveChanges([4, null, 2, undefined]), 3);
});

test("no live observations averages to 0", () => {
  assert.equal(averageLiveChanges([null, undefined, null]), 0);
  assert.equal(averageLiveChanges([]), 0);
});

test("NaN and Infinity are not live observations", () => {
  assert.equal(averageLiveChanges([NaN, Infinity, 6]), 6);
});

test("rounds to two decimals", () => {
  assert.equal(averageLiveChanges([1, 2, 2]), 1.67);
});

test("averageLiveChangesOrNull distinguishes no-data from genuinely flat", () => {
  // A page rendering "--" needs these to differ; averageLiveChanges collapses
  // both to 0 on purpose for the gauge surfaces.
  assert.equal(averageLiveChangesOrNull([null, undefined]), null);
  assert.equal(averageLiveChangesOrNull([]), null);
  assert.equal(averageLiveChangesOrNull([0, 0]), 0);
  assert.equal(averageLiveChanges([null, undefined]), 0);
});

test("averageLiveChangesOrNull matches averageLiveChanges whenever data exists", () => {
  for (const input of CASES) {
    const orNull = averageLiveChangesOrNull(input);
    if (orNull !== null) assert.equal(orNull, averageLiveChanges(input));
  }
});
