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
// Three different dates, never merged into one:
// - job last success (`read`): when the mechanism last completed a run. A
//   scanner's lastChecked says it looked; it does not certify every record.
// - data last observed (`dataRead`): when a value last changed or was seen.
// - claim last reviewed (`review`, recorded in dataset-reviews.json): when a
//   person last re-checked the facts against their sources.
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
   * "when did a value last change" (lastRefreshed).
   */
  | { kind: "envelope"; fields: string[] }
  /** Bare array of rows; freshness is the newest value of `field` across rows. */
  | { kind: "series-max"; field: string }
  /** No timestamp exists in the file. Its status comes from its review schedule. */
  | { kind: "none" };

export interface DatasetSpec {
  id: string;
  /** Human label for the admin report. */
  label: string;
  /** Path under server/data/. */
  file: string;
  /** Job last success: when the mechanism last completed a run. */
  read: ReadStrategy;
  /** Data last observed, where it is recorded apart from the job stamp. */
  dataRead?: ReadStrategy;
  /**
   * Hours before the job stamp is overdue. null means no mechanism refreshes
   * the file on a schedule; it is then held to its review schedule, if any.
   */
  expectedMaxAgeHours: number | null;
  /** What is supposed to refresh this, in words, for the alert to be actionable. */
  mechanism: string;
  /** A person re-checks the facts on this schedule (recorded in dataset-reviews.json). */
  review?: { owner: string; everyDays: number; scope: string };
  /**
   * Where the mechanism's writes land. "instance": written on the running
   * server (Replit autoscale), so a redeploy reverts the file to the committed
   * copy. "repo": committed. "none": hand-edited only.
   */
  writes: "repo" | "instance" | "none";
  /** A coverage check beyond the newest timestamp. */
  coverage?: "gpu-observed-models";
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
    writes: "repo",
  },
  {
    id: "interconnection-queue",
    label: "Power deals / interconnection queue",
    file: "interconnection-queue.json",
    read: { kind: "envelope", fields: ["lastChecked", "lastRefreshed"] },
    dataRead: { kind: "envelope", fields: ["lastRefreshed"] },
    expectedMaxAgeHours: 7 * DAY,
    mechanism: "POST /api/admin/scan-news-now (data-freshness.yml news-scan, when enabled)",
    review: { owner: "Jack", everyDays: 90, scope: "the firmness of every power agreement against its primary documents" },
    writes: "instance",
  },
  {
    id: "gpu-rental-prices",
    label: "GPU rental prices (curated)",
    file: "gpu-rental-prices.json",
    read: { kind: "envelope", fields: ["lastRefreshed"] },
    expectedMaxAgeHours: 10 * DAY,
    mechanism: "n8n gpu-price-refresh, weekly Mon 06:00",
    writes: "repo",
  },
  {
    id: "gpu-price-history",
    label: "GPU price history (recorder)",
    file: "gpu-price-history.json",
    read: { kind: "series-max", field: "date" },
    expectedMaxAgeHours: 3 * DAY,
    mechanism: "daily live sweep triggered by GET /api/gpu-prices/metrics (data-freshness.yml recorder-ping, when enabled)",
    writes: "instance",
    coverage: "gpu-observed-models",
  },
  {
    id: "hyperscaler-capex",
    label: "Hyperscaler capex",
    file: "hyperscaler-capex.json",
    read: { kind: "envelope", fields: ["lastRefreshed"] },
    expectedMaxAgeHours: null,
    mechanism: "hand-curated, quarterly with earnings",
    review: { owner: "Jack", everyDays: 100, scope: "each company's capex against its latest quarterly filing" },
    writes: "none",
  },
  {
    id: "inference-prices",
    label: "Frontier inference prices",
    file: "inference-prices.json",
    read: { kind: "envelope", fields: ["asOf"] },
    expectedMaxAgeHours: null,
    mechanism: "hand-curated from provider pricing pages",
    review: { owner: "Jack", everyDays: 30, scope: "each price against the provider's pricing page" },
    writes: "none",
  },
  {
    id: "frontier-models",
    label: "Frontier model registry",
    file: "frontier-models.json",
    read: { kind: "envelope", fields: ["asOf"] },
    expectedMaxAgeHours: null,
    mechanism: "hand-curated on model releases",
    review: { owner: "Jack", everyDays: 30, scope: "new releases and each benchmark row against its cited source" },
    writes: "none",
  },
  {
    id: "catalysts",
    label: "Catalyst calendar",
    file: "catalysts.json",
    read: { kind: "none" },
    expectedMaxAgeHours: null,
    mechanism: "hand-curated",
    review: { owner: "Jack", everyDays: 14, scope: "every upcoming date against its source; past events marked completed" },
    writes: "none",
  },
  {
    // datacenters.json is a bare array whose consumers expect that shape, so
    // the ingester stamps a sidecar envelope instead of the data file itself.
    id: "datacenters",
    label: "Data center facilities",
    file: "datacenters-freshness.json",
    read: { kind: "envelope", fields: ["lastChecked"] },
    dataRead: { kind: "envelope", fields: ["lastRefreshed"] },
    expectedMaxAgeHours: 2 * DAY,
    mechanism: "in-process ingester every 6h (unreliable on Replit autoscale); stamps datacenters-freshness.json",
    writes: "instance",
  },
];
