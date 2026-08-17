// The indicator exists for three measured-slow endpoints and must stay out of
// the way everywhere else, so the thresholds are pinned rather than tuned by eye.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtElapsed,
  isRevealed,
  isStalled,
  loadingLine,
  REVEAL_AFTER_MS,
  STALL_AFTER_MS,
} from "../loading-progress";

test("a cached response finishes before anything renders", () => {
  // Warm timings: /api/stack 5ms, /api/news 3ms, /api/kpis 181ms.
  for (const warm of [3, 5, 181, 499]) {
    assert.equal(isRevealed(warm), false, `${warm}ms should stay invisible`);
    assert.equal(loadingLine(warm, "Loading"), null);
  }
});

test("the indicator appears once the wait is real", () => {
  assert.equal(isRevealed(REVEAL_AFTER_MS), true);
  const line = loadingLine(1200, "Loading market data");
  assert.equal(line?.text, "Loading market data");
  assert.equal(line?.elapsed, "1s");
  assert.equal(line?.stalled, false);
});

test("past a normal cold fetch it names the upstream", () => {
  // Slowest measured cold fetch was 5.0s, so 6s means something is wrong.
  assert.ok(STALL_AFTER_MS > 5000, "must sit above the slowest measured cold fetch");
  const line = loadingLine(7000, "Loading market data", "Yahoo Finance");
  assert.equal(line?.text, "Still waiting on Yahoo Finance");
  assert.equal(line?.stalled, true);
});

test("without a named upstream it keeps the label rather than inventing one", () => {
  const line = loadingLine(9000, "Loading news");
  assert.equal(line?.text, "Loading news");
  assert.equal(line?.stalled, true);
});

test("elapsed reads in whole seconds, then minutes", () => {
  assert.equal(fmtElapsed(0), "0s");
  assert.equal(fmtElapsed(999), "0s");
  assert.equal(fmtElapsed(1000), "1s");
  assert.equal(fmtElapsed(45_000), "45s");
  assert.equal(fmtElapsed(60_000), "1m 00s");
  assert.equal(fmtElapsed(95_000), "1m 35s");
});

test("nonsense input reads as zero rather than NaN", () => {
  assert.equal(fmtElapsed(NaN), "0s");
  assert.equal(fmtElapsed(-5), "0s");
  assert.equal(isRevealed(NaN), false);
  assert.equal(isStalled(NaN), false);
});

test("the reveal delay sits above the slowest warm response", () => {
  // /api/kpis warm was 181ms. The delay must clear it or every cached load
  // flashes the indicator.
  assert.ok(REVEAL_AFTER_MS > 181, `${REVEAL_AFTER_MS}ms must clear a warm kpis read`);
});
