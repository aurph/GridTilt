// The real uranium correlation module - the replacement for the app's last
// fabricated dataset. Pearson math, weekly alignment, thresholds, cache and
// failure behavior all covered.
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  alignWeekly,
  buildCorrelationPayload,
  clearCorrelationCache,
  getUraniumCorrelation,
  pearson,
  type WeeklyPoint,
} from "../uranium-correlation";

const WEEK = 7 * 86_400_000;
const series = (closes: Array<number | null>, startWeek = 3000): WeeklyPoint[] =>
  closes.map((c, i) => ({ t: (startWeek + i) * WEEK + 3 * 86_400_000, close: c as number }));

describe("pearson", () => {
  it("perfect positive and negative correlation", () => {
    assert.equal(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1);
    assert.equal(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1);
  });
  it("known value on a hand-computed set", () => {
    const r = pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 5]);
    assert.ok(r !== null && Math.abs(r - 0.8) < 1e-9);
  });
  it("null on n<3 or zero variance", () => {
    assert.equal(pearson([1, 2], [1, 2]), null);
    assert.equal(pearson([5, 5, 5], [1, 2, 3]), null);
    assert.equal(pearson([1, 2, 3], [7, 7, 7]), null);
  });
});

describe("alignWeekly", () => {
  it("pairs closes that fall in the same calendar week", () => {
    const a = series([10, 11, 12]);
    const b = series([100, 110, 120]);
    const out = alignWeekly(a, b);
    assert.deepEqual(out.map((p) => [p.a, p.b]), [[10, 100], [11, 110], [12, 120]]);
  });
  it("weeks missing from either side are dropped, never interpolated", () => {
    const a = series([10, 11, 12]);
    const b = [series([100])[0], series([120], 3002)[0]]; // week 3001 missing
    const out = alignWeekly(a, b);
    assert.deepEqual(out.map((p) => [p.a, p.b]), [[10, 100], [12, 120]]);
  });
  it("non-finite closes are excluded", () => {
    const a = series([10, NaN, 12]);
    const b = series([100, 110, null]);
    const out = alignWeekly(a, b);
    assert.deepEqual(out.map((p) => [p.a, p.b]), [[10, 100]]);
  });
  it("empty inputs yield empty output", () => {
    assert.deepEqual(alignWeekly([], series([1, 2, 3])), []);
    assert.deepEqual(alignWeekly(series([1]), []), []);
  });
});

describe("buildCorrelationPayload", () => {
  const proxy = series(Array.from({ length: 52 }, (_, i) => 15 + i * 0.1));
  const ccj = series(Array.from({ length: 52 }, (_, i) => 70 + i * 0.5));
  const ceg = series(Array.from({ length: 52 }, (_, i) => 300 - i));
  it("pairs, rounds, and computes real r for both relationships", () => {
    const p = buildCorrelationPayload(proxy, ccj, ceg, "SRUUF", "2026-07-04");
    assert.ok(p);
    assert.equal(p.weeks, 52);
    assert.equal(p.ccjPairs.length, 52);
    assert.ok(p.ccjR !== null && p.ccjR > 0.999); // both strictly increasing
    assert.ok(p.cegR !== null && p.cegR < -0.999); // proxy up, ceg down
    assert.equal(p.proxyTicker, "SRUUF");
  });
  it("null when overlap is too thin to present as a year (<20 weeks)", () => {
    const p = buildCorrelationPayload(series([1, 2, 3]), series([4, 5, 6]), [], "SRUUF", "x");
    assert.equal(p, null);
  });
  it("CEG side degrades to null independently when its overlap is thin", () => {
    const p = buildCorrelationPayload(proxy, ccj, series([1, 2, 3]), "SRUUF", "x");
    assert.ok(p);
    assert.equal(p.cegR, null);
    assert.equal(p.cegPairs.length, 3);
  });
});

describe("getUraniumCorrelation (cache + failure)", () => {
  beforeEach(() => clearCorrelationCache());
  const good = async (t: string) =>
    series(Array.from({ length: 52 }, (_, i) => (t === "SRUUF" ? 15 + i * 0.1 : t === "CCJ" ? 70 + i : 300 + i)));

  it("computes once and serves from cache after", async () => {
    let calls = 0;
    const counting = async (t: string) => {
      calls++;
      return good(t);
    };
    const p1 = await getUraniumCorrelation(counting);
    const p2 = await getUraniumCorrelation(counting);
    assert.ok(p1 && p2);
    assert.equal(calls, 3); // one sweep of three tickers, second call cached
  });
  it("fetch failure yields null - nothing invented", async () => {
    const dead = async () => {
      throw new Error("yahoo down");
    };
    const p = await getUraniumCorrelation(dead);
    assert.equal(p, null);
  });
});
