// Durable subscriber store (audit M2): the JSON backend keeps the legacy
// semantics, the Postgres backend is exercised against pg-mem (a real SQL
// engine, not a stub), and backend selection covers the migration and the
// loud-fallback path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDb } from "pg-mem";
import {
  jsonStore,
  postgresStore,
  createSubscriberStore,
  rowToSubscriber,
  type PoolLike,
  type Subscriber,
} from "../subscriber-store";

const SUBS: Subscriber[] = [
  { email: "a@x.com", subscribedAt: "2026-01-01T00:00:00.000Z", intent: "watchlist", context: "home" },
  { email: "b@x.com", subscribedAt: "2026-02-01T00:00:00.000Z" },
];

function memPool(): PoolLike {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as PoolLike;
}

test("jsonStore: missing file loads empty; round-trips; corrupt file loads empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "substore-"));
  const file = join(dir, "subs.json");
  const s = jsonStore(file);
  assert.deepEqual(await s.load(), []);
  await s.save(SUBS);
  assert.deepEqual(await s.load(), SUBS);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), SUBS);
  writeFileSync(file, "{not json");
  assert.deepEqual(await s.load(), []);
});

test("rowToSubscriber drops null optional fields instead of stringifying them", () => {
  assert.deepEqual(
    rowToSubscriber({ email: "a@x.com", subscribed_at: "t", intent: null, context: null }),
    { email: "a@x.com", subscribedAt: "t" },
  );
});

test("postgresStore: creates its table, round-trips, and full-replaces on save", async () => {
  const pg = postgresStore("postgres://unused", memPool());
  assert.deepEqual(await pg.load(), []); // first touch creates the table
  await pg.save(SUBS);
  assert.deepEqual(await pg.load(), SUBS); // ordered by subscribed_at
  await pg.save([SUBS[1]]); // full replace, not append
  assert.deepEqual(await pg.load(), [SUBS[1]]);
  await pg.save([]);
  assert.deepEqual(await pg.load(), []);
});

test("createSubscriberStore: no DATABASE_URL selects the JSON backend", async () => {
  const dir = mkdtempSync(join(tmpdir(), "substore-"));
  const s = await createSubscriberStore({ env: {}, jsonFile: join(dir, "subs.json") });
  assert.equal(s.kind, "json");
});

test("createSubscriberStore: first Postgres boot imports legacy JSON rows once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "substore-"));
  const file = join(dir, "subs.json");
  writeFileSync(file, JSON.stringify(SUBS));
  const pg = postgresStore("postgres://unused", memPool());
  const s = await createSubscriberStore({
    env: { DATABASE_URL: "postgres://unused" },
    jsonFile: file,
    pgFactory: () => pg,
  });
  assert.equal(s.kind, "postgres");
  assert.deepEqual(await s.load(), SUBS);

  // A later boot with rows already present must NOT re-import (deletions
  // from Postgres would resurrect from the stale JSON otherwise).
  await s.save([SUBS[0]]);
  const again = await createSubscriberStore({
    env: { DATABASE_URL: "postgres://unused" },
    jsonFile: file,
    pgFactory: () => pg,
  });
  assert.deepEqual(await again.load(), [SUBS[0]]);
});

test("createSubscriberStore: unreachable Postgres falls back to JSON, not a crash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "substore-"));
  const s = await createSubscriberStore({
    env: { DATABASE_URL: "postgres://unused" },
    jsonFile: join(dir, "subs.json"),
    pgFactory: () => {
      throw new Error("connection refused");
    },
  });
  assert.equal(s.kind, "json");
});
