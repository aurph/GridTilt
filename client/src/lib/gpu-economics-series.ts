/** Pure calculator math shared by the headline estimate and MFU sensitivity chart. */

export interface TrainingBaseInput {
  totalFlops: number;
  tflopsBf16: number;
  pricePerHr: number;
  gpuCount: number;
}

export interface TrainingEstimateInput extends TrainingBaseInput {
  /** Machine utilization as a percentage from 0 to 100. */
  mfu: number;
}

export interface TrainingEstimate {
  gpuHours: number;
  usdCost: number;
  wallClockDays: number;
}

export interface TrainingSensitivityPoint extends TrainingEstimate {
  mfu: number;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function trainingEstimate(input: TrainingEstimateInput): TrainingEstimate | null {
  if (
    !positiveFinite(input.totalFlops) ||
    !positiveFinite(input.tflopsBf16) ||
    !positiveFinite(input.pricePerHr) ||
    !positiveFinite(input.gpuCount) ||
    !positiveFinite(input.mfu) ||
    input.mfu > 100
  ) {
    return null;
  }
  const effectiveFlopsPerSecond = input.tflopsBf16 * 1e12 * (input.mfu / 100);
  const gpuHours = input.totalFlops / effectiveFlopsPerSecond / 3600;
  return {
    gpuHours,
    usdCost: gpuHours * input.pricePerHr,
    wallClockDays: gpuHours / input.gpuCount / 24,
  };
}

export function trainingSensitivity(
  input: TrainingBaseInput,
  minMfu = 20,
  maxMfu = 60,
  step = 5,
): TrainingSensitivityPoint[] {
  if (
    !positiveFinite(minMfu) ||
    !positiveFinite(maxMfu) ||
    !positiveFinite(step) ||
    minMfu > maxMfu ||
    maxMfu > 100
  ) {
    return [];
  }
  const out: TrainingSensitivityPoint[] = [];
  for (let mfu = minMfu; mfu <= maxMfu + Number.EPSILON; mfu += step) {
    const estimate = trainingEstimate({ ...input, mfu });
    if (!estimate) return [];
    out.push({ mfu, ...estimate });
  }
  return out;
}
