/**
 * Recharts animates through its own rAF loop, so the reduced-motion block in
 * index.css never reached it. seriesMotion is the bridge; these assert the
 * bridge reads the preference rather than guessing, and that it stays safe
 * where matchMedia does not exist (SSR, the node test runner, old browsers).
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prefersReducedMotion, seriesMotion } from "../chart-theme";

const g = globalThis as { window?: unknown };
const had = "window" in globalThis;
const original = g.window;

function withMatchMedia(matches: boolean | null) {
  g.window =
    matches === null
      ? {}
      : { matchMedia: (q: string) => ({ matches: q.includes("reduce") ? matches : false }) };
}

afterEach(() => {
  if (had) g.window = original;
  else delete g.window;
});

describe("prefersReducedMotion", () => {
  it("is false with no window at all", () => {
    delete g.window;
    assert.equal(prefersReducedMotion(), false);
  });

  it("is false when the browser has no matchMedia", () => {
    withMatchMedia(null);
    assert.equal(prefersReducedMotion(), false);
  });

  it("follows the media query", () => {
    withMatchMedia(true);
    assert.equal(prefersReducedMotion(), true);
    withMatchMedia(false);
    assert.equal(prefersReducedMotion(), false);
  });
});

describe("seriesMotion", () => {
  it("animates by default", () => {
    withMatchMedia(false);
    assert.deepEqual(seriesMotion(), { isAnimationActive: true });
  });

  it("stops animating when the visitor asked for less motion", () => {
    withMatchMedia(true);
    assert.deepEqual(seriesMotion(), { isAnimationActive: false });
  });

  it("is read per call, so a preference change takes effect on the next render", () => {
    withMatchMedia(false);
    assert.equal(seriesMotion().isAnimationActive, true);
    withMatchMedia(true);
    assert.equal(seriesMotion().isAnimationActive, false);
  });
});
