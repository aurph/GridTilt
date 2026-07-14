import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  readFrontierRegistry,
  summarizeFrontierRegistry,
  validateFrontierRegistry,
} from "../frontier-models";

describe("validateFrontierRegistry", () => {
  test("rejects a benchmark result without a resolvable source", () => {
    const invalid = {
      asOf: "2026-07-14",
      methodology: "Native scores only.",
      labs: [{ id: "openai", name: "OpenAI", color: "#3987e5", glyph: "circle" }],
      benchmarks: [{ id: "gpqa-diamond", name: "GPQA Diamond", family: "reasoning", unit: "percent", higherIsBetter: true }],
      sources: [{ id: "gpt-2-paper", publisher: "OpenAI", title: "Language Models are Unsupervised Multitask Learners", url: "https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf", publishedAt: "2019-02-14", accessedAt: "2026-07-14", locator: "Model announcement and paper" }],
      models: [{
        id: "gpt-2",
        labId: "openai",
        name: "GPT-2",
        family: "GPT",
        releaseDate: "2019-02-14",
        releaseStatus: "preview",
        inclusionReason: "capability-shift",
        modalities: ["text"],
        contextWindow: 1024,
        summary: "A staged release that demonstrated broad zero-shot transfer.",
        sourceIds: ["gpt-2-paper"],
        milestone: true,
        benchmarks: [{ benchmarkId: "gpqa-diamond", comparabilityKey: "gpqa-diamond:percent:closed-book", score: 0, unit: "percent", provenance: "lab", sourceId: "missing", setting: "closed book" }],
      }],
    };
    assert.throws(() => validateFrontierRegistry(invalid), /missing source/i);
  });

  test("rejects a result whose unit disagrees with its benchmark", () => {
    const registry = structuredClone(readFrontierRegistry());
    const model = registry.models.find((item) => item.benchmarks.length > 0);
    assert.ok(model);
    model.benchmarks[0].unit = "elo";
    assert.throws(() => validateFrontierRegistry(registry), /unit/i);
  });

  test("rejects comparability keys that hide a different benchmark", () => {
    const registry = structuredClone(readFrontierRegistry());
    const model = registry.models.find((item) => item.benchmarks.length > 0);
    assert.ok(model);
    model.benchmarks[0].comparabilityKey = "other-benchmark:v1";
    assert.throws(() => validateFrontierRegistry(registry), /comparability/i);
  });
});

test("shipped frontier registry satisfies the evidence contract", () => {
  const registry = readFrontierRegistry();
  assert.equal(registry.asOf, "2026-07-14");
  assert.ok(registry.models.some((model) => model.id === "gpt-2"));
  assert.ok(registry.models.some((model) => model.id === "gpt-5-6-sol"));
  assert.ok(registry.labs.length >= 10);
  assert.ok(registry.models.length >= 40);
  assert.ok(registry.sources.length >= registry.models.length);
  for (const model of registry.models) {
    assert.ok(model.sourceIds.length > 0, `${model.id} has a release source`);
    assert.ok(/^20\d\d-\d\d-\d\d$/.test(model.releaseDate), `${model.id} release date`);
    for (const result of model.benchmarks) {
      assert.ok(Number.isFinite(result.score), `${model.id}/${result.benchmarkId} finite score`);
      assert.ok(result.setting.trim().length > 0, `${model.id}/${result.benchmarkId} setting`);
    }
  }
  const summary = summarizeFrontierRegistry(registry);
  assert.equal(summary.modelCount, registry.models.length);
  assert.equal(summary.labCount, registry.labs.length);
  assert.equal(summary.firstReleaseDate, "2019-02-14");
  assert.equal(summary.lastReleaseDate, "2026-07-09");
});
