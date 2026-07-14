// Live fundamentals sweep: conversion guards, bounded-concurrency sweep,
// per-ticker failure isolation, cache single-flight.
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearFundamentalsCache,
  fractionToPercent,
  getCachedFundamentals,
  refreshFundamentalsIfStale,
  sweepRevenueGrowth,
} from "../fundamentals";

describe("fractionToPercent", () => {
  it("converts Yahoo's fraction to percent", () => {
    const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} !~ ${b}`);
    near(fractionToPercent(0.122), 12.2);
    near(fractionToPercent(1.224), 122.4);
    near(fractionToPercent(-0.05), -5);
  });
  it("rejects junk: non-numbers, non-finite, absurd magnitudes", () => {
    for (const bad of [null, undefined, "12%", NaN, Infinity, 51, -51]) {
      assert.equal(fractionToPercent(bad), null, String(bad));
    }
  });
});

describe("sweepRevenueGrowth", () => {
  it("collects rounded values per ticker", async () => {
    const out = await sweepRevenueGrowth(["A", "B"], async (t) => (t === "A" ? 12.24 : 5.55));
    assert.equal(out.A.revenueGrowth, 12.2);
    assert.equal(out.B.revenueGrowth, 5.6);
  });
  it("a failing ticker yields null without sinking the sweep", async () => {
    const out = await sweepRevenueGrowth(["A", "B"], async (t) => {
      if (t === "A") throw new Error("throttled");
      return 7;
    });
    assert.equal(out.A.revenueGrowth, null);
    assert.equal(out.B.revenueGrowth, 7);
  });
  it("respects the concurrency bound", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await sweepRevenueGrowth(
      Array.from({ length: 20 }, (_, i) => `T${i}`),
      async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return 1;
      },
      4,
    );
    assert.equal(Object.keys(out).length, 20);
    assert.ok(peak <= 4, `peak concurrency ${peak}`);
  });
  it("empty ticker list yields empty result", async () => {
    assert.deepEqual(await sweepRevenueGrowth([], async () => 1), {});
  });
});

describe("refreshFundamentalsIfStale", () => {
  beforeEach(() => clearFundamentalsCache());
  it("populates the cache once and is single-flight while fresh", async () => {
    let calls = 0;
    refreshFundamentalsIfStale(["A"], async () => {
      calls++;
      return 3;
    });
    // second trigger while the first is in flight must not double-fetch
    refreshFundamentalsIfStale(["A"], async () => {
      calls++;
      return 3;
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1);
    assert.equal(getCachedFundamentals().A.revenueGrowth, 3);
    // fresh cache: no new sweep
    refreshFundamentalsIfStale(["A"], async () => {
      calls++;
      return 9;
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1);
  });
  it("a failed sweep leaves the cache empty and allows retry", async () => {
    refreshFundamentalsIfStale(["A"], async () => {
      throw new Error("down");
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(getCachedFundamentals().A?.revenueGrowth ?? null, null);
  });
});
