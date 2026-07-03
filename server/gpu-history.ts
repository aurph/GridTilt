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
import type { LiveModelPrice } from "./gpu-live";

const FILE = join(process.cwd(), "server", "data", "gpu-price-history.json");

export interface SnapshotMeta {
  low: number;
  high: number;
  sources: string[];
  n: number;
}

export interface Snapshot {
  date: string; // YYYY-MM-DD, US-Eastern
  prices: Record<string, number>;
  /** per-model provenance for live-recorded days (absent on legacy rows) */
  meta?: Record<string, SnapshotMeta>;
  /** "live" = observed from provider APIs; "curated" = copied static price */
  source?: "live" | "curated";
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

/** Has today (US-Eastern) already been recorded from LIVE sources? A legacy
 * static row does not count - the sweep should upgrade it. */
export function hasTodayLiveSnapshot(): boolean {
  const today = easternDateStr();
  return readGpuHistory().some((s) => s.date === today && s.source === "live");
}

/**
 * Append today's LIVE observations once per Eastern day. Only models with a
 * real observation are written; a model with no live source that day records
 * nothing (the curated anchors + est. flags carry it honestly). Writes
 * nothing at all if the sweep came back empty.
 */
export function recordDailyLivePrices(live: Record<string, LiveModelPrice>): void {
  try {
    const models = Object.keys(live);
    if (models.length === 0) return;
    let hist = readGpuHistory();
    const today = easternDateStr();
    if (hist.some((s) => s.date === today && s.source === "live")) return;
    // A same-day legacy row (static curated copy) is superseded by real
    // observations, never kept alongside them.
    hist = hist.filter((s) => !(s.date === today && s.source !== "live"));
    const prices: Record<string, number> = {};
    const meta: Record<string, SnapshotMeta> = {};
    for (const m of models) {
      prices[m] = live[m].price;
      meta[m] = { low: live[m].low, high: live[m].high, sources: live[m].sources, n: live[m].n };
    }
    hist.push({ date: today, prices, meta, source: "live" });
    writeFileSync(FILE, JSON.stringify(hist, null, 2) + "\n", "utf-8");
  } catch (e) {
    console.error("gpu history record error:", e);
  }
}

/**
 * Latest live-recorded price per model with its age in days (Eastern-date
 * granularity), for promoting fresh observations to the served current price.
 */
export function latestLiveByModel(): Record<string, { price: number; date: string; ageDays: number; sources: string[] }> {
  const out: Record<string, { price: number; date: string; ageDays: number; sources: string[] }> = {};
  const today = easternDateStr();
  const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
  for (const s of readGpuHistory()) {
    if (s.source !== "live") continue;
    const ageDays = Math.round((toUtc(today) - toUtc(s.date)) / 86_400_000);
    for (const [model, price] of Object.entries(s.prices)) {
      if (!out[model] || out[model].date < s.date) {
        out[model] = { price, date: s.date, ageDays, sources: s.meta?.[model]?.sources ?? [] };
      }
    }
  }
  return out;
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
