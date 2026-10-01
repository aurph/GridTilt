// ─── Durable subscriber store (audit M2, T17) ───────────────────────────────
//
// subscribers.json lives on Replit autoscale's ephemeral disk, so a redeploy
// can wipe the list, and an unsubscribe deleted the row, so nothing
// remembered the opt-out. This store keeps one row per address with a state,
// writes row by row, and never forgets a suppression.
//
// Rules:
// - A write either reaches durable storage or rejects. Production has no JSON
//   fallback: without DATABASE_URL, or with Postgres down, a signup gets a
//   clear retryable error, never a success backed by ephemeral disk.
// - States: active | unsubscribed | bounced | complained. Nothing but an
//   explicit, user-initiated reconfirmation (not built) turns a suppressed
//   address back to active; a form re-signup reports "suppressed" instead.
// - An admin deletion removes the personal data but keeps a hashed
//   suppression marker, so a historical import cannot revive the address.
// - A legacy import is an explicit operator step (scripts/subscribers.ts),
//   never an automatic boot action: each import ID is claimed once, atomically,
//   through a migrations table, and an empty table later never means "import
//   again". Suppression wins over imported rows, and rows that were not
//   active in the source are not imported as active.
// - Remote TLS certificates are verified.

import { createHash, randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export type SubscriptionState = "active" | "unsubscribed" | "bounced" | "complained";
export type WriteResult = { persisted: true };

export interface SubscriberRecord {
  email: string;
  state: SubscriptionState;
  /** When the address signed up through the site form (the recorded consent). */
  subscribedAt: string | null;
  stateChangedAt: string;
  /** Where the consent came from: "site-form", or "site-form-legacy" for imported rows. */
  consentSource: string;
  intent?: string;
  context?: string;
}

export interface SubscriberStore {
  readonly kind: "postgres" | "json-dev";
  subscribe(
    email: string,
    fields: { intent?: string | null; context?: string | null },
    now?: Date,
  ): Promise<WriteResult & { status: "subscribed" | "exists" | "suppressed" }>;
  /** Opt out the address whose token matches; idempotent. */
  unsubscribe(
    matches: (email: string) => boolean,
    now?: Date,
  ): Promise<WriteResult & { status: "unsubscribed" | "already" | "not_found" }>;
  /** Mark a delivery outcome from the provider (bounce or complaint). */
  suppress(email: string, state: "bounced" | "complained", now?: Date): Promise<WriteResult>;
  /** Admin retention deletion: personal data removed, a hashed marker kept. */
  erase(email: string): Promise<WriteResult & { found: boolean }>;
  /** Addresses that may receive a send: active, with a recorded consent date. */
  listSendable(): Promise<SubscriberRecord[]>;
  listAll(): Promise<SubscriberRecord[]>;
  end?(): Promise<void>;
}

export class StoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function emailHash(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

// ─── Postgres ────────────────────────────────────────────────────────────────

/** The slice of pg.Pool this store uses; tests inject pg-mem's adapter. */
export type PoolLike = {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  connect(): Promise<{
    query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
    release(): void;
  }>;
  end(): Promise<void>;
};

const SCHEMA_SQL = [
  `CREATE TABLE IF NOT EXISTS subscribers (
    email TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    subscribed_at TEXT,
    state_changed_at TEXT NOT NULL,
    consent_source TEXT NOT NULL,
    intent TEXT,
    context TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS subscriber_suppressions (
    email_hash TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    recorded_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS gt_migrations (
    id TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL,
    detail TEXT
  )`,
];

export const LEGACY_IMPORT_ID = "import-subscribers-json-v1";

function toRecord(r: Record<string, unknown>): SubscriberRecord {
  const rec: SubscriberRecord = {
    email: String(r.email),
    state: String(r.state) as SubscriptionState,
    subscribedAt: r.subscribed_at == null ? null : String(r.subscribed_at),
    stateChangedAt: String(r.state_changed_at),
    consentSource: String(r.consent_source),
  };
  if (r.intent != null) rec.intent = String(r.intent);
  if (r.context != null) rec.context = String(r.context);
  return rec;
}

/**
 * TLS for a connection string: verified certificates for any remote host
 * (Neon serves publicly trusted ones); none for a local database.
 */
export function sslFor(connectionString: string): undefined | { rejectUnauthorized: true } {
  let host = "";
  try {
    host = new URL(connectionString).hostname;
  } catch {
    /* unparseable: treat as remote, verified */
  }
  return isLocalHost(host) ? undefined : { rejectUnauthorized: true };
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

/**
 * Why a connection string would weaken TLS to a remote database, or null.
 * node-postgres lets the string's parameters override the ssl option passed
 * beside it: sslmode=disable sends plaintext, sslmode=no-verify accepts any
 * certificate, and uselibpqcompat=true turns sslmode=require into "encrypt,
 * do not verify". Those are refused rather than silently used.
 */
export function tlsProblem(connectionString: string): string | null {
  let u: URL;
  try {
    u = new URL(connectionString);
  } catch {
    return "DATABASE_URL is not a valid URL";
  }
  if (isLocalHost(u.hostname)) return null;
  const mode = (u.searchParams.get("sslmode") ?? "").toLowerCase();
  if (mode === "disable" || mode === "allow" || mode === "prefer" || mode === "no-verify") {
    return `sslmode=${mode} could skip certificate verification; use sslmode=verify-full (or require)`;
  }
  const libpq = (u.searchParams.get("uselibpqcompat") ?? "").toLowerCase() === "true";
  if (libpq && mode !== "verify-full") {
    return "uselibpqcompat=true without sslmode=verify-full skips certificate verification";
  }
  return null;
}

/** Create the tables if missing. Safe to run repeatedly. */
export async function ensureSchema(pool: Pick<PoolLike, "query">): Promise<void> {
  for (const sql of SCHEMA_SQL) {
    try {
      await pool.query(sql);
    } catch (e) {
      // Two instances creating the same table at once: Postgres can fail the
      // loser with a duplicate type (23505) or table (42P07) even under IF NOT
      // EXISTS. The table exists either way.
      const code = (e as { code?: string }).code;
      if (code !== "23505" && code !== "42P07") throw e;
    }
  }
}

export function postgresStore(
  pool: PoolLike,
): SubscriberStore & { migrate(legacy: LegacyRow[], now?: Date, importId?: string): Promise<ImportResult> } {
  let ready: Promise<void> | null = null;
  // A failed setup (database down at the first request) is not remembered:
  // the next call tries again instead of failing until a restart.
  const ensure = () =>
    (ready ??= ensureSchema(pool).catch((e) => {
      ready = null;
      throw e;
    }));

  async function suppressed(email: string): Promise<boolean> {
    const r = await pool.query("SELECT 1 FROM subscriber_suppressions WHERE email_hash = $1", [emailHash(email)]);
    return r.rows.length > 0;
  }

  const store = {
    kind: "postgres" as const,

    async subscribe(rawEmail: string, fields: { intent?: string | null; context?: string | null }, now = new Date()) {
      await ensure();
      const email = normalizeEmail(rawEmail);
      if (await suppressed(email)) return { persisted: true as const, status: "suppressed" as const };
      const existing = await pool.query("SELECT state, intent FROM subscribers WHERE email = $1", [email]);
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (row.state !== "active") return { persisted: true as const, status: "suppressed" as const };
        // Keep a prior intent; refresh the context (the latest surface is the useful tag).
        await pool.query(
          "UPDATE subscribers SET intent = COALESCE(intent, $2), context = COALESCE($3, context) WHERE email = $1 AND state = 'active'",
          [email, fields.intent ?? null, fields.context ?? null],
        );
        return { persisted: true as const, status: "exists" as const };
      }
      const ts = now.toISOString();
      // ON CONFLICT: two signups racing for one address both end as one active row.
      await pool.query(
        `INSERT INTO subscribers (email, state, subscribed_at, state_changed_at, consent_source, intent, context)
         VALUES ($1, 'active', $2, $2, 'site-form', $3, $4)
         ON CONFLICT (email) DO NOTHING`,
        [email, ts, fields.intent ?? null, fields.context ?? null],
      );
      return { persisted: true as const, status: "subscribed" as const };
    },

    async unsubscribe(matches: (email: string) => boolean, now = new Date()) {
      await ensure();
      const r = await pool.query("SELECT email, state FROM subscribers");
      const hit = r.rows.find((row) => matches(String(row.email)));
      if (!hit) return { persisted: true as const, status: "not_found" as const };
      const email = String(hit.email);
      const ts = now.toISOString();
      await pool.query(
        `INSERT INTO subscriber_suppressions (email_hash, reason, recorded_at) VALUES ($1, 'unsubscribed', $2)
         ON CONFLICT (email_hash) DO NOTHING`,
        [emailHash(email), ts],
      );
      if (hit.state === "unsubscribed") return { persisted: true as const, status: "already" as const };
      await pool.query(
        "UPDATE subscribers SET state = 'unsubscribed', state_changed_at = $2 WHERE email = $1 AND state = 'active'",
        [email, ts],
      );
      return { persisted: true as const, status: "unsubscribed" as const };
    },

    async suppress(rawEmail: string, state: "bounced" | "complained", now = new Date()) {
      await ensure();
      const email = normalizeEmail(rawEmail);
      const ts = now.toISOString();
      await pool.query(
        `INSERT INTO subscriber_suppressions (email_hash, reason, recorded_at) VALUES ($1, $2, $3)
         ON CONFLICT (email_hash) DO NOTHING`,
        [emailHash(email), state, ts],
      );
      await pool.query("UPDATE subscribers SET state = $2, state_changed_at = $3 WHERE email = $1", [email, state, ts]);
      return { persisted: true as const };
    },

    async erase(rawEmail: string) {
      await ensure();
      const email = normalizeEmail(rawEmail);
      await pool.query(
        `INSERT INTO subscriber_suppressions (email_hash, reason, recorded_at) VALUES ($1, 'erased', $2)
         ON CONFLICT (email_hash) DO NOTHING`,
        [emailHash(email), new Date().toISOString()],
      );
      const r = await pool.query("DELETE FROM subscribers WHERE email = $1", [email]);
      return { persisted: true as const, found: (r.rowCount ?? 0) > 0 };
    },

    async listSendable() {
      await ensure();
      const r = await pool.query(
        "SELECT * FROM subscribers WHERE state = 'active' AND subscribed_at IS NOT NULL ORDER BY subscribed_at, email",
      );
      return r.rows.map(toRecord);
    },

    async listAll() {
      await ensure();
      const r = await pool.query("SELECT * FROM subscribers ORDER BY subscribed_at, email");
      return r.rows.map(toRecord);
    },

    /**
     * Import a legacy list once per import ID. The claim row and the imported
     * rows commit together: a second run with the same ID (another instance,
     * or the operator again) finds the claim taken and imports nothing.
     * Recorded even for an empty source, so a later empty table never
     * re-imports. A later top-up needs a new, explicit ID, and it can only add
     * addresses that are neither present nor suppressed.
     */
    async migrate(legacy: LegacyRow[], now = new Date(), importId = LEGACY_IMPORT_ID): Promise<ImportResult> {
      await ensure();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Claim with a token and read it back: the instance that finds its own
        // token owns the import. On Postgres the unique key makes a racing
        // insert wait for the first transaction, then skip. (RETURNING after
        // DO NOTHING is not relied on; test doubles disagree about it.)
        const token = `${now.toISOString()} ${randomBytes(8).toString("hex")} legacy rows seen: ${legacy.length}`;
        await client.query(
          `INSERT INTO gt_migrations (id, completed_at, detail) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [importId, now.toISOString(), token],
        );
        const owner = await client.query("SELECT detail FROM gt_migrations WHERE id = $1", [importId]);
        if (owner.rows[0]?.detail !== token) {
          await client.query("ROLLBACK");
          return { ran: false, imported: 0, skipped: 0 };
        }
        let imported = 0;
        let skipped = 0;
        for (const row of legacy) {
          const email = typeof row.email === "string" ? normalizeEmail(row.email) : "";
          if (!email.includes("@")) {
            skipped++;
            continue;
          }
          // A row that records a state other than active (an export from the
          // new store, or the dev file) is never imported as a subscription.
          if (row.state !== undefined && row.state !== "active") {
            skipped++;
            continue;
          }
          const sup = await client.query("SELECT 1 FROM subscriber_suppressions WHERE email_hash = $1", [emailHash(email)]);
          if (sup.rows.length > 0) {
            skipped++;
            continue;
          }
          const present = await client.query("SELECT 1 FROM subscribers WHERE email = $1", [email]);
          if (present.rows.length > 0) {
            skipped++;
            continue;
          }
          // A row without its signup date stays out of sends (subscribed_at null).
          const consentAt = typeof row.subscribedAt === "string" && !Number.isNaN(Date.parse(row.subscribedAt)) ? row.subscribedAt : null;
          await client.query(
            `INSERT INTO subscribers (email, state, subscribed_at, state_changed_at, consent_source, intent, context)
             VALUES ($1, 'active', $2, $3, 'site-form-legacy', $4, $5)
             ON CONFLICT (email) DO NOTHING`,
            [
              email,
              consentAt,
              now.toISOString(),
              typeof row.intent === "string" && row.intent.trim() ? row.intent.trim().slice(0, 500) : null,
              typeof row.context === "string" && row.context.trim() ? row.context.trim().slice(0, 64) : null,
            ],
          );
          imported++;
        }
        await client.query("COMMIT");
        return { ran: true, imported, skipped };
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
    },

    end: () => pool.end(),
  };
  return store;
}

export interface LegacyRow {
  email?: unknown;
  subscribedAt?: unknown;
  state?: unknown;
  intent?: unknown;
  context?: unknown;
}

export interface ImportResult {
  ran: boolean;
  imported: number;
  skipped: number;
}

// ─── JSON (development and tests only) ─────────────────────────────────────────

interface JsonFile {
  subscribers: SubscriberRecord[];
  suppressions: Record<string, string>;
}

function readJson(file: string): JsonFile {
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      // The old file was a bare array of {email, subscribedAt}.
      if (Array.isArray(parsed)) {
        return {
          subscribers: parsed
            .filter((r) => r && typeof r.email === "string")
            .map((r) => ({
              email: normalizeEmail(r.email),
              state: "active" as const,
              subscribedAt: typeof r.subscribedAt === "string" ? r.subscribedAt : null,
              stateChangedAt: typeof r.subscribedAt === "string" ? r.subscribedAt : new Date(0).toISOString(),
              consentSource: "site-form-legacy",
              ...(r.intent ? { intent: r.intent } : {}),
              ...(r.context ? { context: r.context } : {}),
            })),
          suppressions: {},
        };
      }
      return { subscribers: parsed.subscribers ?? [], suppressions: parsed.suppressions ?? {} };
    }
  } catch {
    /* unreadable file reads as empty in development */
  }
  return { subscribers: [], suppressions: {} };
}

/** Development and test only: a local file with the same rules as Postgres. */
export function jsonDevStore(file: string = join(process.cwd(), "server", "data", "subscribers.json")): SubscriberStore {
  const write = (data: JsonFile) => writeFileSync(file, JSON.stringify(data, null, 2));
  return {
    kind: "json-dev",
    async subscribe(rawEmail, fields, now = new Date()) {
      const data = readJson(file);
      const email = normalizeEmail(rawEmail);
      if (data.suppressions[emailHash(email)]) return { persisted: true, status: "suppressed" };
      const existing = data.subscribers.find((s) => s.email === email);
      if (existing) {
        if (existing.state !== "active") return { persisted: true, status: "suppressed" };
        if (fields.intent && !existing.intent) existing.intent = fields.intent;
        if (fields.context) existing.context = fields.context;
        write(data);
        return { persisted: true, status: "exists" };
      }
      const ts = now.toISOString();
      data.subscribers.push({
        email,
        state: "active",
        subscribedAt: ts,
        stateChangedAt: ts,
        consentSource: "site-form",
        ...(fields.intent ? { intent: fields.intent } : {}),
        ...(fields.context ? { context: fields.context } : {}),
      });
      write(data);
      return { persisted: true, status: "subscribed" };
    },
    async unsubscribe(matches, now = new Date()) {
      const data = readJson(file);
      const hit = data.subscribers.find((s) => matches(s.email));
      if (!hit) return { persisted: true, status: "not_found" };
      data.suppressions[emailHash(hit.email)] ??= "unsubscribed";
      if (hit.state === "unsubscribed") {
        write(data);
        return { persisted: true, status: "already" };
      }
      hit.state = "unsubscribed";
      hit.stateChangedAt = now.toISOString();
      write(data);
      return { persisted: true, status: "unsubscribed" };
    },
    async suppress(rawEmail, state, now = new Date()) {
      const data = readJson(file);
      const email = normalizeEmail(rawEmail);
      data.suppressions[emailHash(email)] ??= state;
      const hit = data.subscribers.find((s) => s.email === email);
      if (hit) {
        hit.state = state;
        hit.stateChangedAt = now.toISOString();
      }
      write(data);
      return { persisted: true };
    },
    async erase(rawEmail) {
      const data = readJson(file);
      const email = normalizeEmail(rawEmail);
      data.suppressions[emailHash(email)] ??= "erased";
      const before = data.subscribers.length;
      data.subscribers = data.subscribers.filter((s) => s.email !== email);
      write(data);
      return { persisted: true, found: data.subscribers.length < before };
    },
    async listSendable() {
      return readJson(file).subscribers.filter((s) => s.state === "active" && s.subscribedAt !== null);
    },
    async listAll() {
      return readJson(file).subscribers;
    },
  };
}

// ─── Choosing a store ───────────────────────────────────────────────────────────

export type StoreChoice =
  | { ok: true; store: SubscriberStore }
  | { ok: false; reason: string };

/**
 * Production must have DATABASE_URL: the local file sits on ephemeral disk,
 * and a success backed by it would be a false one. Development and tests use
 * the JSON file unless DATABASE_URL is set.
 *
 * `production` is passed in, not read from an env object: the deployment runs
 * `node dist/index.cjs` with no NODE_ENV at runtime, and only the literal
 * `process.env.NODE_ENV` is replaced at build time (script/build.ts). The
 * caller computes it from that literal, as server/index.ts does.
 */
export function chooseStore(
  config: { databaseUrl: string | undefined; production: boolean },
  makePostgres: (url: string) => SubscriberStore,
  makeJson: () => SubscriberStore = () => jsonDevStore(),
): StoreChoice {
  const url = config.databaseUrl;
  if (url) {
    const problem = tlsProblem(url);
    // The reason names the parameter, never the URL (it carries the password).
    if (problem) return { ok: false, reason: `DATABASE_URL refused: ${problem}. Signups are unavailable until it is fixed.` };
    return { ok: true, store: makePostgres(url) };
  }
  if (config.production) {
    return { ok: false, reason: "DATABASE_URL is not set; signups are unavailable until durable storage is configured." };
  }
  return { ok: true, store: makeJson() };
}
