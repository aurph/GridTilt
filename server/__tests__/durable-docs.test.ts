import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newDb } from "pg-mem";
import { DOCS, docDef, durableDocs, mergeDoc, notifyDocWritten, setActiveDurableDocs, type QueryLike } from "../durable-docs";

const index = docDef("index-history.json")!;
const gpu = docDef("gpu-price-history.json")!;
const social = docDef("social-log.json")!;

function pool(): QueryLike {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  return new Pool() as unknown as QueryLike;
}

function dir(files: Record<string, unknown>): string {
  const d = mkdtempSync(join(tmpdir(), "gt-durable-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), JSON.stringify(body, null, 2) + "\n");
  return d;
}

const read = (d: string, name: string) => JSON.parse(readFileSync(join(d, name), "utf-8"));

// ─── Merge rules ────────────────────────────────────────────────────────────

test("index history: union by date, preferred copy wins a clash, header kept", () => {
  const file = { generated: "seed", method: "m", days: [{ date: "2026-01-02", npi: 1 }, { date: "2026-01-03", npi: 2 }] };
  const db = { generated: "seed", method: "m", days: [{ date: "2026-01-03", npi: 9 }, { date: "2026-10-01", npi: 3 }] };
  const merged = mergeDoc(index, file, db);
  assert.deepEqual(merged.days.map((d: any) => [d.date, d.npi]), [["2026-01-02", 1], ["2026-01-03", 9], ["2026-10-01", 3]]);
  assert.equal(merged.method, "m");
});

test("gpu history: a live row supersedes a same-day legacy row from the other copy", () => {
  const merged = mergeDoc(gpu, [{ date: "2026-07-01", source: "curated", prices: { H100: 2 } }], [{ date: "2026-07-01", source: "live", prices: { H100: 3 } }, { date: "2026-07-02", source: "curated", prices: { H100: 2 } }]);
  assert.deepEqual(merged.map((s: any) => `${s.date}:${s.source}`), ["2026-07-01:live", "2026-07-02:curated"]);
});

test("social log: union by timestamp, keeps the newest 500", () => {
  const a = Array.from({ length: 400 }, (_, i) => ({ timestamp: `2026-01-01T00:00:${String(i).padStart(3, "0")}Z`, platform: "twitter", text: "a" }));
  const b = Array.from({ length: 200 }, (_, i) => ({ timestamp: `2026-02-01T00:00:${String(i).padStart(3, "0")}Z`, platform: "twitter", text: "b" }));
  const merged = mergeDoc(social, a, b);
  assert.equal(merged.length, 500);
  assert.equal(merged[merged.length - 1].text, "b");
  assert.equal(merged[0].timestamp, a[100].timestamp);
});

test("merging is idempotent and never drops a row", () => {
  for (const def of DOCS) {
    const x = def.withItems(def.empty(), [{ date: "2026-01-01", timestamp: "2026-01-01T00:00:00Z", source: "live", platform: "twitter" }]);
    const once = mergeDoc(def, x, x);
    assert.deepEqual(mergeDoc(def, once, once), once, def.name);
    assert.equal(def.items(once).length, 1, def.name);
  }
});

// ─── Postgres round trips ───────────────────────────────────────────────────

test("hydrate: an empty database takes the file; a later boot restores rows the redeploy lost", async () => {
  const p = pool();
  const seed = { generated: "seed", days: [{ date: "2026-01-02", npi: 1 }] };
  const first = dir({ "index-history.json": seed, "gpu-price-history.json": [], "social-log.json": [], "backlog-auto-updates.json": [] });
  const d1 = durableDocs(p, first);
  await d1.hydrate();

  // The running instance records a day and mirrors it.
  writeFileSync(join(first, "index-history.json"), JSON.stringify({ ...seed, days: [...seed.days, { date: "2026-10-14", npi: 5 }] }, null, 2) + "\n");
  await d1.mirror("index-history.json");

  // A redeploy starts from the committed seed again.
  const second = dir({ "index-history.json": seed, "gpu-price-history.json": [], "social-log.json": [], "backlog-auto-updates.json": [] });
  const report = await durableDocs(p, second).hydrate();
  assert.deepEqual(read(second, "index-history.json").days.map((d: any) => d.date), ["2026-01-02", "2026-10-14"]);
  const row = report.find((r) => r.name === "index-history.json")!;
  assert.deepEqual([row.fileRows, row.dbRows, row.mergedRows], [1, 2, 2]);
});

test("hydrate: rows only in a new commit's file reach the database too", async () => {
  const p = pool();
  const a = dir({ "gpu-price-history.json": [{ date: "2026-07-01", source: "live", prices: {} }] });
  await durableDocs(p, a, [gpu]).hydrate();
  const b = dir({ "gpu-price-history.json": [{ date: "2026-06-30", source: "live", prices: {} }] });
  await durableDocs(p, b, [gpu]).hydrate();
  assert.deepEqual(read(b, "gpu-price-history.json").map((s: any) => s.date), ["2026-06-30", "2026-07-01"]);
  const c = dir({ "gpu-price-history.json": [] });
  await durableDocs(p, c, [gpu]).hydrate();
  assert.deepEqual(read(c, "gpu-price-history.json").map((s: any) => s.date), ["2026-06-30", "2026-07-01"]);
});

test("mirror: two instances appending different rows keep both", async () => {
  const p = pool();
  const one = dir({ "social-log.json": [] });
  const two = dir({ "social-log.json": [] });
  const d1 = durableDocs(p, one, [social]);
  const d2 = durableDocs(p, two, [social]);
  await d1.hydrate();
  await d2.hydrate();
  writeFileSync(join(one, "social-log.json"), JSON.stringify([{ timestamp: "2026-10-14T12:00:00Z", platform: "twitter", text: "from one" }]));
  writeFileSync(join(two, "social-log.json"), JSON.stringify([{ timestamp: "2026-10-14T12:05:00Z", platform: "twitter", text: "from two" }]));
  await d1.mirror("social-log.json");
  await d2.mirror("social-log.json");
  const three = dir({ "social-log.json": [] });
  await durableDocs(p, three, [social]).hydrate();
  assert.deepEqual(read(three, "social-log.json").map((e: any) => e.text), ["from one", "from two"]);
});

test("mirror: a write that lands between this instance's read and update is merged, not overwritten", async () => {
  const p = pool();
  const other = dir({ "social-log.json": [] });
  const mine = dir({ "social-log.json": [] });
  await durableDocs(p, other, [social]).hydrate();
  // Instance "other" writes its row exactly when "mine" is about to update.
  let raced = false;
  const racing: QueryLike = {
    async query(text, values) {
      if (!raced && text.startsWith("UPDATE gt_documents")) {
        raced = true;
        writeFileSync(join(other, "social-log.json"), JSON.stringify([{ timestamp: "2026-10-14T11:00:00Z", platform: "twitter", text: "other" }]));
        await durableDocs(p, other, [social]).mirror("social-log.json");
      }
      return p.query(text, values);
    },
  };
  // Give "mine" an existing row so it takes the UPDATE path.
  writeFileSync(join(mine, "social-log.json"), JSON.stringify([{ timestamp: "2026-10-14T10:00:00Z", platform: "twitter", text: "seed" }]));
  await durableDocs(p, mine, [social]).mirror("social-log.json");
  writeFileSync(join(mine, "social-log.json"), JSON.stringify([{ timestamp: "2026-10-14T12:00:00Z", platform: "twitter", text: "mine" }]));
  await durableDocs(racing, mine, [social]).mirror("social-log.json");
  assert.equal(raced, true);
  const check = dir({ "social-log.json": [] });
  await durableDocs(p, check, [social]).hydrate();
  assert.deepEqual(read(check, "social-log.json").map((e: any) => e.text), ["seed", "other", "mine"]);
});

test("social log keeps its writer's formatting (no trailing newline)", async () => {
  const p = pool();
  const d = dir({});
  writeFileSync(join(d, "social-log.json"), JSON.stringify([{ timestamp: "t1", platform: "twitter" }], null, 2));
  await durableDocs(p, d, [social]).hydrate();
  assert.equal(readFileSync(join(d, "social-log.json"), "utf-8").endsWith("]"), true);
});

test("notifyDocWritten is a no-op with no database and never throws into the writer", async () => {
  setActiveDurableDocs(null);
  notifyDocWritten("index-history.json");
  setActiveDurableDocs({ hydrate: async () => [], mirror: async () => { throw new Error("db down"); } });
  notifyDocWritten("index-history.json");
  await new Promise((r) => setTimeout(r, 0));
  setActiveDurableDocs(null);
});
