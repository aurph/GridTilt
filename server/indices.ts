// ─── Pure index math ─────────────────────────────────────────────────────
//
// The deterministic formulas behind the three headline indices, extracted
// from routes.ts so that:
//   1. the math that defines the product is unit-tested (see
//      server/__tests__/indices.test.ts),
//   2. the historical backtest (scripts/backtest-indices.ts) reconstructs
//      the series with the EXACT shipped formulas, and
//   3. the published numbers, the tests, and the validation study can never
//      silently diverge.
//
// These are market-based gauges computed from constituent equity moves
// (NPI also uses uranium spot and a policy score derived from tracked
// nuclear PPAs). They are not physical grid measurements, and the README
// "Index methodology" section says so publicly.

export const AI_INDEX = {
  BASELINE: 72,
  GAIN: 1.2,
  MIN: 52,
  MAX: 94,
  WEIGHTS: { nvda: 0.4, tsm: 0.25, eqix: 0.2, mu: 0.15 },
} as const;

export const GRID_STRESS = {
  BASELINE: 68,
  GAIN: 1.0,
  MIN: 52,
  MAX: 92,
  WEIGHTS: { vst: 0.4, ceg: 0.35, eqix: 0.25 },
} as const;

// Jan 1, 2024 is the anchor date: AI baseload demand started pulling
// nuclear/merchant power valuations away from their pre-narrative ranges.
export const NPI_BASE = {
  CEG: 146.0, // CEG ~$143-148 range, pre-AI PPA narrative acceleration
  VST: 28.5, // VST ~$25-32 range, pre-AI merchant power premium
  CCJ: 47.5, // CCJ ~$46-49, pre-2024 uranium spot spike to $107
  NLR: 68.0, // VanEck Uranium+Nuclear ETF, early-Jan 2024 baseline
  URANIUM_SPOT: 91.0, // U3O8 spot ~$90-95/lb in Jan 2024 (pre-Feb 2024 spike)
} as const;

export const NPI_WEIGHTS = {
  ceg: 0.25,
  vst: 0.2,
  ccj: 0.15,
  nlr: 0.2,
  uranium: 0.1,
  policy: 0.1,
} as const;

export const NPI_MOMENTUM_WEIGHTS = {
  ceg: 0.35,
  vst: 0.3,
  ccj: 0.2,
  nee: 0.15,
} as const;

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface AiIndexInputs {
  nvdaChange: number;
  tsmChange: number;
  eqixChange: number;
  muChange: number;
}

/** AI Demand gauge: today's weighted basket move around the 72 baseline. */
export function computeAiPowerIndex(i: AiIndexInputs): number {
  const w = AI_INDEX.WEIGHTS;
  const momentum =
    (i.nvdaChange * w.nvda + i.tsmChange * w.tsm + i.eqixChange * w.eqix + i.muChange * w.mu) *
    AI_INDEX.GAIN;
  return clamp(AI_INDEX.MIN, AI_INDEX.MAX, AI_INDEX.BASELINE + momentum);
}

export interface GridStressInputs {
  vstChange: number;
  cegChange: number;
  eqixChange: number;
}

/** Grid Stress gauge: today's weighted power-equity move around the 68 baseline. */
export function computeGridStress(i: GridStressInputs): number {
  const w = GRID_STRESS.WEIGHTS;
  const momentum =
    (i.vstChange * w.vst + i.cegChange * w.ceg + i.eqixChange * w.eqix) * GRID_STRESS.GAIN;
  return clamp(GRID_STRESS.MIN, GRID_STRESS.MAX, GRID_STRESS.BASELINE + momentum);
}

export interface NpiInputs {
  cegPrice: number;
  vstPrice: number;
  ccjPrice: number;
  nlrPrice: number;
  uraniumSpot: number;
  smrPolicyScore: number;
}

export interface NpiResult {
  npiValue: number;
  cegPerf: number;
  vstPerf: number;
  ccjPerf: number;
  nlrPerf: number;
  uPerf: number;
  policyPerf: number;
  npiPolicyMultiplier: number;
}

/**
 * Nuclear Power Index: weighted price relatives to the Jan 1, 2024 bases,
 * scaled by a 0.9-1.1 policy multiplier. Weights are judgment calls and
 * documented as such in the README.
 */
export function computeNpi(i: NpiInputs): NpiResult {
  const cegPerf = i.cegPrice / NPI_BASE.CEG;
  const vstPerf = i.vstPrice / NPI_BASE.VST;
  const ccjPerf = i.ccjPrice / NPI_BASE.CCJ;
  const nlrPerf = i.nlrPrice / NPI_BASE.NLR;
  const uPerf = i.uraniumSpot / NPI_BASE.URANIUM_SPOT;
  const policyPerf = 0.5 + i.smrPolicyScore / 10;

  const w = NPI_WEIGHTS;
  const weightedPerf =
    w.ceg * cegPerf +
    w.vst * vstPerf +
    w.ccj * ccjPerf +
    w.nlr * nlrPerf +
    w.uranium * uPerf +
    w.policy * policyPerf;

  const npiPolicyMultiplier = 0.9 + (i.smrPolicyScore / 10) * 0.2;
  const npiValue = parseFloat((100 * weightedPerf * npiPolicyMultiplier).toFixed(1));

  return { npiValue, cegPerf, vstPerf, ccjPerf, nlrPerf, uPerf, policyPerf, npiPolicyMultiplier };
}

export interface NpiMomentumInputs {
  cegChange: number;
  vstChange: number;
  ccjChange: number;
  neeChange: number;
}

/** Intraday momentum readout shown alongside NPI (not part of the level). */
export function computeNpiMomentum(i: NpiMomentumInputs): number {
  const w = NPI_MOMENTUM_WEIGHTS;
  return i.cegChange * w.ceg + i.vstChange * w.vst + i.ccjChange * w.ccj + i.neeChange * w.nee;
}
