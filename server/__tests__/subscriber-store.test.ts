// T17's failure cases for the subscriber store, against pg-mem (an in-memory
// Postgres). pg-mem runs one query at a time, so "concurrent" here means
// interleaved promises on one database; a real two-connection race needs a
// disposable Postgres (see the TEST_DATABASE_URL note at the end).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  chooseStore,
  emailHash,
  jsonDevStore,
  LEGACY_IMPORT_ID,
  postgresStore,
  sslFor,
  tlsProblem,
  type PoolLike,
} from "../subscriber-store";

function freshDb() {
  // A second store on the same database re-runs CREATE TABLE IF NOT EXISTS;
  // pg-mem rejects the skipped constraints unless its AST check is off.
  const db = newDb({ noAstCoverageCheck: true });
  const { Pool } = db.adapters.createPg();
  return { db, pool: () => new Pool() as unknown as PoolLike };
}

const LEGACY = [
  { email: "A@Example.com", subscribedAt: "2026-05-01T12:00:00.000Z" },
  { email: "b@example.com", subscribedAt: "2026-06-01T12:00:00.000Z" },
  { email: "no-date@example.com" },
];

describe("subscriber store (Postgres rules, on pg-mem)", () => {
  it("imports the legacy list once; an opt-out then a restart with the old file does not revive or re-import", async () => {
    const { pool } = freshDb();
    const first = postgresStore(pool());
    const run1 = await first.migrate(LEGACY);
    assert.deepEqual({ ran: run1.ran, imported: run1.imported }, { ran: true, imported: 3 });

    await first.unsubscribe((e) => e === "a@example.com");
    const restarted = postgresStore(pool());
    const run2 = await restarted.migrate(LEGACY);
    assert.equal(run2.ran, false, "the claim is recorded; an import never runs twice");
    const a = (await restarted.listAll()).find((s) => s.email === "a@example.com");
    assert.equal(a?.state, "unsubscribed");
  });

  it("records the import even for an empty source, so a later empty table never re-imports", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    assert.equal((await s.migrate([])).ran, true);
    assert.equal((await s.migrate(LEGACY)).ran, false);
    assert.equal((await s.listAll()).length, 0);
  });

  it("two instances migrating at once commit one import", async () => {
    const { pool } = freshDb();
    const [x, y] = await Promise.all([postgresStore(pool()).migrate(LEGACY), postgresStore(pool()).migrate(LEGACY)]);
    assert.equal([x.ran, y.ran].filter(Boolean).length, 1);
    assert.equal((await postgresStore(pool()).listAll()).length, 3);
  });

  it("two different signups at once both stay active", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    await Promise.all([s.subscribe("one@example.com", {}), s.subscribe("two@example.com", {})]);
    const all = await s.listAll();
    assert.deepEqual(all.map((r) => [r.email, r.state]).sort(), [["one@example.com", "active"], ["two@example.com", "active"]]);
  });

  it("an opt-out wins over a later stale import of the same address", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    await s.subscribe("b@example.com", {});
    await s.unsubscribe((e) => e === "b@example.com");
    await s.erase("b@example.com");
    await s.migrate(LEGACY);
    const b = (await s.listAll()).find((r) => r.email === "b@example.com");
    assert.equal(b, undefined, "the suppression marker keeps the import from reviving an erased address");
  });

  it("a form re-signup does not reactivate a suppressed address", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    await s.subscribe("c@example.com", {});
    await s.unsubscribe((e) => e === "c@example.com");
    const again = await s.subscribe("C@example.com", { context: "hero" });
    assert.equal(again.status, "suppressed");
    await s.suppress("d@example.com", "complained");
    assert.equal((await s.subscribe("d@example.com", {})).status, "suppressed");
  });

  it("the same opt-out twice is idempotent", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    await s.subscribe("e@example.com", {});
    assert.equal((await s.unsubscribe((e) => e === "e@example.com")).status, "unsubscribed");
    assert.equal((await s.unsubscribe((e) => e === "e@example.com")).status, "already");
    assert.equal((await s.unsubscribe(() => false)).status, "not_found");
  });

  it("only active addresses with a recorded signup date are sendable", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    await s.migrate(LEGACY);
    await s.unsubscribe((e) => e === "b@example.com");
    assert.deepEqual((await s.listSendable()).map((r) => r.email), ["a@example.com"]);
  });

  it("a restart on the same database keeps states and suppressions", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    await s.subscribe("f@example.com", {});
    await s.suppress("f@example.com", "bounced");
    const after = postgresStore(pool());
    assert.equal((await after.listAll())[0].state, "bounced");
    assert.equal((await after.subscribe("f@example.com", {})).status, "suppressed");
  });

  it("a database failure during a write rejects; there is no false success", async () => {
    const broken: PoolLike = {
      query: async () => { throw new Error("connection refused"); },
      connect: async () => { throw new Error("connection refused"); },
      end: async () => {},
    };
    const s = postgresStore(broken);
    await assert.rejects(s.subscribe("g@example.com", {}));
    await assert.rejects(s.unsubscribe(() => true));
  });
});

describe("subscriber store recovery and imports", () => {
  it("retries a failed schema setup on the next call instead of failing until a restart", async () => {
    const { pool } = freshDb();
    const real = pool();
    let failNext = true;
    const flaky: PoolLike = {
      query: async (text, values) => {
        if (failNext) {
          failNext = false;
          throw new Error("connection refused");
        }
        return real.query(text, values);
      },
      connect: () => real.connect(),
      end: () => real.end(),
    };
    const s = postgresStore(flaky);
    await assert.rejects(s.subscribe("h@example.com", {}));
    assert.equal((await s.subscribe("h@example.com", {})).status, "subscribed");
  });

  it("a top-up import needs a new id and adds only addresses neither present nor suppressed", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    await s.migrate(LEGACY);
    await s.unsubscribe((e) => e === "a@example.com");
    await s.erase("b@example.com");
    const again = await s.migrate([...LEGACY, { email: "late@example.com", subscribedAt: "2026-09-30T12:00:00.000Z" }]);
    assert.equal(again.ran, false, "the first import id is used up");
    const topUp = await s.migrate(
      [...LEGACY, { email: "late@example.com", subscribedAt: "2026-09-30T12:00:00.000Z" }],
      new Date(),
      "import-live-2026-10-01",
    );
    assert.deepEqual({ ran: topUp.ran, imported: topUp.imported }, { ran: true, imported: 1 });
    const all = await s.listAll();
    assert.equal(all.find((r) => r.email === "a@example.com")?.state, "unsubscribed", "an opt-out is not revived");
    assert.equal(all.find((r) => r.email === "b@example.com"), undefined, "an erased address is not revived");
    assert.equal(all.find((r) => r.email === "late@example.com")?.state, "active");
  });

  it("never imports a row recorded as anything but active", async () => {
    const { pool } = freshDb();
    const s = postgresStore(pool());
    const r = await s.migrate([
      { email: "gone@example.com", subscribedAt: "2026-01-01T00:00:00.000Z", state: "unsubscribed" },
      { email: "kept@example.com", subscribedAt: "2026-01-01T00:00:00.000Z", state: "active" },
      { email: "plain@example.com", subscribedAt: "2026-01-01T00:00:00.000Z", intent: { not: "a string" } },
    ]);
    assert.deepEqual({ imported: r.imported, skipped: r.skipped }, { imported: 2, skipped: 1 });
    const plain = (await s.listAll()).find((x) => x.email === "plain@example.com");
    assert.equal(plain?.intent, undefined, "a non-string intent is not stored");
  });
});

describe("choosing a store", () => {
  it("production without DATABASE_URL refuses instead of using ephemeral JSON", () => {
    const choice = chooseStore({ databaseUrl: undefined, production: true }, () => { throw new Error("not called"); });
    assert.equal(choice.ok, false);
  });

  it("development uses the JSON file unless DATABASE_URL is set", () => {
    const json = chooseStore({ databaseUrl: undefined, production: false }, () => { throw new Error("not called"); }, () => ({ kind: "json-dev" }) as never);
    assert.ok(json.ok && json.store.kind === "json-dev");
    const pg = chooseStore({ databaseUrl: "postgres://u@host/db", production: true }, () => ({ kind: "postgres" }) as never);
    assert.ok(pg.ok && pg.store.kind === "postgres");
  });

  it("refuses a DATABASE_URL whose parameters would weaken TLS to a remote host", () => {
    for (const mode of ["disable", "allow", "prefer", "no-verify"]) {
      const url = `postgres://u:secret@ep-x.neon.tech/db?sslmode=${mode}`;
      assert.match(tlsProblem(url) ?? "", new RegExp(mode));
      const choice = chooseStore({ databaseUrl: url, production: true }, () => { throw new Error("not called"); });
      assert.equal(choice.ok, false, mode);
      assert.ok(!choice.ok && !choice.reason.includes("secret"), "the reason never carries the URL");
    }
    assert.match(tlsProblem("postgres://u@ep-x.neon.tech/db?sslmode=require&uselibpqcompat=true") ?? "", /uselibpqcompat/);
    assert.equal(tlsProblem("postgres://u@ep-x.neon.tech/db?sslmode=require"), null);
    assert.equal(tlsProblem("postgres://u@ep-x.neon.tech/db?sslmode=verify-full"), null);
    assert.equal(tlsProblem("postgres://u@ep-x.neon.tech/db"), null);
    assert.equal(tlsProblem("postgres://u@localhost:5432/db?sslmode=disable"), null, "local databases are not checked");
  });

  it("pins node-postgres: the accepted strings still verify certificates", () => {
    // pg lets the string's sslmode override the ssl option. Under pg 8,
    // require is an alias for verify-full; pg 9 is announced to weaken it.
    // If an upgrade changes that, this fails before production does.
    const require = createRequire(import.meta.url);
    const ConnectionParameters = require("pg/lib/connection-parameters");
    for (const url of [
      "postgres://u:p@ep-x.neon.tech/db",
      "postgres://u:p@ep-x.neon.tech/db?sslmode=require",
      "postgres://u:p@ep-x.neon.tech/db?sslmode=verify-full",
    ]) {
      assert.equal(tlsProblem(url), null);
      const ssl = new ConnectionParameters({ connectionString: url, ssl: sslFor(url) }).ssl;
      assert.ok(ssl && typeof ssl === "object", `${url}: TLS on`);
      assert.notEqual(ssl.rejectUnauthorized, false, `${url}: certificates verified`);
    }
  });

  it("server/routes.ts passes the build-time production flag, not one read off an env object", () => {
    // The deployment runs `node dist/index.cjs` with no NODE_ENV at runtime.
    const routes = readFileSync(new URL("../routes.ts", import.meta.url), "utf8");
    assert.match(routes, /chooseStore\(\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*\{ databaseUrl: process\.env\.DATABASE_URL, production: process\.env\.NODE_ENV === "production" \}/);
  });

  it("remote connections verify certificates; local ones use none", () => {
    assert.deepEqual(sslFor("postgres://u:p@ep-x.us-east-2.aws.neon.tech/db?sslmode=require"), { rejectUnauthorized: true });
    assert.equal(sslFor("postgres://u@localhost:5432/db"), undefined);
    assert.deepEqual(sslFor("not a url"), { rejectUnauthorized: true });
  });
});

describe("JSON development store follows the same rules", () => {
  it("opt-out is remembered, re-signup is suppressed, and the old bare-array file is read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "gt-subs-"));
    const file = join(dir, "subscribers.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, JSON.stringify([{ email: "old@example.com", subscribedAt: "2026-01-01T00:00:00.000Z" }]));
    const s = jsonDevStore(file);
    assert.equal((await s.listAll())[0].consentSource, "site-form-legacy");
    assert.equal((await s.unsubscribe((e) => e === "old@example.com")).status, "unsubscribed");
    assert.equal((await s.subscribe("old@example.com", {})).status, "suppressed");
    assert.equal((await s.erase("old@example.com")).found, true);
    assert.equal((await s.subscribe("old@example.com", {})).status, "suppressed");
    assert.equal(emailHash("OLD@example.com "), emailHash("old@example.com"));
  });
});

// ── A real, disposable Postgres (opt-in) ──────────────────────────────────
//
// pg-mem runs one query at a time, so the races above are interleavings on a
// single database. These run the same races over separate connection pools
// against a real server when TEST_DATABASE_URL points at an EMPTY throwaway
// database (a Neon branch, or a local server), never at production contacts.
// They refuse a database that already has the subscriber tables, and drop
// only the tables they created. Skipped in `npm test` and CI, which have no
// such database.
const REAL_DB = process.env.TEST_DATABASE_URL;

describe("subscriber store on a real, disposable Postgres (TEST_DATABASE_URL)", { skip: !REAL_DB }, () => {
  it("separate instances: one import commits, concurrent signups both stay, schema setup races resolve", async () => {
    const { Pool } = await import("pg");
    const url = REAL_DB as string;
    const mk = () => new Pool({ connectionString: url, ssl: sslFor(url), max: 4 }) as unknown as PoolLike & { end(): Promise<void> };
    const a = mk();
    const b = mk();
    let created = false;
    try {
      const existing = await a.query("SELECT to_regclass('public.subscribers') AS s, to_regclass('public.gt_migrations') AS m");
      if (existing.rows[0].s !== null || existing.rows[0].m !== null) {
        throw new Error("TEST_DATABASE_URL already has subscriber tables; use an empty throwaway database");
      }
      created = true;
      // Two app instances start at once: both create the schema and claim the import.
      const [x, y] = await Promise.all([postgresStore(a).migrate(LEGACY), postgresStore(b).migrate(LEGACY)]);
      assert.equal([x.ran, y.ran].filter(Boolean).length, 1, "exactly one import commits");
      const sa = postgresStore(a);
      const sb = postgresStore(b);
      assert.equal((await sa.listAll()).length, 3);
      // Distinct signups on two instances at once both stay active.
      await Promise.all([sa.subscribe("race-1@example.com", {}), sb.subscribe("race-2@example.com", {})]);
      // The same address on two instances at once ends as one active row.
      await Promise.all([sa.subscribe("same@example.com", {}), sb.subscribe("same@example.com", {})]);
      const all = await sa.listAll();
      assert.equal(all.filter((r) => r.email === "same@example.com").length, 1);
      assert.ok(["race-1@example.com", "race-2@example.com"].every((e) => all.find((r) => r.email === e)?.state === "active"));
      // An opt-out racing a stale top-up import: suppression wins.
      await Promise.all([
        sa.unsubscribe((e) => e === "race-1@example.com"),
        sb.migrate([{ email: "race-1@example.com", subscribedAt: "2026-01-01T00:00:00.000Z" }], new Date(), "race-top-up"),
      ]);
      assert.equal((await sa.listAll()).find((r) => r.email === "race-1@example.com")?.state, "unsubscribed");
    } finally {
      if (created) await a.query("DROP TABLE IF EXISTS subscribers, subscriber_suppressions, gt_migrations");
      await a.end();
      await b.end();
    }
  });
});
