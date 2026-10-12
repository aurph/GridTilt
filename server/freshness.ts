// ─── Dataset freshness (pure) ────────────────────────────────────────────
//
// Turns the declared registry plus raw file contents into a per-dataset verdict.
// Pure and injected on purpose (same discipline as indices.ts / clusters.ts /
// gpu-index.ts): no fs, no Date.now, no env. The route layer does the IO.
//
// The point of this module is not to display dates. It is to answer one
// question an unattended pipeline cannot answer about itself: has a mechanism
// stopped running? A flow on a homelab box dies quietly (reboot, expired token,
// n8n switched off) and the only symptom is a date that stops moving. That is
// exactly how the interconnection queue reached 77 days unnoticed.

import { DATASET_REGISTRY, type DatasetSpec, type ReadStrategy } from "./freshness-registry.js";

export type FreshnessStatus =
  /** Within its expected cadence (and its review, if it has one). */
  | "ok"
  /** Overdue, but under 2x. One missed run looks like this; not an alert. */
  | "aging"
  /** Past 2x its cadence. The mechanism has almost certainly stopped. */
  | "stale"
  /** A cadence is declared but no run has ever stamped the file. */
  | "no_run_observed"
  /** The latest recorded run failed after the last success. */
  | "fetch_failed"
  /** The newest stamp is fresh, but some expected series are not. */
  | "partial_coverage"
  /** A person's review is missing or past its deadline. */
  | "review_overdue"
  /** Reviewed within its deadline, and the review found nothing to change. */
  | "reviewed_no_change"
  /** Hand-curated with no cadence and no review schedule. Reported only. */
  | "manual"
  /** A timestamp the dataset should carry is unreadable, or the file is missing. */
  | "unknown";

/** Statuses that need someone: they make the report unhealthy. */
export const ATTENTION: ReadonlySet<FreshnessStatus> = new Set<FreshnessStatus>([
  "stale",
  "fetch_failed",
  "no_run_observed",
  "unknown",
  "partial_coverage",
  "review_overdue",
]);

/** Worst first: the dataset's status is its worst issue. */
const SEVERITY: FreshnessStatus[] = [
  "stale",
  "fetch_failed",
  "no_run_observed",
  "unknown",
  "partial_coverage",
  "review_overdue",
  "aging",
  "reviewed_no_change",
  "ok",
  "manual",
];

export interface DatasetFreshness {
  id: string;
  label: string;
  file: string;
  /** Job last success, as the dataset reports it (null when unreadable). Kept as asOf for callers. */
  asOf: string | null;
  jobLastSuccess: string | null;
  dataLastObserved: string | null;
  claimLastReviewed: string | null;
  /** YYYY-MM-DD the next review is due, for datasets with a review schedule. */
  reviewDue: string | null;
  ageHours: number | null;
  expectedMaxAgeHours: number | null;
  status: FreshnessStatus;
  /** Every problem found, worst first; the first is `status`. */
  issues: FreshnessStatus[];
  writes: "repo" | "instance" | "none";
  mechanism: string;
  /** Why the status is what it is, in words, so an alert is actionable. */
  detail: string;
}

export interface FreshnessReport {
  generatedAt: string;
  datasets: DatasetFreshness[];
  /** Datasets at "stale". */
  stale: string[];
  /** Datasets at "aging". Reported but not an alert on their own. */
  aging: string[];
  /** Everything that needs someone, worst first. */
  attention: Array<{ id: string; status: FreshnessStatus; detail: string }>;
  /** True when nothing needs attention. The check endpoint answers 503 otherwise. */
  healthy: boolean;
}

/** One completed review of a dataset's facts (server/data/dataset-reviews.json). */
export interface ReviewRecord {
  dataset: string;
  /** YYYY-MM-DD */
  reviewed: string;
  outcome: "changed" | "no-change";
  scope: string;
  evidence?: string;
}

/** Raw file contents by dataset id. undefined means unreadable or missing. */
export type FileContents = Record<string, unknown>;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Parse a date that may be "2026-06-26" or a full ISO timestamp.
 *
 * A bare date is treated as the START of that UTC day, never the end. A dataset
 * stamped "today" therefore reads as up to 24h old rather than 0h old, which
 * keeps the age estimate conservative: this module should never report data as
 * fresher than it can prove.
 */
export function parseStamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ms = Date.parse(`${trimmed}T00:00:00Z`);
    return Number.isNaN(ms) ? null : ms;
  }
  const ms = Date.parse(trimmed);
  return Number.isNaN(ms) ? null : ms;
}

/** Pull the dataset's self-reported stamp out of its contents, per strategy. */
export function readStamp(contents: unknown, strategy: ReadStrategy): string | null {
  if (contents == null) return null;

  if (strategy.kind === "none") return null;

  if (strategy.kind === "envelope") {
    if (typeof contents !== "object" || Array.isArray(contents)) return null;
    const obj = contents as Record<string, unknown>;
    // First declared field that is actually present wins, so "did we look"
    // takes precedence over "did anything change" where both are recorded.
    for (const field of strategy.fields) {
      const raw = obj[field];
      if (typeof raw === "string" && raw.trim()) return raw.trim();
    }
    return null;
  }

  // series-max: newest row wins. Rows without the field are ignored rather
  // than treated as epoch, so one malformed row cannot make a live series
  // look dead.
  if (!Array.isArray(contents)) return null;
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const row of contents) {
    if (row == null || typeof row !== "object") continue;
    const raw = (row as Record<string, unknown>)[strategy.field];
    if (typeof raw !== "string") continue;
    const ms = parseStamp(raw);
    if (ms == null) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = raw.trim();
    }
  }
  return best;
}

function ageHoursOf(stamp: string | null, nowMs: number): number | null {
  const ms = parseStamp(stamp);
  return ms == null ? null : Math.max(0, (nowMs - ms) / HOUR_MS);
}

function cadenceIssue(spec: DatasetSpec, ageHours: number): { status: FreshnessStatus; detail: string } {
  const limit = spec.expectedMaxAgeHours as number;
  const days = Math.floor(ageHours / 24);
  if (ageHours <= limit) return { status: "ok", detail: `${days}d since the last run, within ${Math.round(limit / 24)}d` };
  if (ageHours <= limit * 2) {
    return { status: "aging", detail: `${days}d since the last run, past its ${Math.round(limit / 24)}d cadence (one missed run looks like this)` };
  }
  return {
    status: "stale",
    detail: `${days}d since the last run, more than double its ${Math.round(limit / 24)}d cadence: ${spec.mechanism} has probably stopped`,
  };
}

/**
 * Expected coverage for the GPU recorder: every model it has ever observed
 * should keep appearing. One fresh H100 must not make a missing H200 series
 * look healthy. Models never observed live are not expected (not every model
 * is listed for rent), and nothing here promises daily data per model.
 */
export function gpuCoverageGaps(history: unknown, windowHours: number): { observed: string[]; missing: string[]; newest: string | null } {
  if (!Array.isArray(history)) return { observed: [], missing: [], newest: null };
  const lastSeen = new Map<string, number>();
  let newestMs = -Infinity;
  let newest: string | null = null;
  for (const row of history) {
    if (row == null || typeof row !== "object") continue;
    const date = (row as { date?: unknown }).date;
    const ms = parseStamp(date);
    const prices = (row as { prices?: unknown }).prices;
    if (ms == null || prices == null || typeof prices !== "object") continue;
    if (ms > newestMs) {
      newestMs = ms;
      newest = String(date);
    }
    for (const [model, price] of Object.entries(prices as Record<string, unknown>)) {
      if (typeof price !== "number" || !(price > 0)) continue;
      if (ms > (lastSeen.get(model) ?? -Infinity)) lastSeen.set(model, ms);
    }
  }
  const observed = Array.from(lastSeen.keys()).sort();
  const missing = observed.filter((m) => newestMs - (lastSeen.get(m) as number) > windowHours * HOUR_MS);
  return { observed, missing, newest };
}

function evaluate(spec: DatasetSpec, contents: unknown, nowMs: number, reviews: ReviewRecord[]): DatasetFreshness {
  const issues: Array<{ status: FreshnessStatus; detail: string }> = [];
  const jobLastSuccess = readStamp(contents, spec.read);
  const dataLastObserved = spec.dataRead ? readStamp(contents, spec.dataRead) : null;
  const ageHours = ageHoursOf(jobLastSuccess, nowMs);

  if (contents === undefined) {
    issues.push({ status: "unknown", detail: `server/data/${spec.file} is missing or unreadable` });
  } else if (spec.expectedMaxAgeHours != null) {
    if (spec.read.kind === "none") {
      issues.push({ status: "unknown", detail: "a cadence is declared but the file carries no timestamp to check it against" });
    } else if (jobLastSuccess == null) {
      issues.push({ status: "no_run_observed", detail: `no run has been recorded: ${spec.mechanism}` });
    } else if (ageHours == null) {
      issues.push({ status: "unknown", detail: `the run stamp "${jobLastSuccess}" is not a date` });
    } else {
      issues.push(cadenceIssue(spec, ageHours));
    }

    // A failure recorded after the last success means the latest run failed.
    if (contents && typeof contents === "object" && !Array.isArray(contents)) {
      const env = contents as Record<string, unknown>;
      const failMs = parseStamp(env.lastFailureAt);
      const okMs = parseStamp(jobLastSuccess);
      if (failMs != null && (okMs == null || failMs > okMs)) {
        const reason = typeof env.lastFailureReason === "string" ? env.lastFailureReason : "no reason recorded";
        issues.push({ status: "fetch_failed", detail: `the latest run failed (${String(env.lastFailureAt)}): ${reason}` });
      }
    }

    if (spec.coverage === "gpu-observed-models") {
      const { observed, missing } = gpuCoverageGaps(contents, spec.expectedMaxAgeHours);
      if (missing.length > 0) {
        issues.push({
          status: "partial_coverage",
          detail: `${missing.length} of ${observed.length} observed models have no recent row: ${missing.join(", ")}`,
        });
      }
    }
  }

  // The review schedule: when a person last re-checked the facts.
  let claimLastReviewed: string | null = null;
  let reviewDue: string | null = null;
  if (spec.review) {
    const latest = reviews
      .filter((r) => r.dataset === spec.id && parseStamp(r.reviewed) != null)
      .sort((a, b) => (parseStamp(b.reviewed) as number) - (parseStamp(a.reviewed) as number))[0];
    if (!latest) {
      reviewDue = new Date(nowMs).toISOString().slice(0, 10);
      issues.push({ status: "review_overdue", detail: `never reviewed: ${spec.review.scope} (owner: ${spec.review.owner})` });
    } else {
      claimLastReviewed = latest.reviewed;
      const dueMs = (parseStamp(latest.reviewed) as number) + spec.review.everyDays * 24 * HOUR_MS;
      reviewDue = new Date(dueMs).toISOString().slice(0, 10);
      if (nowMs > dueMs) {
        issues.push({
          status: "review_overdue",
          detail: `last reviewed ${latest.reviewed}, due ${reviewDue} (every ${spec.review.everyDays}d): ${spec.review.scope} (owner: ${spec.review.owner})`,
        });
      } else if (latest.outcome === "no-change") {
        issues.push({ status: "reviewed_no_change", detail: `reviewed ${latest.reviewed}, nothing changed; next due ${reviewDue}` });
      } else {
        issues.push({ status: "ok", detail: `reviewed ${latest.reviewed}; next due ${reviewDue}` });
      }
    }
  }

  if (issues.length === 0) {
    const age = ageHours == null ? "no timestamp" : `${Math.floor(ageHours / 24)}d old`;
    issues.push({ status: "manual", detail: `hand-curated, ${age}, no cadence or review schedule` });
  }

  issues.sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status));
  const worst = issues[0];
  return {
    id: spec.id,
    label: spec.label,
    file: spec.file,
    asOf: jobLastSuccess,
    jobLastSuccess,
    dataLastObserved,
    claimLastReviewed,
    reviewDue,
    ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
    expectedMaxAgeHours: spec.expectedMaxAgeHours,
    status: worst.status,
    issues: issues.map((i) => i.status),
    writes: spec.writes,
    mechanism: spec.mechanism,
    detail: issues.map((i) => i.detail).join("; "),
  };
}

/**
 * Build the report.
 *
 * `nowMs` is injected so the tests are deterministic and so the caller owns the
 * clock, matching how the rest of the server's pure modules are written.
 */
export function computeFreshness(
  contentsById: FileContents,
  nowMs: number,
  registry: DatasetSpec[] = DATASET_REGISTRY,
  reviews: ReviewRecord[] = [],
): FreshnessReport {
  const datasets = registry.map((spec) => evaluate(spec, contentsById[spec.id], nowMs, reviews));
  const attention = datasets
    .filter((d) => ATTENTION.has(d.status))
    .sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status))
    .map((d) => ({ id: d.id, status: d.status, detail: d.detail }));
  return {
    generatedAt: new Date(nowMs).toISOString(),
    datasets,
    stale: datasets.filter((d) => d.status === "stale").map((d) => d.id),
    aging: datasets.filter((d) => d.status === "aging").map((d) => d.id),
    attention,
    healthy: attention.length === 0,
  };
}

const REMEDY: Partial<Record<FreshnessStatus, (d: DatasetFreshness) => string>> = {
  stale: () => "Check that the mechanism named above is running, then run it once by hand.",
  no_run_observed: () => "Start the mechanism named above; nothing has recorded a run yet.",
  fetch_failed: () => "Read the failure reason, fix the source or credentials, and rerun.",
  partial_coverage: () => "Check the sweep's sources for the missing series.",
  review_overdue: () => "Do the review, then add it to server/data/dataset-reviews.json.",
  unknown: (d) => `Restore server/data/${d.file} or its timestamp field.`,
};

/**
 * The text an alert would carry, for the admin preview. Nothing here sends it:
 * delivery and schedules need the owner's go-ahead.
 */
export function renderFreshnessAlert(report: FreshnessReport): { subject: string; text: string } {
  if (report.healthy) {
    return { subject: "GridTilt data freshness: nothing needs attention", text: `Checked ${report.generatedAt}. Nothing needs attention.\n` };
  }
  const byId = new Map(report.datasets.map((d) => [d.id, d]));
  const lines = [`Checked ${report.generatedAt}. ${report.attention.length} dataset(s) need attention:`, ""];
  for (const a of report.attention) {
    const d = byId.get(a.id) as DatasetFreshness;
    lines.push(`- ${d.label} (${a.status}): ${a.detail}`);
    const remedy = REMEDY[a.status]?.(d);
    if (remedy) lines.push(`  What to do: ${remedy}`);
    if (d.writes === "instance") {
      lines.push("  Note: this file is written on the running server; a redeploy reverts it to the committed copy.");
    }
  }
  return {
    subject: `GridTilt data freshness: ${report.attention.length} need attention`,
    text: lines.join("\n") + "\n",
  };
}
