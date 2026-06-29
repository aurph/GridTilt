// Locks the AI power deals math: corporate power procurement for AI, computed
// from the interconnection-queue projects, with the data-center "load" projects
// excluded (those belong to Compute Frontier). Same pure-module discipline as
// clusters/gpu-index.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeDealMetrics, normalizeOfftaker, type DealProject } from "../deals";

const SAMPLE: DealProject[] = [
  { id: "a", projectName: "Crane restart", sponsor: "Constellation", capacityMW: 835, type: "nuclear", status: "active", category: "ppa", expectedOnline: "2027-2028", offtaker: "Microsoft (20-year PPA)", sources: ["x"] },
  { id: "b", projectName: "Brookfield framework", sponsor: "Brookfield", capacityMW: 10500, type: "solar", status: "active", category: "ppa", offtaker: "Microsoft", sources: ["y"] },
  { id: "c", projectName: "AWS-Talen", sponsor: "Talen", capacityMW: 1920, type: "nuclear", status: "active", category: "ppa", offtaker: "Amazon Web Services (17-year)", sources: ["z"] },
  { id: "d", projectName: "Stargate Abilene", sponsor: "Oracle + OpenAI", capacityMW: 1200, type: "load", status: "active", category: "load", offtaker: null, sources: ["w"] },
  { id: "e", projectName: "Some DC load", sponsor: "X", capacityMW: 500, type: "load", status: "active", category: "load", offtaker: "Meta", sources: ["v"] },
];

test("normalizeOfftaker folds buyer name variants", () => {
  assert.equal(normalizeOfftaker("Amazon Web Services (17-year, $18B)"), "Amazon (AWS)");
  assert.equal(normalizeOfftaker("Microsoft (20-year PPA)"), "Microsoft");
  assert.equal(normalizeOfftaker("Google + TVA"), "Google");
  assert.equal(normalizeOfftaker("Meta (VPPA)"), "Meta");
  assert.equal(normalizeOfftaker("Constellation + AES"), "Constellation");
});

test("only power-procurement deals count; DC load is excluded", () => {
  const m = computeDealMetrics(SAMPLE);
  // a, b, c are power deals; d (no offtaker, load) and e (load type) are excluded
  assert.equal(m.dealCount, 3);
  assert.equal(m.totalContractedMW, 835 + 10500 + 1920);
  assert.ok(!m.rows.some((r) => r.type === "load"), "no load rows");
});

test("rows sort by capacity desc; offtaker buckets aggregate + sort by MW", () => {
  const m = computeDealMetrics(SAMPLE);
  assert.deepEqual(m.rows.map((r) => r.id), ["b", "c", "a"]);
  assert.equal(m.byOfftaker[0].key, "Microsoft"); // 10500 + 835
  assert.equal(m.byOfftaker[0].mw, 11335);
  assert.equal(m.byOfftaker[0].count, 2);
  assert.equal(m.byType[0].key, "solar"); // 10500 beats nuclear 2755
});

test("the shipped queue dataset yields well-formed deals", () => {
  const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "interconnection-queue.json"), "utf-8"));
  const m = computeDealMetrics((root.projects ?? []) as DealProject[]);
  assert.ok(m.dealCount >= 15, "at least 15 tracked power deals");
  assert.ok(m.totalContractedMW > 0);
  for (const r of m.rows) {
    assert.ok(r.offtaker && r.offtaker.length > 0, `${r.id} has a buyer`);
    assert.ok(r.capacityMW > 0, `${r.id} has capacity`);
    assert.ok(r.type !== "load", `${r.id} is not load`);
  }
  // buckets reconcile to the total
  assert.equal(m.byOfftaker.reduce((s, b) => s + b.mw, 0), m.totalContractedMW);
});
