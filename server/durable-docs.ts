// ─── Durable machine-written logs (Postgres mirror) ─────────────────────────
//
// Replit autoscale runs on an ephemeral disk: every redeploy resets the
// machine-written JSON in server/data to the committed copy, so recorded
// history (the daily index points, recorded GPU prices, the social post log,
// the backlog update log) was lost on each deploy. With DATABASE_URL set,
// these append-only files are mirrored into one table, gt_documents:
//
//   - at boot, each file is merged with the database copy and both sides are
//     brought up to the union (hydrate);
//   - after each write, the writer calls notifyDocWritten(name) and the file
//     is merged into the database inside a transaction, so two instances
//     appending at once keep both appends (mirror).
//
// Merges are unions keyed by date or timestamp, so neither side can drop a
// row. Curated or admin-edited files (deals, clusters, articles,
// datacenters) are NOT mirrored: a database copy would override edits made
// in the repo, and deletions would need tombstones.

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export type Json = any;

export interface DocDef {
  name: string;
  /** Rows of the document. */
  items(root: Json): Json[];
  /** A root holding these rows (keeps the rest of `base`). */
  withItems(base: Json, items: Json[]): Json;
  key(item: Json): string | null;
  sortKey(item: Json): string;
  /** Applied after the union (dedupe rules, size caps). */
  finish?(items: Json[]): Json[];
  /** File formatting, matching the writer's. */
  serialize(root: Json): string;
  empty(): Json;
}

const pretty = (x: Json) => JSON.stringify(x, null, 2) + "\n";

export const DOCS: DocDef[] = [
  {
    name: "index-history.json",
    items: (r) => (Array.isArray(r?.days) ? r.days : []),
    withItems: (base, items) => ({ ...(base ?? {}), days: items }),
    key: (d) => (typeof d?.date === "string" ? d.date : null),
    sortKey: (d) => d.date,
    serialize: pretty,
    empty: () => ({ days: [] }),
  },
  {
    name: "gpu-price-history.json",
    items: (r) => (Array.isArray(r) ? r : []),
    withItems: (_b, items) => items,
    key: (s) => (typeof s?.date === "string" ? `${s.date}|${s.source ?? ""}` : null),
    sortKey: (s) => s.date,
    // Same rule as the recorder: a live row supersedes a same-day legacy row.
    finish: (items) => {
      const liveDays = new Set(items.filter((s) => s.source === "live").map((s) => s.date));
      return items.filter((s) => s.source === "live" || !liveDays.has(s.date));
    },
    serialize: pretty,
    empty: () => [],
  },
  {
    name: "social-log.json",
    items: (r) => (Array.isArray(r) ? r : []),
    withItems: (_b, items) => items,
    key: (e) => (typeof e?.timestamp === "string" ? `${e.timestamp}|${e.platform ?? ""}|${e.template ?? ""}|${e.trigger ?? ""}` : null),
    sortKey: (e) => e.timestamp,
    finish: (items) => items.slice(-500),
    serialize: (x) => JSON.stringify(x, null, 2),
    empty: () => [],
  },
  {
    name: "backlog-auto-updates.json",
    items: (r) => (Array.isArray(r) ? r : []),
    withItems: (_b, items) => items,
    key: (e) => (typeof e?.timestamp === "string" ? `${e.timestamp}|${e.field ?? ""}|${e.pattern ?? ""}` : null),
    sortKey: (e) => e.timestamp,
    finish: (items) => items.slice(-500),
    serialize: pretty,
    empty: () => [],
  },
];

export function docDef(name: string): DocDef | undefined {
  return DOCS.find((d) => d.name === name);
}

/**
 * Union of two copies of a document. Rows are matched by key; on a match the
 * `preferred` copy's row wins. Rows without a key are kept from both sides
 * (deduplicated by content). The non-row parts come from `preferred` when it
 * exists.
 */
export function mergeDoc(def: DocDef, other: Json | null, preferred: Json | null): Json {
  if (other == null && preferred == null) return def.empty();
  const byKey = new Map<string, Json>();
  const loose = new Map<string, Json>();
  for (const src of [other, preferred]) {
    if (src == null) continue;
    for (const item of def.items(src)) {
      const k = def.key(item);
      if (k === null) loose.set(JSON.stringify(item), item);
      else byKey.set(k, item);
    }
  }
  let items = Array.from(byKey.values()).sort((a, b) => {
    const x = def.sortKey(a);
    const y = def.sortKey(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  items = [...Array.from(loose.values()), ...items];
  if (def.finish) items = def.finish(items);
  return def.withItems(preferred ?? other, items);
}

// ─── Postgres side ──────────────────────────────────────────────────────────
// Concurrency: each row carries a version. A writer reads body + version,
// merges, and updates only if the version is unchanged; otherwise it reads
// again and re-merges. Two instances appending at once both land.

export type QueryLike = {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

const SCHEMA = `CREATE TABLE IF NOT EXISTS gt_documents (
  name TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
)`;

async function ensureTable(pool: QueryLike): Promise<void> {
  const exists = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'gt_documents'");
  if (exists.rows.length) return;
  try {
    await pool.query(SCHEMA);
  } catch (e) {
    // Two instances creating it at once: the loser can see 23505 or 42P07.
    const code = (e as { code?: string }).code;
    if (code !== "23505" && code !== "42P07") throw e;
  }
}

async function readRow(q: QueryLike, name: string): Promise<{ body: Json | null; version: number } | null> {
  const r = await q.query("SELECT body, version FROM gt_documents WHERE name = $1", [name]);
  if (!r.rows.length) return null;
  let body: Json | null = null;
  try {
    body = JSON.parse(String(r.rows[0].body));
  } catch {}
  return { body, version: Number(r.rows[0].version) };
}

const MAX_ATTEMPTS = 6;

/**
 * Merge `incoming` into the stored copy and return what is stored after.
 * `incomingWins` decides which side's row wins a key clash.
 */
async function mergeIntoDb(q: QueryLike, def: DocDef, incoming: Json | null, incomingWins: boolean): Promise<Json> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const row = await readRow(q, def.name);
    const stored = row?.body ?? null;
    const merged = incomingWins ? mergeDoc(def, stored, incoming) : mergeDoc(def, incoming, stored);
    const now = new Date().toISOString();
    if (!row) {
      const r = await q.query(
        "INSERT INTO gt_documents (name, body, version, updated_at) VALUES ($1, $2, 1, $3) ON CONFLICT (name) DO NOTHING",
        [def.name, JSON.stringify(merged), now],
      );
      if ((r.rowCount ?? 0) === 1) return merged;
      continue; // another instance inserted first; merge with theirs
    }
    if (JSON.stringify(stored) === JSON.stringify(merged)) return merged;
    const r = await q.query(
      "UPDATE gt_documents SET body = $2, version = version + 1, updated_at = $3 WHERE name = $1 AND version = $4",
      [def.name, JSON.stringify(merged), now, row.version],
    );
    if ((r.rowCount ?? 0) === 1) return merged;
  }
  throw new Error(`gt_documents: ${def.name} kept changing underneath ${MAX_ATTEMPTS} merges`);
}

function readFileDoc(path: string): Json | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export interface DurableDocs {
  /** Merge every file with its database copy; both sides end at the union. */
  hydrate(): Promise<Array<{ name: string; fileRows: number; dbRows: number; mergedRows: number }>>;
  /** Merge one file into the database (call after writing it). */
  mirror(name: string): Promise<void>;
}

export function durableDocs(pool: QueryLike, dir = join(process.cwd(), "server", "data"), docs: DocDef[] = DOCS): DurableDocs {
  let ready: Promise<void> | null = null;
  const ensure = () =>
    (ready ??= ensureTable(pool).catch((e) => {
      ready = null;
      throw e;
    }));

  return {
    async hydrate() {
      await ensure();
      const report = [];
      for (const def of docs) {
        const path = join(dir, def.name);
        const file = readFileDoc(path);
        const before = await readRow(pool, def.name);
        // The database is the longer-lived copy, so its rows win a key clash.
        const merged = await mergeIntoDb(pool, def, file, false);
        const text = def.serialize(merged);
        if (file === null || def.serialize(file) !== text) writeFileSync(path, text, "utf-8");
        report.push({
          name: def.name,
          fileRows: file ? def.items(file).length : 0,
          dbRows: before?.body ? def.items(before.body).length : 0,
          mergedRows: def.items(merged).length,
        });
      }
      return report;
    },

    async mirror(name) {
      const def = docs.find((d) => d.name === name);
      if (!def) return;
      await ensure();
      const file = readFileDoc(join(dir, def.name));
      if (file === null) return;
      // The file holds this instance's newest write, so its rows win here.
      await mergeIntoDb(pool, def, file, true);
    },
  };
}

// ─── Write notification ─────────────────────────────────────────────────────
// Writers call notifyDocWritten after writing a mirrored file. With no
// database configured (development, tests) nothing is registered and the
// call does nothing.

let active: DurableDocs | null = null;

export function setActiveDurableDocs(d: DurableDocs | null): void {
  active = d;
}

export function notifyDocWritten(name: string): void {
  if (!active) return;
  active.mirror(name).catch((e) => console.error(`[durable] mirror of ${name} failed:`, e instanceof Error ? e.message : e));
}
