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
  /** Within its expected cadence. */
  | "ok"
  /** Overdue, but under 2x. One missed run looks like this. */
  | "aging"
  /** Past 2x its cadence. The mechanism has almost certainly stopped. */
  | "stale"
  /** Hand-curated with no declared cadence. Reported, never alarms. */
  | "manual"
  /** No readable timestamp, or the file is missing/malformed. Never alarms. */
  | "unknown";

export interface DatasetFreshness {
  id: string;
  label: string;
  file: string;
  /** ISO date the dataset reports for itself, or null when unreadable. */
  asOf: string | null;
  ageHours: number | null;
  expectedMaxAgeHours: number | null;
  status: FreshnessStatus;
  mechanism: string;
  /** Why the status is what it is, in words, so an alert is actionable. */
  detail: string;
}

export interface FreshnessReport {
  generatedAt: string;
  datasets: DatasetFreshness[];
  /** Datasets at "stale". These are what trip the deadman. */
  stale: string[];
  /** Datasets at "aging". Reported but do not trip the deadman on their own. */
  aging: string[];
  /** True when nothing is stale. The whole point of the check endpoint. */
  healthy: boolean;
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

function classify(
  spec: DatasetSpec,
  asOf: string | null,
  ageHours: number | null,
): { status: FreshnessStatus; detail: string } {
  if (asOf == null || ageHours == null) {
    return {
      status: "unknown",
      detail:
        spec.read.kind === "none"
          ? "file carries no timestamp, so its age cannot be checked"
          : "timestamp missing or unparseable",
    };
  }

  if (spec.expectedMaxAgeHours == null) {
    return {
      status: "manual",
      detail: `hand-curated, ${Math.floor(ageHours / 24)}d old, no cadence to miss`,
    };
  }

  const days = Math.floor(ageHours / 24);
  const limit = spec.expectedMaxAgeHours;

  if (ageHours <= limit) {
    return { status: "ok", detail: `${days}d old, within ${Math.round(limit / 24)}d` };
  }
  if (ageHours <= limit * 2) {
    return {
      status: "aging",
      detail: `${days}d old, past its ${Math.round(limit / 24)}d cadence (one missed run looks like this)`,
    };
  }
  return {
    status: "stale",
    detail: `${days}d old, more than double its ${Math.round(limit / 24)}d cadence: ${spec.mechanism} has probably stopped`,
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
): FreshnessReport {
  const datasets: DatasetFreshness[] = registry.map((spec) => {
    const asOf = readStamp(contentsById[spec.id], spec.read);
    const stampMs = parseStamp(asOf);
    const ageHours = stampMs == null ? null : Math.max(0, (nowMs - stampMs) / HOUR_MS);
    const { status, detail } = classify(spec, asOf, ageHours);

    return {
      id: spec.id,
      label: spec.label,
      file: spec.file,
      asOf,
      ageHours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
      expectedMaxAgeHours: spec.expectedMaxAgeHours,
      status,
      mechanism: spec.mechanism,
      detail,
    };
  });

  const stale = datasets.filter((d) => d.status === "stale").map((d) => d.id);
  const aging = datasets.filter((d) => d.status === "aging").map((d) => d.id);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    datasets,
    stale,
    aging,
    healthy: stale.length === 0,
  };
}
