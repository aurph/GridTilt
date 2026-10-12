// ─── Subscriber backup and restore (T17) ────────────────────────────────────
//
// A dump holds every row of the three subscriber tables, states and
// suppression markers included, so a restore keeps every opt-out. A restore
// only goes into an empty database. Summaries carry counts and a checksum,
// never an address, so they can be pasted into a report or compared between
// a dump and the database it was restored into.

import { createHash } from "crypto";
import { emailHash, ensureSchema, normalizeEmail, type PoolLike } from "./subscriber-store";

export interface SubscriberDump {
  format: "gridtilt-subscribers";
  version: 1;
  exportedAt: string;
  subscribers: SubscriberRow[];
  suppressions: SuppressionRow[];
  migrations: MigrationRow[];
}

export interface SubscriberRow {
  email: string;
  state: string;
  subscribed_at: string | null;
  state_changed_at: string;
  consent_source: string;
  intent: string | null;
  context: string | null;
}

export interface SuppressionRow {
  email_hash: string;
  reason: string;
  recorded_at: string;
}

export interface MigrationRow {
  id: string;
  completed_at: string;
  detail: string | null;
}

const STATES = new Set(["active", "unsubscribed", "bounced", "complained"]);
const REASONS = new Set(["unsubscribed", "bounced", "complained", "erased"]);

const str = (v: unknown): string | null => (v == null ? null : String(v));

/** Read all three tables from one snapshot. */
export async function dumpSubscribers(pool: PoolLike, now = new Date()): Promise<SubscriberDump> {
  await ensureSchema(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const subs = await client.query(
      "SELECT email, state, subscribed_at, state_changed_at, consent_source, intent, context FROM subscribers ORDER BY email",
    );
    const sups = await client.query("SELECT email_hash, reason, recorded_at FROM subscriber_suppressions ORDER BY email_hash");
    const migs = await client.query("SELECT id, completed_at, detail FROM gt_migrations ORDER BY id");
    await client.query("COMMIT");
    return {
      format: "gridtilt-subscribers",
      version: 1,
      exportedAt: now.toISOString(),
      subscribers: subs.rows.map((r) => ({
        email: String(r.email),
        state: String(r.state),
        subscribed_at: str(r.subscribed_at),
        state_changed_at: String(r.state_changed_at),
        consent_source: String(r.consent_source),
        intent: str(r.intent),
        context: str(r.context),
      })),
      suppressions: sups.rows.map((r) => ({
        email_hash: String(r.email_hash),
        reason: String(r.reason),
        recorded_at: String(r.recorded_at),
      })),
      migrations: migs.rows.map((r) => ({ id: String(r.id), completed_at: String(r.completed_at), detail: str(r.detail) })),
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* already failed */
    }
    throw e;
  } finally {
    client.release();
  }
}

/** Check a parsed file is a dump this code wrote; throws with the first problem. */
export function parseDump(value: unknown): SubscriberDump {
  const d = value as Partial<SubscriberDump> | null;
  if (!d || d.format !== "gridtilt-subscribers" || d.version !== 1) {
    throw new Error("not a GridTilt subscriber dump (format/version missing)");
  }
  if (!Array.isArray(d.subscribers) || !Array.isArray(d.suppressions) || !Array.isArray(d.migrations)) {
    throw new Error("dump is missing a table");
  }
  d.subscribers.forEach((r, i) => {
    if (typeof r?.email !== "string" || normalizeEmail(r.email) !== r.email || !r.email.includes("@")) {
      throw new Error(`subscribers[${i}]: email is not a normalized address`);
    }
    if (!STATES.has(r.state)) throw new Error(`subscribers[${i}]: unknown state`);
    if (typeof r.state_changed_at !== "string" || typeof r.consent_source !== "string") {
      throw new Error(`subscribers[${i}]: missing state_changed_at or consent_source`);
    }
  });
  d.suppressions.forEach((r, i) => {
    if (typeof r?.email_hash !== "string" || !/^[0-9a-f]{64}$/.test(r.email_hash)) {
      throw new Error(`suppressions[${i}]: email_hash is not a sha256 hex digest`);
    }
    if (!REASONS.has(r.reason)) throw new Error(`suppressions[${i}]: unknown reason`);
  });
  d.migrations.forEach((r, i) => {
    if (typeof r?.id !== "string" || !r.id) throw new Error(`migrations[${i}]: missing id`);
  });
  return d as SubscriberDump;
}

/**
 * Load a dump into an empty database, in one transaction. Refuses a database
 * that already holds any subscriber, suppression or migration row: merging
 * into live data is not a restore.
 */
export async function restoreSubscribers(
  pool: PoolLike,
  dump: SubscriberDump,
): Promise<{ subscribers: number; suppressions: number; migrations: number }> {
  await ensureSchema(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of ["subscribers", "subscriber_suppressions", "gt_migrations"]) {
      const r = await client.query(`SELECT 1 FROM ${table} LIMIT 1`);
      if (r.rows.length > 0) throw new Error(`target database is not empty (${table} has rows); restore only into an empty database`);
    }
    for (const r of dump.subscribers) {
      await client.query(
        `INSERT INTO subscribers (email, state, subscribed_at, state_changed_at, consent_source, intent, context)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [r.email, r.state, r.subscribed_at, r.state_changed_at, r.consent_source, r.intent, r.context],
      );
    }
    for (const r of dump.suppressions) {
      await client.query("INSERT INTO subscriber_suppressions (email_hash, reason, recorded_at) VALUES ($1, $2, $3)", [
        r.email_hash,
        r.reason,
        r.recorded_at,
      ]);
    }
    for (const r of dump.migrations) {
      await client.query("INSERT INTO gt_migrations (id, completed_at, detail) VALUES ($1, $2, $3)", [
        r.id,
        r.completed_at,
        r.detail,
      ]);
    }
    await client.query("COMMIT");
    return { subscribers: dump.subscribers.length, suppressions: dump.suppressions.length, migrations: dump.migrations.length };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* already failed */
    }
    throw e;
  } finally {
    client.release();
  }
}

export interface DumpSummary {
  subscribers: number;
  byState: Record<string, number>;
  sendable: number;
  suppressions: number;
  byReason: Record<string, number>;
  migrations: string[];
  /** sha256 over hashed addresses, states and suppressions; no address is recoverable from it. */
  checksum: string;
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

/** Counts and a checksum; never an address. Equal checksums mean equal contents. */
export function summarizeDump(dump: SubscriberDump): DumpSummary {
  const lines = [
    ...dump.subscribers.map((r) => `s|${emailHash(r.email)}|${r.state}|${r.subscribed_at ?? ""}`).sort(),
    ...dump.suppressions.map((r) => `x|${r.email_hash}|${r.reason}`).sort(),
    ...dump.migrations.map((r) => `m|${r.id}`).sort(),
  ];
  return {
    subscribers: dump.subscribers.length,
    byState: tally(dump.subscribers.map((r) => r.state)),
    sendable: dump.subscribers.filter((r) => r.state === "active" && r.subscribed_at !== null).length,
    suppressions: dump.suppressions.length,
    byReason: tally(dump.suppressions.map((r) => r.reason)),
    migrations: dump.migrations.map((r) => r.id).sort(),
    checksum: createHash("sha256").update(lines.join("\n")).digest("hex"),
  };
}

export interface LegacySummary {
  rows: number;
  addresses: number;
  duplicates: number;
  invalid: number;
  withSignupDate: number;
  withoutSignupDate: number;
  notActive: number;
  checksum: string;
}

/**
 * Read a legacy list: the old bare array, or the admin export ({ subscribers }).
 * Refuses the development store's file, whose opt-outs would be lost.
 */
export function readLegacyList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value;
  const obj = value as { subscribers?: unknown; suppressions?: unknown; format?: unknown } | null;
  if (obj && obj.format === "gridtilt-subscribers") {
    throw new Error("this is a full dump; use restore, not import-legacy");
  }
  if (obj && obj.suppressions !== undefined) {
    throw new Error("this is the development store's file; its opt-outs would be lost in an import");
  }
  if (obj && Array.isArray(obj.subscribers)) return obj.subscribers as Array<Record<string, unknown>>;
  throw new Error("not a subscriber list (expected an array, or an object with a subscribers array)");
}

/** What an import would see, as counts and a checksum. */
export function summarizeLegacy(rows: Array<Record<string, unknown>>): LegacySummary {
  const seen = new Set<string>();
  let duplicates = 0;
  let invalid = 0;
  let withSignupDate = 0;
  let notActive = 0;
  for (const r of rows) {
    const email = typeof r?.email === "string" ? normalizeEmail(r.email) : "";
    if (!email.includes("@")) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    if (r.state !== undefined && r.state !== "active") notActive++;
    if (typeof r.subscribedAt === "string" && !Number.isNaN(Date.parse(r.subscribedAt))) withSignupDate++;
  }
  const hashes = Array.from(seen).map(emailHash).sort();
  return {
    rows: rows.length,
    addresses: seen.size,
    duplicates,
    invalid,
    withSignupDate,
    withoutSignupDate: seen.size - withSignupDate,
    notActive,
    checksum: createHash("sha256").update(hashes.join("\n")).digest("hex"),
  };
}

/**
 * Why an export may not be written to this path, or null. A dump holds
 * personal data: never inside the repository (git, build output) and never in
 * an evidence folder that gets shared.
 */
export function exportPathProblem(resolvedPath: string, repoRoot: string): string | null {
  const root = repoRoot.replace(/[\\/]+$/, "");
  if (resolvedPath === root || resolvedPath.startsWith(root + "/") || resolvedPath.startsWith(root + "\\")) {
    return "the path is inside the repository; write exports to a private location outside it";
  }
  if (/[\\/]evidence[\\/]/i.test(resolvedPath)) {
    return "the path is inside an evidence folder; exports hold addresses and do not belong there";
  }
  return null;
}
