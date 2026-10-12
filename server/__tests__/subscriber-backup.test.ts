// T17's backup and restore: a dump carries states and suppressions, a restore
// goes only into an empty database, and summaries never carry an address.
// Runs on pg-mem (an in-memory Postgres); no real contacts are involved.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { postgresStore, type PoolLike } from "../subscriber-store";
import {
  dumpSubscribers,
  exportPathProblem,
  parseDump,
  readLegacyList,
  restoreSubscribers,
  summarizeDump,
  summarizeLegacy,
} from "../subscriber-backup";

function freshPool(): PoolLike {
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PoolLike;
}

async function seeded() {
  const pool = freshPool();
  const s = postgresStore(pool);
  await s.migrate([
    { email: "a@example.com", subscribedAt: "2026-05-01T12:00:00.000Z" },
    { email: "b@example.com", subscribedAt: "2026-06-01T12:00:00.000Z" },
    { email: "undated@example.com" },
  ]);
  await s.subscribe("c@example.com", { context: "hero" });
  await s.unsubscribe((e) => e === "a@example.com");
  await s.suppress("b@example.com", "bounced");
  await s.erase("erased@example.com");
  return { pool, store: s };
}

describe("dump and restore", () => {
  it("restores counts, states and suppressions into an isolated database, and a restart honors them", async () => {
    const { pool } = await seeded();
    const dump = await dumpSubscribers(pool);
    const target = freshPool();
    const counts = await restoreSubscribers(target, parseDump(JSON.parse(JSON.stringify(dump))));
    assert.deepEqual(counts, { subscribers: 4, suppressions: 3, migrations: 1 });

    // Same contents, compared without exposing an address.
    assert.equal(summarizeDump(await dumpSubscribers(target)).checksum, summarizeDump(dump).checksum);

    // "Restart": a new store on the restored database.
    const restarted = postgresStore(target);
    const all = await restarted.listAll();
    assert.equal(all.find((r) => r.email === "a@example.com")?.state, "unsubscribed");
    assert.equal(all.find((r) => r.email === "b@example.com")?.state, "bounced");
    assert.equal((await restarted.subscribe("a@example.com", {})).status, "suppressed");
    assert.equal((await restarted.subscribe("erased@example.com", {})).status, "suppressed", "the erase marker survives");
    assert.deepEqual((await restarted.listSendable()).map((r) => r.email), ["c@example.com"]);
    // The legacy import claim came across too, so it cannot run again here.
    assert.equal((await restarted.migrate([{ email: "x@example.com", subscribedAt: "2026-01-01T00:00:00.000Z" }])).ran, false);
  });

  it("refuses to restore into a database that already has rows", async () => {
    const { pool } = await seeded();
    const dump = await dumpSubscribers(pool);
    await assert.rejects(restoreSubscribers(pool, dump), /not empty/);
  });

  it("rejects a file that is not a well-formed dump", () => {
    assert.throws(() => parseDump({ subscribers: [] }), /format/);
    const base = { format: "gridtilt-subscribers", version: 1, exportedAt: "x", subscribers: [], suppressions: [], migrations: [] };
    assert.throws(
      () => parseDump({ ...base, subscribers: [{ email: "Upper@Example.com", state: "active", state_changed_at: "x", consent_source: "site-form" }] }),
      /normalized/,
    );
    assert.throws(
      () => parseDump({ ...base, subscribers: [{ email: "a@example.com", state: "paused", state_changed_at: "x", consent_source: "site-form" }] }),
      /state/,
    );
    assert.throws(() => parseDump({ ...base, suppressions: [{ email_hash: "abc", reason: "erased", recorded_at: "x" }] }), /sha256/);
    assert.doesNotThrow(() => parseDump(base));
  });

  it("summarizes with counts and a checksum, never an address", async () => {
    const { pool } = await seeded();
    const summary = summarizeDump(await dumpSubscribers(pool));
    assert.deepEqual(summary.byState, { active: 2, bounced: 1, unsubscribed: 1 });
    assert.equal(summary.sendable, 1, "only the dated, active signup");
    assert.deepEqual(summary.byReason, { bounced: 1, erased: 1, unsubscribed: 1 });
    assert.ok(!JSON.stringify(summary).includes("@"));
  });
});

describe("legacy lists", () => {
  it("reads the old bare array and the admin export, and refuses dumps and the dev store file", () => {
    assert.equal(readLegacyList([{ email: "a@example.com" }]).length, 1);
    assert.equal(readLegacyList({ count: 1, subscribers: [{ email: "a@example.com" }] }).length, 1);
    assert.throws(() => readLegacyList({ subscribers: [], suppressions: {} }), /opt-outs would be lost/);
    assert.throws(() => readLegacyList({ format: "gridtilt-subscribers", subscribers: [] }), /restore/);
    assert.throws(() => readLegacyList({ nope: true }), /not a subscriber list/);
  });

  it("counts what an import would see; the checksum ignores order and case", () => {
    const rows = [
      { email: "A@example.com", subscribedAt: "2026-01-01T00:00:00.000Z" },
      { email: "a@example.com" },
      { email: "b@example.com", state: "unsubscribed" },
      { email: "not-an-address" },
      { email: "c@example.com", subscribedAt: "garbage" },
    ];
    const s = summarizeLegacy(rows);
    assert.deepEqual(
      { rows: s.rows, addresses: s.addresses, duplicates: s.duplicates, invalid: s.invalid, withSignupDate: s.withSignupDate, notActive: s.notActive },
      { rows: 5, addresses: 3, duplicates: 1, invalid: 1, withSignupDate: 1, notActive: 1 },
    );
    const reordered = summarizeLegacy([rows[4], rows[2], rows[0]]);
    assert.equal(reordered.checksum, s.checksum);
    assert.ok(!JSON.stringify(s).includes("@"));
  });
});

describe("exportPathProblem", () => {
  const repo = "/Users/x/GridTilt";
  it("refuses the repository and evidence folders, allows a private location", () => {
    assert.match(exportPathProblem("/Users/x/GridTilt/backup.json", repo) ?? "", /repository/);
    assert.match(exportPathProblem("/Users/x/GridTilt", repo) ?? "", /repository/);
    assert.match(exportPathProblem("/Users/x/Documents/GTM/evidence/subs.json", repo) ?? "", /evidence/);
    assert.equal(exportPathProblem("/Users/x/Private/gridtilt-subscribers-2026-10-01.json", repo), null);
    assert.equal(exportPathProblem("/Users/x/GridTilt-backups/subs.json", repo), null, "a sibling folder is outside the repo");
  });
});
