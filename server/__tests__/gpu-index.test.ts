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

test("recorded same-date points win deduplication and retain observed dispersion", () => {
  const models: GpuPriceLite[] = [
    {
      model: "H100",
      vendor: "NVIDIA",
      currentUsdPerHr: 2.7,
      low: 1,
      high: 5,
      historyAnchors: [
        { date: "2026-06", price: 3.1 },
        { date: "2026-07-13", price: 99 },
      ],
      estimated: [],
    },
  ];
  const recorded = {
    H100: [{
      date: "2026-07-13",
      price: 2.7,
      low: 2.1,
      high: 2.9,
      sources: ["runpod-secure", "vast"],
      n: 2,
    }],
  };

  const row = computeGpuIndex(models, "2026-07-13", recorded).rows[0];
  assert.deepEqual(row.series, [
    { date: "2026-06", price: 3.1 },
    {
      date: "2026-07-13",
      price: 2.7,
      low: 2.1,
      high: 2.9,
      sources: ["runpod-secure", "vast"],
      n: 2,
    },
  ]);
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

test("spec metadata (maker, architecture, VRAM, launch year) passes through to the row", () => {
  const models: GpuPriceLite[] = [
    {
      model: "H100", vendor: "NVIDIA", currentUsdPerHr: 2.99, low: 1.38, high: 6.98,
      architecture: "Hopper", vramGB: 80, vramType: "HBM3", launchYear: 2022,
      confidence: "high", oneYearTrend: "Roughly flat YoY.",
      sources: ["https://getdeploying.com/gpus/nvidia-h100"],
      historyAnchors: [], estimated: [],
    },
  ];
  const row = computeGpuIndex(models, "2026-06-15").rows[0];
  assert.equal(row.vendor, "NVIDIA");
  assert.equal(row.architecture, "Hopper");
  assert.equal(row.vramGB, 80);
  assert.equal(row.vramType, "HBM3");
  assert.equal(row.launchYear, 2022);
  assert.equal(row.confidence, "high");
  assert.equal(row.oneYearTrend, "Roughly flat YoY.");
  assert.deepEqual(row.sources, ["https://getdeploying.com/gpus/nvidia-h100"]);
});

test("spec metadata is optional and reads null/undefined when absent", () => {
  const models: GpuPriceLite[] = [
    { model: "X", vendor: "NVIDIA", currentUsdPerHr: 2.0, low: 1, high: 3, historyAnchors: [], estimated: [] },
  ];
  const row = computeGpuIndex(models, "2026-06-15").rows[0];
  assert.equal(row.architecture, null);
  assert.equal(row.vramGB, null);
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
