// ─── GPU economics (pure) ────────────────────────────────────────────────
//
// Turns the verified $/GPU-hr rental prices into figures people feel: cost per
// day/month/year (simple multiples, no assumptions), a cost-efficiency metric
// ($ per PFLOP-hour, using each GPU's sourced peak BF16 compute), and a
// transparent training-cost run. The training math is the standard
// GPU-hours = FLOPs / (peak_FLOP/s * MFU); every assumption is an explicit,
// adjustable input, never baked in.

const HOURS_PER_MONTH = 730; // 8760 / 12, rounded
const HOURS_PER_YEAR = 8760;

function round(n: number, dp: number): number {
  return parseFloat(n.toFixed(dp));
}

export interface GpuEconInput {
  model: string;
  vendor: string;
  currentUsdPerHr: number;
  tflopsBf16: number; // peak BF16 dense TFLOP/s; 0/undefined if unknown
}

export interface GpuEconRow {
  model: string;
  vendor: string;
  pricePerHr: number;
  tflopsBf16: number | null;
  perDay: number;
  perMonth: number;
  perYear: number;
  usdPerPflopHr: number | null; // price / petaflops; null when compute unknown
}

/** Per-model rental economics, sorted by cheapest compute (usdPerPflopHr asc;
 *  rows without a FLOPs spec sort last). */
export function computeGpuEconomics(models: GpuEconInput[]): GpuEconRow[] {
  return models
    .map((m) => {
      const hasFlops = m.tflopsBf16 > 0;
      return {
        model: m.model,
        vendor: m.vendor,
        pricePerHr: m.currentUsdPerHr,
        tflopsBf16: hasFlops ? m.tflopsBf16 : null,
        perDay: round(m.currentUsdPerHr * 24, 2),
        perMonth: round(m.currentUsdPerHr * HOURS_PER_MONTH, 0),
        perYear: round(m.currentUsdPerHr * HOURS_PER_YEAR, 0),
        usdPerPflopHr: hasFlops ? round(m.currentUsdPerHr / (m.tflopsBf16 / 1000), 2) : null,
      };
    })
    .sort((a, b) => (a.usdPerPflopHr ?? Infinity) - (b.usdPerPflopHr ?? Infinity) || a.model.localeCompare(b.model));
}

export interface TrainingInput {
  totalFlops: number; // training compute, FLOPs
  tflopsBf16: number; // GPU peak BF16 dense TFLOP/s
  mfu: number; // model FLOPs utilization, 0..1 (typically ~0.3-0.5)
  pricePerHr: number; // $/GPU-hr
  gpuCount: number; // cluster size for the wall-clock estimate
}

export interface TrainingResult {
  gpuHours: number;
  usdCost: number;
  wallClockDays: number;
}

export interface TrainingPreset {
  label: string;
  flops: number; // total training compute, FLOPs
  note: string; // source / caveat, shown in the UI
}

// Public training-compute estimates for the calculator presets. Verified
// against Epoch AI / SemiAnalysis / vendor disclosures; all are estimates and
// labeled as such in the UI.
export const TRAINING_PRESETS: TrainingPreset[] = [
  { label: "GPT-4 class (2023)", flops: 2.1e25, note: "~2.1e25 FLOPs (Epoch AI estimate)" },
  { label: "Llama 3.1 405B (2024)", flops: 3.8e25, note: "3.8e25 FLOPs (Meta, matches Epoch AI)" },
  { label: "Frontier model (2025, est.)", flops: 4.6e26, note: "~4.6e26 FLOPs (Epoch AI estimate, Grok 3 class)" },
];

/** Cost + time to run a training job. gpuHours = FLOPs / (peak * MFU). */
export function trainingRun(p: TrainingInput): TrainingResult {
  const effectiveFlopPerSec = p.tflopsBf16 * 1e12 * p.mfu;
  const gpuSeconds = effectiveFlopPerSec > 0 ? p.totalFlops / effectiveFlopPerSec : 0;
  const gpuHours = gpuSeconds / 3600;
  return {
    gpuHours: round(gpuHours, 0),
    usdCost: round(gpuHours * p.pricePerHr, 0),
    wallClockDays: p.gpuCount > 0 ? round(gpuHours / p.gpuCount / 24, 1) : 0,
  };
}
