// Pins that the homes comparison stays coarse and that missing data yields no
// comparison rather than zero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { homesEquivalent, roundToScale, MWH_PER_US_HOME_YEAR } from "../scale-compare";

test("the divisor is the EIA figure, unrounded", () => {
  // 10,791 kWh per US residential customer per year.
  assert.equal(MWH_PER_US_HOME_YEAR, 10.791);
});

test("large counts lose their false precision", () => {
  // AWS Ashburn: 7,884,000 MWh -> 730,609 exactly, which we must not print.
  assert.equal(homesEquivalent(7_884_000), 730_000);
});

test("rounding coarsens with magnitude", () => {
  assert.equal(roundToScale(730_609), 730_000); // nearest 10k
  assert.equal(roundToScale(41_236), 41_000); // nearest 1k
  assert.equal(roundToScale(4_162), 4_200); // nearest 100
  assert.equal(roundToScale(417), 420); // nearest 10
});

test("no comparison rather than a fabricated zero", () => {
  for (const bad of [null, undefined, 0, -5, NaN, Infinity]) {
    assert.equal(homesEquivalent(bad as number), null, `should refuse ${String(bad)}`);
  }
});

test("a real facility lands in a sane range", () => {
  // 900 MW running flat out for a year is ~7.9m MWh; the comparison should be
  // hundreds of thousands of homes, not thousands or tens of millions.
  const homes = homesEquivalent(7_884_000);
  assert.ok(homes !== null && homes > 100_000 && homes < 2_000_000, `got ${homes}`);
});

test("rounding never returns a negative or NaN", () => {
  assert.equal(roundToScale(NaN), 0);
  assert.equal(roundToScale(-1), 0);
});
