import { test } from "node:test";
import assert from "node:assert/strict";
import { inflightKeys, readThrough, type Cached } from "../swr";

function harness<T>(initial: Cached<T> | null = null) {
  let cached = initial;
  const saved: T[] = [];
  return {
    get cached() {
      return cached;
    },
    save(v: T, at: number) {
      cached = { value: v, at };
      saved.push(v);
    },
    saved,
  };
}

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

test("fresh entries are served without loading", async () => {
  const h = harness({ value: "a", at: 1000 });
  let loads = 0;
  const v = await readThrough({ key: "t1", cached: h.cached, ttlMs: 100, now: 1050, load: async () => (loads++, "b"), save: (x) => h.save(x, 1050) });
  assert.equal(v, "a");
  assert.equal(loads, 0);
});

test("cold cache: concurrent callers share one load", async () => {
  const h = harness<string>();
  const d = deferred<string>();
  let loads = 0;
  const call = () => readThrough({ key: "t2", cached: h.cached, ttlMs: 100, now: 0, load: () => (loads++, d.promise), save: (x) => h.save(x, 0) });
  const a = call();
  const b = call();
  d.resolve("v");
  assert.deepEqual(await Promise.all([a, b]), ["v", "v"]);
  assert.equal(loads, 1);
  assert.deepEqual(h.saved, ["v"]);
  assert.deepEqual(inflightKeys().filter((k) => k === "t2"), []);
});

test("expired entry is served at once while one background refresh runs", async () => {
  const h = harness({ value: "old", at: 0 });
  const d = deferred<string>();
  let loads = 0;
  const call = () => readThrough({ key: "t3", cached: h.cached, ttlMs: 100, now: 500, load: () => (loads++, d.promise), save: (x) => h.save(x, 500) });
  assert.equal(await call(), "old");
  assert.equal(await call(), "old");
  assert.equal(loads, 1);
  d.resolve("new");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(h.saved, ["new"]);
});

test("a rejected refresh keeps and re-stamps the good entry", async () => {
  const h = harness({ value: [1, 2, 3], at: 0 });
  await readThrough({
    key: "t4",
    cached: h.cached,
    ttlMs: 100,
    now: 500,
    load: async () => [],
    save: (x) => h.save(x, 500),
    keep: (next) => next.length > 0,
  });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(h.cached, { value: [1, 2, 3], at: 500 });
});

test("a rejected first load is returned but not stored", async () => {
  const h = harness<number[]>();
  const v = await readThrough({ key: "t5", cached: h.cached, ttlMs: 100, now: 0, load: async () => [], save: (x) => h.save(x, 0), keep: (next) => next.length > 0 });
  assert.deepEqual(v, []);
  assert.equal(h.cached, null);
});

test("a failing load rejects a cold caller, but never a caller holding a stale entry", async () => {
  const cold = harness<string>();
  await assert.rejects(readThrough({ key: "t6", cached: cold.cached, ttlMs: 100, now: 0, load: async () => { throw new Error("down"); }, save: (x) => cold.save(x, 0) }));
  const stale = harness({ value: "old", at: 0 });
  const v = await readThrough({ key: "t7", cached: stale.cached, ttlMs: 100, now: 500, load: async () => { throw new Error("down"); }, save: (x) => stale.save(x, 500) });
  assert.equal(v, "old");
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(inflightKeys().filter((k) => k === "t6" || k === "t7"), []);
});
