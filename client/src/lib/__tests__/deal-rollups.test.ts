// Guards the second instance of a hardcoded headline drifting from the data the
// site already serves. The Overview claimed 12+ GW of nuclear, named companies
// summing to 10.3 GW, and credited Microsoft with 1.2 GW where the queue says
// 835 MW. Reading the served payload is the fix; these tests pin the reading.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketFor, buyersForType, asGW, type DealRowLite } from "../deal-rollups";

const BY_TYPE = [
  { key: "hybrid", count: 3, mw: 40200 },
  { key: "nuclear", count: 13, mw: 15526 },
  { key: "gas", count: 2, mw: 1004 },
];

// Shapes taken from the real nuclear rows in interconnection-queue.json.
const ROWS: DealRowLite[] = [
  { type: "nuclear", offtaker: "Meta", capacityMW: 4121 },
  { type: "nuclear", offtaker: "Amazon (AWS)", capacityMW: 2970 },
  { type: "nuclear", offtaker: "Microsoft", capacityMW: 835 },
  { type: "solar", offtaker: "Meta", capacityMW: 9000 },
];

test("reads the bucket the deals page computed", () => {
  assert.deepEqual(bucketFor(BY_TYPE, "nuclear"), { key: "nuclear", count: 13, mw: 15526 });
});

test("a missing type is null, never a zero bucket", () => {
  assert.equal(bucketFor(BY_TYPE, "geothermal"), null);
  assert.equal(bucketFor(undefined, "nuclear"), null, "payload not arrived yet");
  assert.equal(bucketFor(null, "nuclear"), null);
});

test("buyers are per type, largest first", () => {
  assert.deepEqual(buyersForType(ROWS, "nuclear"), [
    { buyer: "Meta", mw: 4121 },
    { buyer: "Amazon (AWS)", mw: 2970 },
    { buyer: "Microsoft", mw: 835 },
  ]);
});

test("Microsoft's nuclear figure is the 835 MW the queue records", () => {
  // The Overview card said 1.2 GW. Every other surface says 835 MW.
  const ms = buyersForType(ROWS, "nuclear").find((b) => b.buyer === "Microsoft");
  assert.equal(ms?.mw, 835);
});

test("a buyer's other-fuel deals do not leak into the nuclear total", () => {
  const meta = buyersForType(ROWS, "nuclear").find((b) => b.buyer === "Meta");
  assert.equal(meta?.mw, 4121, "Meta's 9,000 MW of solar must not be counted here");
});

test("one buyer's deals across several rows are summed", () => {
  const rows: DealRowLite[] = [
    { type: "nuclear", offtaker: "Meta", capacityMW: 1000 },
    { type: "nuclear", offtaker: "Meta", capacityMW: 3121 },
  ];
  assert.deepEqual(buyersForType(rows, "nuclear"), [{ buyer: "Meta", mw: 4121 }]);
});

test("no rows yields no buyers rather than a fabricated entry", () => {
  assert.deepEqual(buyersForType([], "nuclear"), []);
  assert.deepEqual(buyersForType(undefined, "nuclear"), []);
  assert.deepEqual(buyersForType(ROWS, "wind"), []);
});

test("gigawatt formatting refuses missing or unusable input", () => {
  assert.equal(asGW(15526), "15.5");
  assert.equal(asGW(835), "0.8");
  for (const bad of [null, undefined, 0, -5, NaN]) {
    assert.equal(asGW(bad as number), null, `should refuse ${String(bad)}`);
  }
});

test("the derived total is the served figure, not the old hardcoded one", () => {
  const nuclear = bucketFor(BY_TYPE, "nuclear");
  assert.equal(asGW(nuclear?.mw), "15.5");
  assert.notEqual(asGW(nuclear?.mw), "12.0", "12+ GW was the stale hardcoded claim");
});
