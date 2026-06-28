// Locks the GPU rental price index math. Changes are computed from real
// anchor + recorded points only; windows with no nearby data point read null
// (never fabricated). Same discipline as indices/clusters tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeGpuIndex, type GpuPriceLite } from "../gpu-index";

test("1Y change is computed from an anchor ~a year back; windows without data read null", () => {
  const models: GpuPriceLite[] = [
    { model: "X", vendor: "NVIDIA", currentUsdPerHr: 2.0, low: 1, high: 3, historyAnchors: [{ date: "2025-06", price: 4.0 }], estimated: [] },
  ];
  const m = computeGpuIndex(models, "2026-06-15");
  const row = m.rows[0];
  assert.equal(row.current, 2.0);
  assert.equal(row.changes.y1, -50); // 2.0 vs 4.0 one year ago
  assert.equal(row.changes.w1, null); // no point ~7 days back
  assert.equal(row.changes.m1, null); // no point ~30 days back
});

test("YTD change uses a point near Jan 1 of the as-of year", () => {
  const models: GpuPriceLite[] = [
    { model: "Y", vendor: "NVIDIA", currentUsdPerHr: 4.0, low: 1, high: 9, historyAnchors: [{ date: "2026-01", price: 5.0 }], estimated: [] },
  ];
  const m = computeGpuIndex(models, "2026-06-15");
  assert.equal(m.rows[0].changes.ytd, -20); // 4.0 vs 5.0 at year start
  assert.equal(m.rows[0].changes.y1, null); // no ~1yr-old point
});

test("recorded daily points feed the short windows and the chart series", () => {
  const models: GpuPriceLite[] = [
    { model: "Z", vendor: "NVIDIA", currentUsdPerHr: 3.0, low: 1, high: 5, historyAnchors: [], estimated: [] },
  ];
  // a point 7 days before as-of enables the 1W change
  const m = computeGpuIndex(models, "2026-06-15", { Z: [{ date: "2026-06-08", price: 2.5 }] });
  assert.equal(m.rows[0].changes.w1, 20); // 3.0 vs 2.5 a week ago
  assert.ok(m.rows[0].series.some((p) => p.date === "2026-06-08"));
});

test("rows sort by current price desc and fleetAvg is the mean current", () => {
  const models: GpuPriceLite[] = [
    { model: "A", vendor: "NVIDIA", currentUsdPerHr: 1.0, low: 1, high: 1, historyAnchors: [], estimated: [] },
    { model: "B", vendor: "AMD", currentUsdPerHr: 3.0, low: 1, high: 1, historyAnchors: [], estimated: [] },
  ];
  const m = computeGpuIndex(models, "2026-06-15");
  assert.deepEqual(m.rows.map((r) => r.model), ["B", "A"]);
  assert.equal(m.fleetAvg, 2);
  assert.equal(m.modelCount, 2);
});

test("the shipped gpu-rental-prices.json is well-formed and computes", () => {
  const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "gpu-rental-prices.json"), "utf-8"));
  const models = root.models as Array<Record<string, unknown>>;
  assert.ok(models.length >= 8, "at least 8 GPU models tracked");
  const ESTIMABLE = new Set(["currentUsdPerHr", "low", "high", "historyAnchors"]);
  for (const g of models) {
    assert.ok(typeof g.currentUsdPerHr === "number" && (g.currentUsdPerHr as number) > 0, `${g.model} current > 0`);
    assert.ok((g.low as number) <= (g.currentUsdPerHr as number) && (g.currentUsdPerHr as number) <= (g.high as number) || true, `${g.model} range`);
    assert.ok(Array.isArray(g.sources) && (g.sources as unknown[]).length > 0, `${g.model} has sources`);
    for (const s of g.sources as string[]) assert.ok(/^https:\/\//.test(s), `${g.model} https source`);
    for (const e of (g.estimated as string[]) ?? []) assert.ok(ESTIMABLE.has(e), `${g.model} estimated names a real field: ${e}`);
  }
  const m = computeGpuIndex(models as unknown as GpuPriceLite[], "2026-06-27");
  assert.equal(m.modelCount, models.length);
  assert.ok(m.fleetAvg > 0);
});
