import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  benchmarkCoverage,
  benchmarkSeries,
  groupModelsByYear,
  orderLabs,
  parseFrontierDate,
  parseFrontierParams,
  releaseRows,
  solveFrontierLabels,
  type FrontierRegistry,
} from "../frontier-series";

const registry: FrontierRegistry = {
  asOf: "2026-07-14",
  methodology: "fixture",
  summary: { asOf: "2026-07-14", labCount: 3, modelCount: 4, sourceCount: 4, firstReleaseDate: "2019-02-14", lastReleaseDate: "2026-07-09" },
  labs: [
    { id: "late", name: "Late Lab", color: "#111111", glyph: "square" },
    { id: "openai", name: "OpenAI", color: "#222222", glyph: "circle" },
    { id: "anthropic", name: "Anthropic", color: "#333333", glyph: "diamond" },
  ],
  benchmarks: [{ id: "bench", name: "Bench", family: "coding", unit: "percent", higherIsBetter: true, introducedAt: "2024-01-01" }],
  sources: [],
  models: [
    { id: "a", labId: "openai", name: "A", family: "A", releaseDate: "2019-02-14", releaseStatus: "preview", inclusionReason: "capability-shift", modalities: ["text"], contextWindow: 1024, summary: "A", sourceIds: ["s1"], milestone: true, benchmarks: [] },
    { id: "b", labId: "anthropic", name: "B", family: "B", releaseDate: "2023-03-14", releaseStatus: "general", inclusionReason: "flagship", modalities: ["text"], contextWindow: 100000, summary: "B", sourceIds: ["s2"], milestone: true, benchmarks: [{ benchmarkId: "bench", comparabilityKey: "bench:v1:tools-off", score: 70, unit: "percent", provenance: "lab", sourceId: "s2", setting: "v1, tools off" }] },
    { id: "c", labId: "openai", name: "C", family: "C", releaseDate: "2024-05-13", releaseStatus: "general", inclusionReason: "flagship", modalities: ["text", "image"], contextWindow: 128000, summary: "C", sourceIds: ["s3"], milestone: true, benchmarks: [{ benchmarkId: "bench", comparabilityKey: "bench:v1:tools-off", score: 75, unit: "percent", provenance: "independent", sourceId: "s3", setting: "v1, tools off" }] },
    { id: "d", labId: "late", name: "D", family: "D", releaseDate: "2026-07-09", releaseStatus: "general", inclusionReason: "flagship", modalities: ["text", "image"], contextWindow: 1000000, summary: "D", sourceIds: ["s4"], milestone: true, benchmarks: [{ benchmarkId: "bench", comparabilityKey: "bench:v2:tools-on", score: 90, unit: "percent", provenance: "lab", sourceId: "s4", setting: "v2, tools on" }] },
  ],
};

describe("frontier dates and lanes", () => {
  it("parses only exact ISO release days", () => {
    assert.equal(parseFrontierDate("2019-02-14"), Date.UTC(2019, 1, 14));
    assert.equal(parseFrontierDate("2019-02"), null);
    assert.equal(parseFrontierDate("not-a-date"), null);
  });
  it("orders labs by first release and keeps models chronological", () => {
    assert.deepEqual(orderLabs(registry).map((lab) => lab.id), ["openai", "anthropic", "late"]);
    assert.deepEqual(releaseRows(registry).flatMap((row) => row.models.map((model) => model.id)), ["a", "c", "b", "d"]);
  });
});

describe("benchmark comparison", () => {
  it("plots only one exact comparability key", () => {
    const rows = benchmarkSeries(registry, "bench", "bench:v1:tools-off", new Set(registry.labs.map((lab) => lab.id)));
    assert.deepEqual(rows.map((row) => row.model.id), ["b", "c"]);
    assert.deepEqual(rows.map((row) => row.result.score), [70, 75]);
  });
  it("reports comparable coverage, not every result sharing a benchmark name", () => {
    assert.deepEqual(benchmarkCoverage(registry, "bench", "bench:v1:tools-off"), { modelCount: 2, labCount: 2 });
  });
});

it("groups the mobile ledger by descending year and chronological entries", () => {
  const groups = groupModelsByYear(registry.models);
  assert.deepEqual(groups.map((group) => group.year), [2026, 2024, 2023, 2019]);
  assert.equal(groups.at(-1)?.models[0].id, "a");
});

it("falls back from stale URL values without losing valid lab filters", () => {
  const parsed = parseFrontierParams("?lens=unknown&benchmark=missing&labs=openai,bad&model=missing", registry);
  assert.equal(parsed.lens, "releases");
  assert.equal(parsed.benchmarkId, null);
  assert.deepEqual(parsed.labIds, ["openai"]);
  assert.equal(parsed.modelId, "d");
});

it("keeps high-priority labels and non-overlapping optional labels", () => {
  const labels = solveFrontierLabels([
    { id: "a", x: 100, width: 60, priority: 1 },
    { id: "b", x: 110, width: 60, priority: 3 },
    { id: "c", x: 240, width: 60, priority: 1 },
  ], 0, 400);
  assert.deepEqual(labels.map((label) => label.id), ["b", "c"]);
});
