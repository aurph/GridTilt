// ─── Newsletter issues and the delivery ledger (T18) ─────────────────────────
//
// An issue is rendered once and frozen as (issue_id, revision): subject, HTML
// and text are stored, so a retry after a restart sends byte-identical content
// under the same idempotency key. Each recipient has at most one delivery row
// per issue revision, keyed by email hash (the address itself stays in the
// subscribers table). A send run holds a time-limited lease on the revision,
// so two runs never fan out the same issue at once.
//
// Corrections: revision 2+ of an issue needs a reason and goes only to the
// recipients an earlier revision was accepted for. A revision is never sent
// twice to the same address.
//
// Delivery states:
//   queued      not tried yet, or a retryable failure (rate limit, provider error)
//   attempting  a request is (or was, if the process died) in flight
//   accepted    the provider took it (its id is stored); not proof of delivery
//   delivered   the provider's webhook reported delivery
//   failed      rejected by the provider, or a permanent bounce
//   unknown     no answer: may have been accepted. Retried only with the same
//               idempotency key inside the provider's window, else left for review
//   skipped     not sendable when its turn came (opted out, suppressed, erased)

import { createHash, randomBytes } from "crypto";
import { ensureSchema, type PoolLike } from "./subscriber-store";

export type DeliveryState = "queued" | "attempting" | "accepted" | "delivered" | "failed" | "unknown" | "skipped";

export interface Issue {
  issueId: string;
  revision: number;
  subject: string;
  html: string;
  text: string;
  contentSha256: string;
  createdAt: string;
  correctionReason: string | null;
  /** Why this revision may not be sent, recorded when it was rendered. */
  blockers: string[];
}

export interface DeliveryRow {
  issueId: string;
  revision: number;
  emailHash: string;
  state: DeliveryState;
  idempotencyKey: string;
  providerId: string | null;
  attempts: number;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  detail: string | null;
}

const LEDGER_SQL = [
  `CREATE TABLE IF NOT EXISTS newsletter_issues (
    issue_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    subject TEXT NOT NULL,
    html TEXT NOT NULL,
    text_body TEXT NOT NULL,
    content_sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    correction_reason TEXT,
    blockers TEXT NOT NULL,
    lease_owner TEXT,
    lease_expires_at TEXT,
    PRIMARY KEY (issue_id, revision)
  )`,
  `CREATE TABLE IF NOT EXISTS newsletter_deliveries (
    issue_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    email_hash TEXT NOT NULL,
    state TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    provider_id TEXT,
    attempts INTEGER NOT NULL,
    first_attempt_at TEXT,
    last_attempt_at TEXT,
    detail TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (issue_id, revision, email_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS provider_events (
    event_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    claim TEXT NOT NULL,
    received_at TEXT NOT NULL
  )`,
];

export async function ensureLedger(pool: Pick<PoolLike, "query">): Promise<void> {
  await ensureSchema(pool);
  for (const sql of LEDGER_SQL) {
    try {
      await pool.query(sql);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== "23505" && code !== "42P07") throw e;
    }
  }
}

const ISSUE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function contentSha256(subject: string, html: string, text: string): string {
  return createHash("sha256").update(`${subject}\u0000${html}\u0000${text}`).digest("hex");
}

/** Same address, same issue revision: same key, on every retry and after a restart. */
export function idempotencyKeyFor(issueId: string, revision: number, emailHash: string): string {
  return `gridtilt-${issueId}-r${revision}-${emailHash.slice(0, 40)}`;
}

function toIssue(r: Record<string, unknown>): Issue {
  return {
    issueId: String(r.issue_id),
    revision: Number(r.revision),
    subject: String(r.subject),
    html: String(r.html),
    text: String(r.text_body),
    contentSha256: String(r.content_sha256),
    createdAt: String(r.created_at),
    correctionReason: r.correction_reason == null ? null : String(r.correction_reason),
    blockers: JSON.parse(String(r.blockers ?? "[]")),
  };
}

function toDelivery(r: Record<string, unknown>): DeliveryRow {
  return {
    issueId: String(r.issue_id),
    revision: Number(r.revision),
    emailHash: String(r.email_hash),
    state: String(r.state) as DeliveryState,
    idempotencyKey: String(r.idempotency_key),
    providerId: r.provider_id == null ? null : String(r.provider_id),
    attempts: Number(r.attempts),
    firstAttemptAt: r.first_attempt_at == null ? null : String(r.first_attempt_at),
    lastAttemptAt: r.last_attempt_at == null ? null : String(r.last_attempt_at),
    detail: r.detail == null ? null : String(r.detail),
  };
}

/**
 * Freeze a rendered issue as its next revision. Revision 1 is the issue;
 * anything later is a correction and must say why.
 */
export async function createIssue(
  pool: PoolLike,
  input: { issueId: string; subject: string; html: string; text: string; blockers: string[]; correctionReason?: string | null },
  now = new Date(),
): Promise<Issue> {
  if (!ISSUE_ID.test(input.issueId)) throw new Error("issue id must be 3 to 64 lowercase letters, digits or dashes");
  await ensureLedger(pool);
  const prev = await pool.query("SELECT MAX(revision) AS max FROM newsletter_issues WHERE issue_id = $1", [input.issueId]);
  const max = prev.rows[0]?.max == null ? 0 : Number(prev.rows[0].max);
  const revision = max + 1;
  const reason = input.correctionReason?.trim() || null;
  if (revision > 1 && !reason) throw new Error(`${input.issueId} already has revision ${max}; a new revision is a correction and needs a reason`);
  const sha = contentSha256(input.subject, input.html, input.text);
  await pool.query(
    `INSERT INTO newsletter_issues (issue_id, revision, subject, html, text_body, content_sha256, created_at, correction_reason, blockers)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [input.issueId, revision, input.subject, input.html, input.text, sha, now.toISOString(), revision > 1 ? reason : null, JSON.stringify(input.blockers)],
  );
  return (await getIssue(pool, input.issueId, revision))!;
}

export async function getIssue(pool: PoolLike, issueId: string, revision: number): Promise<Issue | null> {
  await ensureLedger(pool);
  const r = await pool.query("SELECT * FROM newsletter_issues WHERE issue_id = $1 AND revision = $2", [issueId, revision]);
  return r.rows[0] ? toIssue(r.rows[0]) : null;
}

/**
 * Take (or renew) the send lease on a revision. Atomic on Postgres: a second
 * run's UPDATE waits for the first to commit, then finds an unexpired lease
 * and changes nothing. The owner is read back rather than trusting RETURNING.
 */
export async function claimLease(
  pool: PoolLike,
  issueId: string,
  revision: number,
  owner: string,
  now: Date,
  ttlMs: number,
): Promise<boolean> {
  await ensureLedger(pool);
  await pool.query(
    `UPDATE newsletter_issues SET lease_owner = $3, lease_expires_at = $4
     WHERE issue_id = $1 AND revision = $2
       AND (lease_owner IS NULL OR lease_owner = $3 OR lease_expires_at < $5)`,
    [issueId, revision, owner, new Date(now.getTime() + ttlMs).toISOString(), now.toISOString()],
  );
  const r = await pool.query("SELECT lease_owner FROM newsletter_issues WHERE issue_id = $1 AND revision = $2", [issueId, revision]);
  return r.rows[0]?.lease_owner === owner;
}

export async function releaseLease(pool: PoolLike, issueId: string, revision: number, owner: string): Promise<void> {
  await pool.query(
    "UPDATE newsletter_issues SET lease_owner = NULL, lease_expires_at = NULL WHERE issue_id = $1 AND revision = $2 AND lease_owner = $3",
    [issueId, revision, owner],
  );
}

export function newLeaseOwner(): string {
  return `run-${randomBytes(8).toString("hex")}`;
}

/** Add a queued row per recipient; an existing row for the same revision and address is left as it is. */
export async function queueRecipients(pool: PoolLike, issueId: string, revision: number, emailHashes: string[], now = new Date()): Promise<number> {
  let added = 0;
  for (const h of emailHashes) {
    const before = await pool.query(
      "SELECT 1 FROM newsletter_deliveries WHERE issue_id = $1 AND revision = $2 AND email_hash = $3",
      [issueId, revision, h],
    );
    if (before.rows.length > 0) continue;
    await pool.query(
      `INSERT INTO newsletter_deliveries (issue_id, revision, email_hash, state, idempotency_key, attempts, updated_at)
       VALUES ($1, $2, $3, 'queued', $4, 0, $5)
       ON CONFLICT (issue_id, revision, email_hash) DO NOTHING`,
      [issueId, revision, h, idempotencyKeyFor(issueId, revision, h), now.toISOString()],
    );
    added++;
  }
  return added;
}

/** Hashes an earlier revision of this issue was accepted or delivered for: who a correction goes to. */
export async function correctionRecipients(pool: PoolLike, issueId: string, revision: number): Promise<Set<string>> {
  const r = await pool.query(
    "SELECT DISTINCT email_hash FROM newsletter_deliveries WHERE issue_id = $1 AND revision < $2 AND state IN ('accepted', 'delivered')",
    [issueId, revision],
  );
  return new Set(r.rows.map((x) => String(x.email_hash)));
}

/**
 * Rows to try in this run: queued ones, plus attempting/unknown ones whose
 * first attempt is still inside the idempotency window (the same key makes
 * the retry safe: the provider answers with the original result if it had
 * accepted it). Older ambiguous rows stay for an operator.
 */
export async function rowsToAttempt(pool: PoolLike, issueId: string, revision: number, now: Date, windowMs: number): Promise<DeliveryRow[]> {
  const cutoff = new Date(now.getTime() - windowMs).toISOString();
  const r = await pool.query(
    `SELECT * FROM newsletter_deliveries
     WHERE issue_id = $1 AND revision = $2
       AND (state = 'queued' OR (state IN ('attempting', 'unknown') AND first_attempt_at >= $3))
     ORDER BY email_hash`,
    [issueId, revision, cutoff],
  );
  return r.rows.map(toDelivery);
}

export async function markAttempting(pool: PoolLike, row: DeliveryRow, now: Date): Promise<void> {
  await pool.query(
    `UPDATE newsletter_deliveries
     SET state = 'attempting', attempts = attempts + 1, first_attempt_at = COALESCE(first_attempt_at, $4), last_attempt_at = $4, updated_at = $4
     WHERE issue_id = $1 AND revision = $2 AND email_hash = $3`,
    [row.issueId, row.revision, row.emailHash, now.toISOString()],
  );
}

export async function markOutcome(
  pool: PoolLike,
  row: Pick<DeliveryRow, "issueId" | "revision" | "emailHash">,
  state: DeliveryState,
  fields: { providerId?: string | null; detail?: string | null },
  now: Date,
): Promise<void> {
  await pool.query(
    `UPDATE newsletter_deliveries
     SET state = $4, provider_id = COALESCE($5, provider_id), detail = $6, updated_at = $7
     WHERE issue_id = $1 AND revision = $2 AND email_hash = $3`,
    [row.issueId, row.revision, row.emailHash, state, fields.providerId ?? null, fields.detail ?? null, now.toISOString()],
  );
}

/** Counts by state for one revision; no addresses. */
export async function issueStats(pool: PoolLike, issueId: string, revision: number): Promise<Record<string, number>> {
  const r = await pool.query(
    "SELECT state, COUNT(*) AS n FROM newsletter_deliveries WHERE issue_id = $1 AND revision = $2 GROUP BY state",
    [issueId, revision],
  );
  const out: Record<string, number> = {};
  for (const row of r.rows) out[String(row.state)] = Number(row.n);
  return out;
}

/**
 * Record a provider event id once. True when this call recorded it, false for
 * a repeat (Resend retries keep the same svix-id, and replays resend it).
 */
export async function recordEventOnce(pool: PoolLike, eventId: string, type: string, now = new Date()): Promise<boolean> {
  await ensureLedger(pool);
  const claim = `${now.toISOString()} ${randomBytes(6).toString("hex")}`;
  await pool.query(
    "INSERT INTO provider_events (event_id, type, claim, received_at) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING",
    [eventId, type, claim, now.toISOString()],
  );
  const r = await pool.query("SELECT claim FROM provider_events WHERE event_id = $1", [eventId]);
  return r.rows[0]?.claim === claim;
}

/**
 * Move the delivery with this provider id. A later or repeated event never
 * walks a row backwards: delivered does not undo failed, and accepted does
 * not undo delivered.
 */
export async function applyDeliveryEvent(
  pool: PoolLike,
  providerId: string,
  to: "delivered" | "failed",
  detail: string | null,
  now = new Date(),
): Promise<number> {
  const from = to === "delivered" ? ["accepted", "attempting", "unknown"] : ["accepted", "attempting", "unknown", "delivered"];
  const r = await pool.query(
    `UPDATE newsletter_deliveries SET state = $2, detail = COALESCE($3, detail), updated_at = $4
     WHERE provider_id = $1 AND state IN (${from.map((_, i) => `$${i + 5}`).join(", ")})`,
    [providerId, to, detail, now.toISOString(), ...from],
  );
  return r.rowCount ?? 0;
}
