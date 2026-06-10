// ─── Daily scoreboard history recorder ────────────────────────────────────
//
// Appends today's scoreboard scalars to server/data/metrics-history.json so
// the buildout chart has a real series. Modeled on the retired
// index-history recorder, minus the market-hours gates: physical data has no
// trading session, so any day's snapshot is a valid observation.
//
// Persistence caveat (same as everything in server/data): autoscale disks
// are ephemeral, so in-deploy appends can vanish on redeploy until the
// durability work (audit M2) lands. Sparse early history is expected.

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { MetricsSnapshot } from "./metrics";

const FILE = join(process.cwd(), "server", "data", "metrics-history.json");

export interface MetricsHistoryDay {
  date: string;
  signedGW: number;
  announcedGW: number;
  constructionGW: number;
  operationalGW: number;
  queueOverallGW: number;
  capexUsdBillions: number;
  uraniumSpotUsdPerLb: number;
}

function easternDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

let lastRecordedDate: string | null = null;

export function recordDailyMetrics(s: MetricsSnapshot): void {
  try {
    const today = easternDate(new Date());
    if (lastRecordedDate === today) return;
    const raw = JSON.parse(readFileSync(FILE, "utf-8")) as { days?: MetricsHistoryDay[] };
    const days = (raw.days ?? []).filter((d) => d.date !== today);
    days.push({
      date: today,
      signedGW: s.signedGW,
      announcedGW: s.announcedGW,
      constructionGW: s.constructionGW,
      operationalGW: s.operationalGW,
      queueOverallGW: s.queueOverallGW,
      capexUsdBillions: s.capexUsdBillions,
      uraniumSpotUsdPerLb: s.uraniumSpotUsdPerLb,
    });
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    (raw as Record<string, unknown>).days = days;
    writeFileSync(FILE, JSON.stringify(raw, null, 2) + "\n");
    lastRecordedDate = today;
  } catch {
    // History logging must never break the request path.
  }
}

export function readMetricsHistory(): { days: MetricsHistoryDay[] } {
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf-8")) as { days?: MetricsHistoryDay[] };
    return { days: raw.days ?? [] };
  } catch {
    return { days: [] };
  }
}

/** The snapshot from ~N days ago (closest at-or-before), for digest deltas. */
export function snapshotDaysAgo(n: number): MetricsHistoryDay | null {
  const { days } = readMetricsHistory();
  if (days.length === 0) return null;
  const cutoff = easternDate(new Date(Date.now() - n * 86400000));
  const eligible = days.filter((d) => d.date <= cutoff);
  return eligible.length > 0 ? eligible[eligible.length - 1] : null;
}
