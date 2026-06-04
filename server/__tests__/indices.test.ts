// Locks the index formulas so the defining product math cannot silently
// drift. If a weight, baseline, clamp, or base price changes, these tests
// must change with it, in the same commit, on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_INDEX,
  GRID_STRESS,
  NPI_BASE,
  NPI_WEIGHTS,
  NPI_MOMENTUM_WEIGHTS,
  computeAiPowerIndex,
  computeGridStress,
  computeNpi,
  computeNpiMomentum,
} from "../indices";

test("weights sum to 1 for every basket", () => {
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum({ ...AI_INDEX.WEIGHTS }) - 1) < 1e-9);
  assert.ok(Math.abs(sum({ ...GRID_STRESS.WEIGHTS }) - 1) < 1e-9);
  assert.ok(Math.abs(sum({ ...NPI_WEIGHTS }) - 1) < 1e-9);
  assert.ok(Math.abs(sum({ ...NPI_MOMENTUM_WEIGHTS }) - 1) < 1e-9);
});

test("AI Demand sits exactly at its 72 baseline on a flat day", () => {
  assert.equal(
    computeAiPowerIndex({ nvdaChange: 0, tsmChange: 0, eqixChange: 0, muChange: 0 }),
    AI_INDEX.BASELINE,
  );
});

test("AI Demand reproduces a known vector and respects its clamps", () => {
  // All constituents +1%: 72 + 1.2 * 1.0 = 73.2
  const oneUp = computeAiPowerIndex({ nvdaChange: 1, tsmChange: 1, eqixChange: 1, muChange: 1 });
  assert.ok(Math.abs(oneUp - 73.2) < 1e-9);
  // Implausibly large moves pin to the clamp bounds, never beyond.
  assert.equal(
    computeAiPowerIndex({ nvdaChange: 50, tsmChange: 50, eqixChange: 50, muChange: 50 }),
    AI_INDEX.MAX,
  );
  assert.equal(
    computeAiPowerIndex({ nvdaChange: -50, tsmChange: -50, eqixChange: -50, muChange: -50 }),
    AI_INDEX.MIN,
  );
});

test("Grid Stress sits at its 68 baseline on a flat day and clamps", () => {
  assert.equal(
    computeGridStress({ vstChange: 0, cegChange: 0, eqixChange: 0 }),
    GRID_STRESS.BASELINE,
  );
  assert.equal(
    computeGridStress({ vstChange: 60, cegChange: 60, eqixChange: 60 }),
    GRID_STRESS.MAX,
  );
  assert.equal(
    computeGridStress({ vstChange: -60, cegChange: -60, eqixChange: -60 }),
    GRID_STRESS.MIN,
  );
});

test("NPI equals exactly 100 at base prices with a neutral policy score", () => {
  // Policy score 5 makes policyPerf = 1.0 and the multiplier = 1.0, so a
  // basket sitting at its Jan-1-2024 bases must read par.
  const r = computeNpi({
    cegPrice: NPI_BASE.CEG,
    vstPrice: NPI_BASE.VST,
    ccjPrice: NPI_BASE.CCJ,
    nlrPrice: NPI_BASE.NLR,
    uraniumSpot: NPI_BASE.URANIUM_SPOT,
    smrPolicyScore: 5,
  });
  assert.equal(r.npiValue, 100);
  assert.equal(r.policyPerf, 1);
  assert.equal(r.npiPolicyMultiplier, 1);
});

test("NPI policy multiplier spans exactly 0.9 to 1.1", () => {
  const base = {
    cegPrice: NPI_BASE.CEG,
    vstPrice: NPI_BASE.VST,
    ccjPrice: NPI_BASE.CCJ,
    nlrPrice: NPI_BASE.NLR,
    uraniumSpot: NPI_BASE.URANIUM_SPOT,
  };
  assert.equal(computeNpi({ ...base, smrPolicyScore: 0 }).npiPolicyMultiplier, 0.9);
  assert.ok(Math.abs(computeNpi({ ...base, smrPolicyScore: 10 }).npiPolicyMultiplier - 1.1) < 1e-9);
});

test("NPI doubles when every constituent doubles at neutral policy", () => {
  const r = computeNpi({
    cegPrice: NPI_BASE.CEG * 2,
    vstPrice: NPI_BASE.VST * 2,
    ccjPrice: NPI_BASE.CCJ * 2,
    nlrPrice: NPI_BASE.NLR * 2,
    uraniumSpot: NPI_BASE.URANIUM_SPOT * 2,
    smrPolicyScore: 5, // policyPerf stays 1.0; that leg does not double
  });
  // 0.9 of the weight doubles, 0.1 (policy) stays at par: 100 * 1.9 = 190.
  assert.equal(r.npiValue, 190);
});

test("NPI momentum reproduces a known weighted vector", () => {
  const m = computeNpiMomentum({ cegChange: 1, vstChange: 2, ccjChange: 3, neeChange: 4 });
  // 1*0.35 + 2*0.30 + 3*0.20 + 4*0.15 = 2.15
  assert.ok(Math.abs(m - 2.15) < 1e-9);
});
