// ─── Public data status (pure) ──────────────────────────────────────────────
//
// The public view of the freshness report (server/freshness.ts): for each
// dataset, when it was last updated, when a person last reviewed it, how
// often it is expected to change, and one plain status. Internal fields
// (file names, mechanisms, failure details) stay in the admin report.

import type { DatasetFreshness, FreshnessStatus } from "./freshness";

export type PublicStatus = "current" | "due" | "behind" | "review_due" | "curated" | "paused";

export const PUBLIC_STATUS_LABEL: Record<PublicStatus, string> = {
  current: "Current",
  due: "Update due",
  behind: "Behind schedule",
  review_due: "Review due",
  curated: "Curated",
  paused: "Paused",
};

const MAP: Record<FreshnessStatus, PublicStatus> = {
  ok: "current",
  reviewed_no_change: "current",
  aging: "due",
  stale: "behind",
  no_run_observed: "behind",
  fetch_failed: "behind",
  partial_coverage: "behind",
  unknown: "behind",
  review_overdue: "review_due",
  manual: "curated",
};

export interface PublicDataset {
  id: string;
  label: string;
  /** Newest data date the dataset carries (YYYY-MM-DD), or null. */
  lastUpdated: string | null;
  /** Last time a person reviewed it against sources, or null. */
  lastReviewed: string | null;
  /** Expected update interval in days, or null when it has none. */
  cadenceDays: number | null;
  reviewDue: string | null;
  status: PublicStatus;
  statusLabel: string;
  note: string | null;
}

export interface PublicDataStatus {
  generatedAt: string;
  datasets: PublicDataset[];
  counts: Record<PublicStatus, number>;
}

const day = (v: string | null | undefined) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export function publicDataStatus(
  report: { generatedAt: string; datasets: DatasetFreshness[] },
  opts: { gpuSweepEnabled: boolean },
): PublicDataStatus {
  const datasets = report.datasets.map((d): PublicDataset => {
    let status = MAP[d.status as FreshnessStatus] ?? "behind";
    let note: string | null = null;
    // The recorder is off by decision, not broken: say so.
    if (d.id === "gpu-price-history" && !opts.gpuSweepEnabled) {
      status = "paused";
      note = "Recording paused until the price providers give written permission.";
    }
    const lastUpdated = [day(d.dataLastObserved), day(d.asOf)].filter(Boolean).sort().pop() ?? null;
    return {
      id: d.id,
      label: d.label,
      lastUpdated,
      lastReviewed: day(d.claimLastReviewed),
      cadenceDays: typeof d.expectedMaxAgeHours === "number" ? Math.max(1, Math.round(d.expectedMaxAgeHours / 24)) : null,
      reviewDue: day(d.reviewDue),
      status,
      statusLabel: PUBLIC_STATUS_LABEL[status],
      note,
    };
  });
  const counts = Object.fromEntries((Object.keys(PUBLIC_STATUS_LABEL) as PublicStatus[]).map((s) => [s, 0])) as Record<PublicStatus, number>;
  for (const d of datasets) counts[d.status] += 1;
  return { generatedAt: report.generatedAt, datasets, counts };
}
