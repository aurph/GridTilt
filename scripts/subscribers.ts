// Subscriber backup, restore and legacy import, for the operator. Output is
// counts and checksums only; no address is printed.
//
// Run:
//   npx tsx scripts/subscribers.ts summary <file>                                  (no database)
//   npx tsx scripts/subscribers.ts import-legacy <file> [--id <import-id>] [--dry-run]
//   npx tsx scripts/subscribers.ts export <out-file>
//   npx tsx scripts/subscribers.ts restore <dump-file>
//
// import-legacy, export and restore use DATABASE_URL. Export files hold
// personal data: they are written with owner-only permissions, never inside
// this repository, and belong in a private, access-restricted location.
// Restore refuses a database that already has rows.

import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import {
  dumpSubscribers,
  exportPathProblem,
  parseDump,
  readLegacyList,
  restoreSubscribers,
  summarizeDump,
  summarizeLegacy,
} from "../server/subscriber-backup.js";
import { LEGACY_IMPORT_ID, postgresStore, sslFor, tlsProblem, type PoolLike } from "../server/subscriber-store.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message: string): never {
  console.error(`subscribers: ${message}`);
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function readJson(path: string | undefined): unknown {
  if (!path) fail("a file path is required");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`could not read ${path}: ${(e as Error).message}`);
  }
}

function openPool(): { pool: PoolLike & { end(): Promise<void> }; target: string } {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_URL is not set");
  // Same rule as the server: a string that would skip certificate checks to a
  // remote host is refused, not used.
  const problem = tlsProblem(url);
  if (problem) fail(`DATABASE_URL refused: ${problem}`);
  let target = "(unparseable URL)";
  try {
    const u = new URL(url);
    target = `${u.hostname}${u.pathname}`; // no user or password
  } catch {
    /* keep the placeholder */
  }
  const pool = new Pool({ connectionString: url, ssl: sslFor(url), max: 1 });
  pool.on("error", (e) => console.error("subscribers: idle connection error:", e.message));
  return { pool: pool as unknown as PoolLike & { end(): Promise<void> }, target };
}

async function main() {
  const [command, file, ...rest] = process.argv.slice(2);

  if (command === "summary") {
    const value = readJson(file) as { format?: unknown };
    if (value && value.format === "gridtilt-subscribers") {
      console.log(JSON.stringify({ kind: "dump", ...summarizeDump(parseDump(value)) }, null, 2));
    } else {
      console.log(JSON.stringify({ kind: "legacy list", ...summarizeLegacy(readLegacyList(value)) }, null, 2));
    }
    return;
  }

  if (command === "import-legacy") {
    const rows = readLegacyList(readJson(file));
    console.log(JSON.stringify({ source: summarizeLegacy(rows) }, null, 2));
    if (rest.includes("--dry-run")) {
      console.log("dry run: nothing written");
      return;
    }
    const importId = flag(rest, "--id") ?? LEGACY_IMPORT_ID;
    const { pool, target } = openPool();
    try {
      console.log(`target: ${target}, import id: ${importId}`);
      const result = await postgresStore(pool).migrate(rows as never, new Date(), importId);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ran) console.log("this import id was already used; nothing imported. A top-up needs a new --id.");
    } finally {
      await pool.end();
    }
    return;
  }

  if (command === "export") {
    if (!file) fail("an output path is required");
    const out = resolve(file);
    const problem = exportPathProblem(out, REPO_ROOT);
    if (problem) fail(problem);
    const { pool, target } = openPool();
    try {
      console.log(`target: ${target}`);
      const dump = await dumpSubscribers(pool);
      // "wx": never overwrite an existing file; 0600: owner-only.
      writeFileSync(out, JSON.stringify(dump, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      console.log(JSON.stringify({ wrote: out, ...summarizeDump(dump) }, null, 2));
    } finally {
      await pool.end();
    }
    return;
  }

  if (command === "restore") {
    const dump = parseDump(readJson(file));
    const { pool, target } = openPool();
    try {
      console.log(`target: ${target}`);
      const counts = await restoreSubscribers(pool, dump);
      const expected = summarizeDump(dump).checksum;
      const actual = summarizeDump(await dumpSubscribers(pool)).checksum;
      console.log(JSON.stringify({ restored: counts, checksumMatches: expected === actual, checksum: actual }, null, 2));
      if (expected !== actual) fail("the restored database does not match the dump");
    } finally {
      await pool.end();
    }
    return;
  }

  fail("usage: summary | import-legacy | export | restore (see the header of scripts/subscribers.ts)");
}

main().catch((e) => fail((e as Error).message));
