import { test } from "node:test";
import assert from "node:assert/strict";
import { withDeadline } from "../fetch-timeout";

test("withDeadline retries once after a stall and returns the second answer", async () => {
  let calls = 0;
  const v = await withDeadline(() => {
    calls += 1;
    return calls === 1 ? new Promise<string>(() => {}) : Promise.resolve("ok");
  }, 10);
  assert.equal(v, "ok");
  assert.equal(calls, 2);
});

test("withDeadline rejects when both tries stall, instead of hanging", async () => {
  let calls = 0;
  await assert.rejects(
    withDeadline(() => {
      calls += 1;
      return new Promise(() => {});
    }, 10),
    /missed its deadline/,
  );
  assert.equal(calls, 2);
});

test("withDeadline does not retry an ordinary failure", async () => {
  let calls = 0;
  await assert.rejects(
    withDeadline(() => {
      calls += 1;
      return Promise.reject(new Error("EIA responded 429"));
    }, 1000),
    /429/,
  );
  assert.equal(calls, 1);
});
