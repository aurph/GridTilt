// Regression guard: the Overview claimed 12+ GW of nuclear, named companies
// summing to 10.3 GW, and gave Microsoft 1.2 GW where the queue says 835 MW.
// Later it quoted a "contracted" nuclear total that included letters of intent
// and unreviewed rows. Only reviewed, signed agreements are summed now.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketFor, signedBuyersForType, asGW, type DealRowLite } from "../deal-rollups";

const SIGNED_BY_TYPE = [
  { key: "nuclear", count: 6, mw: 7240 },
  { key: "gas", count: 2, mw: 1004 },
];

const ROWS: DealRowLite[] = [
  { id: "clinton", type: "nuclear", offtaker: "Meta", capacityMW: 1121, firmness: "signed" },
  { id: "talen", type: "nuclear", offtaker: "Amazon (AWS)", capacityMW: 1920, firmness: "signed" },
  { id: "crane", type: "nuclear", offtaker: "Microsoft", capacityMW: 835, firmness: "signed" },
  { id: "meta-solar", type: "solar", offtaker: "Meta", capacityMW: 9000, firmness: "signed" },
  { id: "oklo-lois", type: "nuclear", offtaker: "Undisclosed buyers", capacityMW: 750, firmness: "preliminary" },
  { id: "unreviewed", type: "nuclear", offtaker: "Meta", capacityMW: 1500, firmness: "unreviewed" },
];

test("reads the signed bucket the deals page computed", () => {
  assert.deepEqual(bucketFor(SIGNED_BY_TYPE, "nuclear"), { key: "nuclear", count: 6, mw: 7240 });
});

test("a missing type is null, never a zero bucket", () => {
  assert.equal(bucketFor(SIGNED_BY_TYPE, "geothermal"), null);
  assert.equal(bucketFor(undefined, "nuclear"), null, "payload not arrived yet");
  assert.equal(bucketFor(null, "nuclear"), null);
});

test("signed buyers are per type, largest first", () => {
  assert.deepEqual(signedBuyersForType(ROWS, "nuclear"), [
    { buyer: "Amazon (AWS)", mw: 1920 },
    { buyer: "Meta", mw: 1121 },
    { buyer: "Microsoft", mw: 835 },
  ]);
});

test("letters of intent and unreviewed rows never reach a buyer's signed total", () => {
  const buyers = signedBuyersForType(ROWS, "nuclear");
  assert.ok(!buyers.some((b) => b.buyer === "Undisclosed buyers"), "Oklo's LOIs are not signed");
  assert.equal(buyers.find((b) => b.buyer === "Meta")?.mw, 1121, "the unreviewed 1,500 MW is not added");
});

test("a buyer's other-fuel deals do not leak into the nuclear total", () => {
  const meta = signedBuyersForType(ROWS, "nuclear").find((b) => b.buyer === "Meta");
  assert.equal(meta?.mw, 1121, "Meta's 9,000 MW of solar must not be counted here");
});

test("a row inside another signed row is counted once", () => {
  const rows: DealRowLite[] = [
    { id: "parent", type: "nuclear", offtaker: "Amazon (AWS)", capacityMW: 1920, firmness: "signed", includes: ["child"] },
    { id: "child", type: "nuclear", offtaker: "Amazon (AWS)", capacityMW: 300, firmness: "signed" },
  ];
  assert.deepEqual(signedBuyersForType(rows, "nuclear"), [{ buyer: "Amazon (AWS)", mw: 1920 }]);
});

test("portfolio aggregates and undisclosed capacity add nothing", () => {
  const rows: DealRowLite[] = [
    { id: "fleet", type: "hybrid", offtaker: "Microsoft", capacityMW: 40000, firmness: "portfolio", aggregate: true },
    { id: "secret", type: "hybrid", offtaker: "Microsoft", capacityMW: null, firmness: "signed" },
    { id: "known", type: "hybrid", offtaker: "Microsoft", capacityMW: 200, firmness: "signed" },
  ];
  assert.deepEqual(signedBuyersForType(rows, "hybrid"), [{ buyer: "Microsoft", mw: 200 }]);
});

test("no rows yields no buyers rather than a fabricated entry", () => {
  assert.deepEqual(signedBuyersForType([], "nuclear"), []);
  assert.deepEqual(signedBuyersForType(undefined, "nuclear"), []);
  assert.deepEqual(signedBuyersForType(ROWS, "wind"), []);
});

test("gigawatt formatting refuses missing or unusable input", () => {
  assert.equal(asGW(15526), "15.5");
  assert.equal(asGW(835), "0.8");
  for (const bad of [null, undefined, 0, -5, NaN]) {
    assert.equal(asGW(bad as number), null, `should refuse ${String(bad)}`);
  }
});
