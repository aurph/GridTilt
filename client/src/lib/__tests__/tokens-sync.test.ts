/**
 * Lake 8: tokens.ts promises to mirror the :root vars in index.css.
 * This test enforces the sync so the two sources can never drift.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BORDER, BRAND, CHART_CHROME, DATA_QUALITY, INK, SEMANTIC, SERIES, SURFACE } from "../tokens";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../index.css"), "utf8");

function cssVar(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  assert.ok(m, `--${name} missing from index.css`);
  return m[1].trim();
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

describe("tokens.ts mirrors index.css", () => {
  it("surfaces", () => {
    assert.equal(norm(cssVar("surface-sunken")), norm(SURFACE.sunken));
    assert.equal(norm(cssVar("surface-base")), norm(SURFACE.base));
    assert.equal(norm(cssVar("surface-raised")), norm(SURFACE.raised));
    assert.equal(norm(cssVar("surface-overlay")), norm(SURFACE.overlay));
  });
  it("borders", () => {
    assert.equal(norm(cssVar("border-subtle")), norm(BORDER.subtle));
    assert.equal(norm(cssVar("border-strong")), norm(BORDER.strong));
  });
  it("brand", () => {
    assert.equal(norm(cssVar("brand")), norm(BRAND.primary));
    assert.equal(norm(cssVar("brand-2")), norm(BRAND.secondary));
    assert.equal(norm(cssVar("brand-glow")), norm(BRAND.glow));
    assert.equal(norm(cssVar("brand-wash")), norm(BRAND.wash));
  });
  it("ink scale", () => {
    assert.equal(norm(cssVar("ink")), norm(INK.primary));
    assert.equal(norm(cssVar("ink-secondary")), norm(INK.secondary));
    assert.equal(norm(cssVar("ink-muted")), norm(INK.muted));
    assert.equal(norm(cssVar("ink-faint")), norm(INK.faint));
  });
  it("semantic", () => {
    assert.equal(norm(cssVar("positive")), norm(SEMANTIC.positive));
    assert.equal(norm(cssVar("positive-deep")), norm(SEMANTIC.positiveDeep));
    assert.equal(norm(cssVar("negative")), norm(SEMANTIC.negative));
    assert.equal(norm(cssVar("negative-deep")), norm(SEMANTIC.negativeDeep));
    assert.equal(norm(cssVar("warning")), norm(SEMANTIC.warning));
    assert.equal(norm(cssVar("critical")), norm(SEMANTIC.critical));
    assert.equal(norm(cssVar("info")), norm(SEMANTIC.info));
  });
  it("data quality", () => {
    assert.equal(norm(cssVar("estimate")), norm(DATA_QUALITY.estimateFlag));
    assert.equal(Number(cssVar("dq-estimated-opacity")), DATA_QUALITY.estimatedOpacity);
    assert.equal(Number(cssVar("dq-synthetic-opacity")), DATA_QUALITY.syntheticOpacity);
  });
  it("all ten categorical series slots, in order", () => {
    SERIES.forEach((hex, i) => {
      assert.equal(norm(cssVar(`series-${i + 1}`)), norm(hex), `series-${i + 1}`);
    });
  });
  it("chart chrome", () => {
    assert.equal(norm(cssVar("chart-axis")), norm(CHART_CHROME.axis));
    assert.equal(norm(cssVar("chart-tick")), norm(CHART_CHROME.tick));
    assert.equal(norm(cssVar("chart-grid")), norm(CHART_CHROME.grid));
    assert.equal(norm(cssVar("chart-crosshair")), norm(CHART_CHROME.crosshair));
    assert.equal(norm(cssVar("chart-ref-line")), norm(CHART_CHROME.refLine));
  });
});
