// The agentic-refresh gate: every rule that keeps a hallucinated or sloppy
// refresh out of the dataset gets a red/green pair, and the shipped file
// must validate against itself (the no-op refresh is always legal).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateGpuPrices, type GpuPriceFile } from "../gpu-price-validation";

const base = (): GpuPriceFile => ({
  lastRefreshed: "2026-09-01",
  unit: "USD per GPU-hour, on-demand",
  methodology: "blended on-demand",
  models: [
    {
      model: "H100",
      currentUsdPerHr: 2.0,
      low: 1.5,
      high: 3.0,
      asOf: "2026-08",
      historyAnchors: [
        { date: "2025-07", price: 2.5 },
        { date: "2026-08", price: 2.0 },
      ],
      estimated: ["currentUsdPerHr"],
      confidence: "high",
      sources: ["https://a.example/pricing", "https://b.example/gpus"],
    },
  ],
});

function mutated(fn: (f: GpuPriceFile) => void): GpuPriceFile {
  const f = base();
  fn(f);
  return f;
}

test("a no-op refresh passes", () => {
  const r = validateGpuPrices(base(), base());
  assert.deepEqual(r, { ok: true, errors: [] });
});

test("a sane update passes: new anchor appended, price moved within band", () => {
  const next = mutated((f) => {
    const m = f.models[0];
    m.currentUsdPerHr = 1.8;
    m.asOf = "2026-09";
    m.historyAnchors.push({ date: "2026-09", price: 1.8 });
    f.lastRefreshed = "2026-09-08";
  });
  assert.equal(validateGpuPrices(next, base()).ok, true);
});

test("model set is frozen in both directions", () => {
  const dropped = mutated((f) => void f.models.pop());
  assert.match(validateGpuPrices(dropped, base()).errors[0], /model removed/);
  const added = mutated((f) => f.models.push({ ...base().models[0], model: "H300" }));
  assert.match(validateGpuPrices(added, base()).errors[0], /model added/);
});

test("price outside its own band, non-https source, thin sourcing all fail", () => {
  const outside = mutated((f) => (f.models[0].currentUsdPerHr = 5));
  assert.match(validateGpuPrices(outside, base()).errors.join(";"), /outside its own band/);
  const http = mutated((f) => (f.models[0].sources = ["http://a.example", "https://b.example"]));
  assert.match(validateGpuPrices(http, base()).errors.join(";"), /non-https/);
  const thin = mutated((f) => (f.models[0].sources = ["https://a.example"]));
  assert.match(validateGpuPrices(thin, base()).errors.join(";"), /at least 2 sources/);
});

test("a >60% move is blocked; 50% passes", () => {
  const wild = mutated((f) => {
    f.models[0].currentUsdPerHr = 0.5; // -75%
    f.models[0].low = 0.4;
  });
  assert.match(validateGpuPrices(wild, base()).errors.join(";"), /blocked for human review/);
  const ok = mutated((f) => {
    f.models[0].currentUsdPerHr = 1.5; // -25%, still >= low
  });
  assert.equal(validateGpuPrices(ok, base()).ok, true);
});

test("history is immutable: rewrites and shrinks fail, asOf cannot rewind", () => {
  const rewritten = mutated((f) => (f.models[0].historyAnchors[0].price = 9.9));
  assert.match(validateGpuPrices(rewritten, base()).errors.join(";"), /rewritten/);
  const shrunk = mutated((f) => void f.models[0].historyAnchors.pop());
  assert.match(validateGpuPrices(shrunk, base()).errors.join(";"), /shrank/);
  const rewound = mutated((f) => (f.models[0].asOf = "2026-01"));
  assert.match(validateGpuPrices(rewound, base()).errors.join(";"), /asOf went backwards/);
});

test("estimated flags cannot silently vanish", () => {
  const flagless = mutated((f) => (f.models[0].estimated = []));
  assert.match(validateGpuPrices(flagless, base()).errors.join(";"), /silently dropped/);
});

test("the shipped dataset validates against itself", () => {
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "server", "data", "gpu-rental-prices.json"), "utf-8"),
  ) as GpuPriceFile;
  const r = validateGpuPrices(raw, raw);
  assert.deepEqual(r.errors, []);
});
