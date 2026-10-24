import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSupplyChainPayload, endUseLive, validateStages, type StagesFile } from "../supply-chain";
import { ALL_STACK_TICKERS, COMPANY_DATABASE, knownTicker } from "../company-registry";
import { supplyNodes, supplyLinks } from "../../client/src/data/supply-chain-config";

const stages: StagesFile = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "supply-chain-stages.json"), "utf-8"));

const STAGE_OF: Record<string, string> = {
  "raw-materials": "rawMaterials",
  generation: "generation",
  transmission: "transmission",
  distribution: "distribution",
  "end-use": "endUse",
};

// Tickers that no longer trade, or named the wrong company. Never again.
const RETIRED = ["ABB", "SWN", "WIRE", "X", "SIEGY", "AYI", "AOS"];

test("the stage file is valid: every status has sourced, dated evidence", () => {
  assert.deepEqual(validateStages(stages), []);
  assert.equal(stages.stages.endUse.status, null, "the demand stage carries live counts, not a status");
});

test("each stage's tickers are exactly the companies of its nodes", () => {
  for (const [nodeStage, key] of Object.entries(STAGE_OF)) {
    const fromGraph = Array.from(new Set(supplyNodes.filter((n) => n.stage === nodeStage).flatMap((n) => n.companies.map((c) => c.ticker)))).sort();
    assert.deepEqual([...stages.stages[key].tickers].sort(), fromGraph, key);
  }
});

test("every company on the graph is a tracked ticker with a stock page; retired tickers are gone", () => {
  for (const n of supplyNodes) for (const c of n.companies) assert.ok(knownTicker(c.ticker), `${n.id}: ${c.ticker} is not in the registry`);
  for (const t of RETIRED) {
    assert.ok(!knownTicker(t), `${t} is still in the registry`);
    assert.ok(!(ALL_STACK_TICKERS as string[]).includes(t), `${t} is still listed`);
    assert.ok(!supplyNodes.some((n) => n.companies.some((c) => c.ticker === t)), `${t} is still on the graph`);
  }
});

test("node descriptions state roles, not figures; every figure is a sourced, dated fact", () => {
  for (const n of supplyNodes) {
    assert.ok(!/\d/.test(n.description), `${n.id} description carries a figure: ${n.description}`);
    if (n.fact) {
      assert.match(n.fact.url, /^https:\/\//, `${n.id} fact url`);
      assert.match(n.fact.asOf, /^\d{4}-\d{2}(-\d{2})?$/, `${n.id} fact asOf`);
      assert.ok(n.fact.value && n.fact.label && n.fact.statement && n.fact.publisher, `${n.id} fact fields`);
    }
  }
});

test("links join real nodes, once each", () => {
  const ids = new Set(supplyNodes.map((n) => n.id));
  const seen = new Set<string>();
  for (const l of supplyLinks) {
    assert.ok(ids.has(l.source) && ids.has(l.target), `${l.source} -> ${l.target}`);
    const k = `${l.source}>${l.target}`;
    assert.ok(!seen.has(k), `duplicate link ${k}`);
    seen.add(k);
  }
});

test("company explanations carry no unsourced percentages, dollar amounts or capacity figures", () => {
  for (const [t, c] of Object.entries(COMPANY_DATABASE as Record<string, { explanation: string }>)) {
    assert.ok(!/\d\s*%|\$\s*\d|\d\s*(GW|MW|billion|bn)\b/i.test(c.explanation), `${t}: ${c.explanation}`);
  }
});

test("validateStages rejects a status without evidence and evidence without a source or date", () => {
  const bad: StagesFile = {
    reviewed: "2026-10-18",
    method: "m",
    stages: {
      a: { name: "A", tagline: "", status: "Bottlenecked", evidence: [], tickers: ["GEV"] },
      b: { name: "B", tagline: "", status: "Tightening", evidence: [{ statement: "s", url: "http://x", publisher: "p", asOf: "soon" }], tickers: ["GEV"] },
    },
  };
  const problems = validateStages(bad);
  assert.ok(problems.some((p) => p.startsWith("a: a status needs evidence")));
  assert.ok(problems.some((p) => p.includes("url must be https")));
  assert.ok(problems.some((p) => p.includes("asOf must be")));
});

test("end use shows live registry counts; no tightest stage is invented", () => {
  assert.deepEqual(endUseLive([{ status: "operational" }, { status: "construction" }, { status: "operational" }]), {
    value: "3",
    label: "AI clusters tracked, 2 operational",
    href: "/compute-frontier",
  });
  assert.equal(endUseLive([]), null);
  const calm: StagesFile = { reviewed: "2026-10-18", method: "m", stages: { a: { name: "A", tagline: "", status: null, evidence: [], tickers: ["GEV"] } } };
  const out = buildSupplyChainPayload(calm, {}, [], () => null);
  assert.equal(out.tightestBottleneck, null);
});
