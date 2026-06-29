// Locks the GPU economics math: pure derivations from rental price + sourced
// peak compute. $/period are simple multiples; cost-efficiency is price over
// petaflops; the training-cost run is the standard FLOPs / (peak * MFU) formula.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeGpuEconomics, trainingRun } from "../gpu-economics";

test("per-period costs are simple multiples of the hourly rate", () => {
  const [r] = computeGpuEconomics([{ model: "H100", vendor: "NVIDIA", currentUsdPerHr: 2.79, tflopsBf16: 989.5 }]);
  assert.equal(r.perDay, 66.96); // 2.79 * 24
  assert.equal(r.perMonth, 2037); // 2.79 * 730
  assert.equal(r.perYear, 24440); // 2.79 * 8760
});

test("usdPerPflopHr = price / petaflops (lower = cheaper compute)", () => {
  const [r] = computeGpuEconomics([{ model: "H100", vendor: "NVIDIA", currentUsdPerHr: 2.79, tflopsBf16: 989.5 }]);
  assert.ok(Math.abs(r.usdPerPflopHr - 2.79 / (989.5 / 1000)) < 0.01); // ~2.82
});

test("rows sort by cheapest compute, not lowest sticker price", () => {
  const rows = computeGpuEconomics([
    { model: "A100", vendor: "NVIDIA", currentUsdPerHr: 1.65, tflopsBf16: 312 }, // 5.29 $/PFLOP-hr
    { model: "H100", vendor: "NVIDIA", currentUsdPerHr: 2.79, tflopsBf16: 989.5 }, // 2.82 $/PFLOP-hr
  ]);
  // H100 costs more per hour but far less per unit of compute, so it ranks first
  assert.deepEqual(rows.map((r) => r.model), ["H100", "A100"]);
});

test("missing FLOPs spec yields a null efficiency, sorted last", () => {
  const rows = computeGpuEconomics([
    { model: "X", vendor: "NVIDIA", currentUsdPerHr: 1, tflopsBf16: 0 },
    { model: "H100", vendor: "NVIDIA", currentUsdPerHr: 2.79, tflopsBf16: 989.5 },
  ]);
  assert.equal(rows[0].model, "H100");
  assert.equal(rows[1].usdPerPflopHr, null);
});

test("trainingRun applies FLOPs / (peak * MFU) and a cluster wall-clock", () => {
  const t = trainingRun({ totalFlops: 1e25, tflopsBf16: 989.5, mfu: 0.4, pricePerHr: 2.79, gpuCount: 1000 });
  assert.ok(t.gpuHours > 6_900_000 && t.gpuHours < 7_100_000); // ~7.02M GPU-hours
  assert.ok(t.usdCost > 19_000_000 && t.usdCost < 20_500_000); // ~$19.6M
  assert.ok(t.wallClockDays > 270 && t.wallClockDays < 310); // ~292 days on 1000 GPUs
});
