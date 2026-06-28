// ─── Daily GPU rental price recorder ─────────────────────────────────────
//
// Appends today's blended on-demand price per model to
// server/data/gpu-price-history.json so the Neocloud Intel chart accrues a
// real, single-methodology series over time (the curated file only carries
// sparse sourced anchors). This is the auto-updating piece the rest of the
// curated datasets lack.
//
// Same honesty/persistence notes as index-history: dates are US-Eastern, one
// snapshot per day; on autoscale hosts the disk is ephemeral so appends can
// reset on redeploy, but the committed anchors restore the baseline and the
// series rebuilds forward.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { GpuHistoryAnchor } from "./gpu-index";

const FILE = join(process.cwd(), "server", "data", "gpu-price-history.json");

interface Snapshot {
  date: string; // YYYY-MM-DD, US-Eastern
  prices: Record<string, number>;
}

function easternDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

export function readGpuHistory(): Snapshot[] {
  try {
    if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, "utf-8")) as Snapshot[];
  } catch (e) {
    console.error("gpu history read error:", e);
  }
  return [];
}

/** Append today's prices once per Eastern day. Best-effort. */
export function recordDailyGpuPrices(models: Array<{ model: string; currentUsdPerHr: number }>): void {
  try {
    const hist = readGpuHistory();
    const today = easternDateStr();
    if (hist.some((s) => s.date === today)) return;
    const prices: Record<string, number> = {};
    for (const m of models) prices[m.model] = m.currentUsdPerHr;
    hist.push({ date: today, prices });
    writeFileSync(FILE, JSON.stringify(hist, null, 2) + "\n", "utf-8");
  } catch (e) {
    console.error("gpu history record error:", e);
  }
}

/** Recorded daily points reshaped per-model for computeGpuIndex. */
export function recordedByModel(): Record<string, GpuHistoryAnchor[]> {
  const out: Record<string, GpuHistoryAnchor[]> = {};
  for (const s of readGpuHistory()) {
    for (const [model, price] of Object.entries(s.prices)) {
      (out[model] = out[model] ?? []).push({ date: s.date, price });
    }
  }
  return out;
}
