// ─── Durable subscriber store (audit M2) ─────────────────────────────────
//
// subscribers.json lives on Replit autoscale's ephemeral disk, so every
// redeploy silently wiped the newsletter list. This store keeps the exact
// load/save semantics the routes already use, but persists to Postgres when
// DATABASE_URL is set (Neon in production). Without it, the JSON file keeps
// working for local dev — visibly, not silently: the admin subscribers
// endpoint reports which backend is live.
//
// On first Postgres boot with an empty table, any rows in the legacy JSON
// file are imported once, so existing signups survive the cutover.

import { Pool } from "pg";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export interface Subscriber {
  email: string;
  subscribedAt: string;
  intent?: string;
  context?: string;
}

export interface SubscriberStore {
  readonly kind: "postgres" | "json";
  load(): Promise<Subscriber[]>;
  save(subs: Subscriber[]): Promise<void>;
}

const DEFAULT_JSON = () => join(process.cwd(), "server", "data", "subscribers.json");

export function jsonStore(file: string = DEFAULT_JSON()): SubscriberStore {
  return {
    kind: "json",
    async load() {
      try {
        if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
      } catch {}
      return [];
    },
    async save(subs) {
      writeFileSync(file, JSON.stringify(subs, null, 2));
    },
  };
}

// Minimal surface of pg.Pool we use — lets tests inject pg-mem's adapter.
export type PoolLike = {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  connect(): Promise<{
    query(text: string, values?: unknown[]): Promise<unknown>;
    release(): void;
  }>;
  end(): Promise<void>;
};

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  subscribed_at TEXT NOT NULL,
  intent TEXT,
  context TEXT
)`;

export function rowToSubscriber(r: Record<string, unknown>): Subscriber {
  const s: Subscriber = {
    email: String(r.email),
    subscribedAt: String(r.subscribed_at),
  };
  if (r.intent != null) s.intent = String(r.intent);
  if (r.context != null) s.context = String(r.context);
  return s;
}

function sslFor(connectionString: string) {
  // Neon (and most hosted Postgres) require TLS; local dev does not.
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  return local ? undefined : { rejectUnauthorized: false };
}

export function postgresStore(
  connectionString: string,
  pool?: PoolLike,
): SubscriberStore & { end(): Promise<void> } {
  const p: PoolLike =
    pool ?? (new Pool({ connectionString, ssl: sslFor(connectionString), max: 3 }) as unknown as PoolLike);
  let ready: Promise<unknown> | null = null;
  const ensure = () => (ready ??= p.query(TABLE_SQL));

  return {
    kind: "postgres",
    async load() {
      await ensure();
      const r = await p.query(
        "SELECT email, subscribed_at, intent, context FROM subscribers ORDER BY subscribed_at, email",
      );
      return r.rows.map(rowToSubscriber);
    },
    // Full-replace inside a transaction. The list is small (at most hundreds)
    // and this keeps every route's read-modify-write semantics identical to
    // the JSON file; the same-shaped race the file always had, not a new one.
    async save(subs) {
      await ensure();
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        await client.query("DELETE FROM subscribers");
        for (const s of subs) {
          await client.query(
            "INSERT INTO subscribers (email, subscribed_at, intent, context) VALUES ($1, $2, $3, $4)",
            [s.email, s.subscribedAt, s.intent ?? null, s.context ?? null],
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        throw e;
      } finally {
        client.release();
      }
    },
    end: () => p.end(),
  };
}

export type StoreOptions = {
  env?: Record<string, string | undefined>;
  jsonFile?: string;
  /** Test seam: build the Postgres store from a connection string. */
  pgFactory?: (url: string) => SubscriberStore;
};

/**
 * Pick the backend once at boot. DATABASE_URL set → Postgres (with a one-time
 * import of legacy JSON rows into an empty table). Unset → the JSON file.
 * A failing Postgres falls back to JSON with a loud log rather than crashing
 * the whole dashboard over its newsletter list; the admin endpoint exposes
 * the live backend so the degradation is observable, never silent.
 */
export async function createSubscriberStore(opts: StoreOptions = {}): Promise<SubscriberStore> {
  const env = opts.env ?? process.env;
  const json = jsonStore(opts.jsonFile);
  const url = env.DATABASE_URL;
  if (!url) return json;
  try {
    const pg = opts.pgFactory ? opts.pgFactory(url) : postgresStore(url);
    const rows = await pg.load(); // also creates the table on first boot
    if (rows.length === 0) {
      const legacy = await json.load();
      if (legacy.length > 0) {
        await pg.save(legacy);
        console.log(
          `[subscriber-store] imported ${legacy.length} legacy subscriber(s) from JSON into Postgres`,
        );
      }
    }
    return pg;
  } catch (e) {
    console.error(
      "[subscriber-store] DATABASE_URL set but Postgres unavailable — falling back to EPHEMERAL JSON:",
      e,
    );
    return json;
  }
}
