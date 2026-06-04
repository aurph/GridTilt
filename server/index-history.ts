// ─── Daily index history recorder ────────────────────────────────────────
//
// Appends today's gauge values to server/data/index-history.json so the
// series the validation study needed never has to be reconstructed again.
//
// Honesty about persistence: on autoscale hosts the disk is ephemeral, so
// in-deploy appends can vanish on redeploy. That is acceptable here because
// (1) the committed seed file restores the baseline series on every deploy,
// and (2) every value is deterministically regenerable from public prices
// via `npm run backtest:indices`. Live-recorded `npi` additionally captures
// the uranium/policy legs that reconstruction cannot.

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const FILE = join(process.cwd(), "server", "data", "index-history.json");

interface HistoryDay {
  date: string;
  aiDemand: number | null;
  gridStress: number | null;
  npiEquityLegs?: number | null; // from reconstruction (uranium/policy at par)
  npi?: number | null; // live full NPI, recorded in production
}

let lastRecordedDate: string | null = null;

export function recordDailyIndexValues(k: {
  aiPowerIndex: number;
  gridStress: number;
  npiValue: number;
  source: "live" | "static";
}): void {
  try {
    // Static fallback values are placeholders, not observations.
    if (k.source !== "live") return;
    const now = new Date();
    const dow = now.getUTCDay();
    // Weekend quotes echo Friday's session; don't record duplicates.
    if (dow === 0 || dow === 6) return;
    const today = now.toISOString().slice(0, 10);
    if (lastRecordedDate === today) return;

    const raw = JSON.parse(readFileSync(FILE, "utf-8")) as { days?: HistoryDay[] };
    const days = (raw.days ?? []).filter((d) => d.date !== today);
    days.push({
      date: today,
      aiDemand: parseFloat(k.aiPowerIndex.toFixed(1)),
      gridStress: parseFloat(k.gridStress.toFixed(1)),
      npi: k.npiValue,
    });
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    raw.days = days;
    writeFileSync(FILE, JSON.stringify(raw, null, 2) + "\n");
    lastRecordedDate = today;
  } catch {
    // History logging must never break the request path.
  }
}

export function readIndexHistory(): unknown {
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch {
    return { days: [] };
  }
}
