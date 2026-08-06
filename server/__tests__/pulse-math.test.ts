import { test } from "node:test";
import assert from "node:assert/strict";
import { averageLiveChanges } from "../pulse-math";

test("partial throttle: stale (null) tickers are excluded, not diluted to 0", () => {
  // Two live at +4 and +2, two stale. A "?? 0" average would read 1.5.
  assert.equal(averageLiveChanges([4, null, 2, undefined]), 3);
});

test("full throttle: no live observations reads 0", () => {
  assert.equal(averageLiveChanges([null, undefined, null]), 0);
  assert.equal(averageLiveChanges([]), 0);
});

test("non-finite values are treated as stale", () => {
  assert.equal(averageLiveChanges([NaN, Infinity, 6]), 6);
});

test("rounds to two decimals", () => {
  assert.equal(averageLiveChanges([1, 2, 2]), 1.67);
});
