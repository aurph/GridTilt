// ─── Dataset freshness registry ──────────────────────────────────────────
//
// One declared place for the question "how old is this dataset allowed to get
// before something is wrong?". Before this file that expectation lived only in
// ops/n8n/README.md and in the owner's head, which is how the interconnection
// queue reached 77 days without anything noticing.
//
// Nothing here is public. The report this feeds is admin-gated: freshness is
// the floor, not a feature, and a service that advertises its own currency is
// advertising the bare minimum.
//
// Adding a dataset here is the whole integration. server/freshness.ts consumes
// this and needs no per-dataset code.

/**
 * How to find a dataset's own timestamp. Deliberately explicit per dataset:
 * inferring from file mtime would report a fresh checkout as fresh data, which
 * is the exact lie this module exists to prevent.
 */
export type ReadStrategy =
  /**
   * Envelope object carrying one of these fields, e.g.
   * { lastRefreshed: "2026-06-26", ... }. Ordered: the first field present
   * wins, so a dataset can prefer "when did we last look" (lastChecked) over
   * "when did a value last change" (lastRefreshed). Staleness is about whether
   * the mechanism is alive, which is the first question, not the second.
   */
  | { kind: "envelope"; fields: string[] }
  /** Bare array of rows; freshness is the newest value of `field` across rows. */
  | { kind: "series-max"; field: string }
  /** No timestamp exists in the file. Reports "unknown", never alarms. */
  | { kind: "none" };

export interface DatasetSpec {
  id: string;
  /** Human label for the admin report. */
  label: string;
  /** Path under server/data/. */
  file: string;
  read: ReadStrategy;
  /**
   * Hours before the dataset is considered overdue. null means the dataset is
   * hand-curated on no schedule: it is reported but can never trip the alarm,
   * because a curated file going quiet is a decision, not a failure.
   */
  expectedMaxAgeHours: number | null;
  /** What is supposed to refresh this, in words, for the alert to be actionable. */
  mechanism: string;
}

const DAY = 24;

/**
 * Cadences are set to roughly twice the mechanism's own period, so a single
 * missed run is tolerated and a stopped mechanism is not. The n8n flows and
 * their schedules are documented in ops/n8n/README.md.
 */
export const DATASET_REGISTRY: DatasetSpec[] = [
  {
    id: "clusters",
    label: "Compute Frontier clusters",
    file: "clusters.json",
    read: { kind: "envelope", fields: ["lastRefreshed"] },
    expectedMaxAgeHours: 2 * DAY,
    mechanism: "n8n cluster-refresh, daily 06:30 (commits even on a zero-change pass)",
  },
  {
    id: "interconnection-queue",
    label: "Power deals / interconnection queue",
    file: "interconnection-queue.json",
    read: { kind: "envelope", fields: ["lastChecked", "lastRefreshed"] },
    expectedMaxAgeHours: 7 * DAY,
    mechanism: "POST /api/admin/scan-news-now, daily via GitHub Actions (data-freshness.yml)",
  },
  {
    id: "gpu-rental-prices",
    label: "GPU rental prices (curated)",
    file: "gpu-rental-prices.json",
    read: { kind: "envelope", fields: ["lastRefreshed"] },
    expectedMaxAgeHours: 10 * DAY,
    mechanism: "n8n gpu-price-refresh, weekly Mon 06:00",
  },
  {
    id: "gpu-price-history",
    label: "GPU price history (recorder)",
    file: "gpu-price-history.json",
    read: { kind: "series-max", field: "date" },
    expectedMaxAgeHours: 3 * DAY,
    mechanism: "daily recorder ping to /api/gpu-prices/metrics, n8n 05:00",
  },
  {
    id: "hyperscaler-capex",
    label: "Hyperscaler capex",
    file: "hyperscaler-capex.json",
    read: { kind: "envelope", fields: ["lastRefreshed"] },
    expectedMaxAgeHours: null,
    mechanism: "hand-curated, quarterly with earnings",
  },
  {
    id: "inference-prices",
    label: "Frontier inference prices",
    file: "inference-prices.json",
    read: { kind: "envelope", fields: ["asOf"] },
    expectedMaxAgeHours: null,
    mechanism: "hand-curated from provider pricing pages",
  },
  {
    id: "frontier-models",
    label: "Frontier model registry",
    file: "frontier-models.json",
    read: { kind: "envelope", fields: ["asOf"] },
    expectedMaxAgeHours: null,
    mechanism: "hand-curated on model releases",
  },
  {
    // No per-row date field and no envelope: the ingester appends rows without
    // stamping anything, so the file cannot report its own age. Reports
    // "unknown" until the ingester stamps a timestamp.
    id: "datacenters",
    label: "Data center facilities",
    file: "datacenters.json",
    read: { kind: "none" },
    expectedMaxAgeHours: 2 * DAY,
    mechanism: "in-process ingester every 6h (unreliable on Replit autoscale)",
  },
];
