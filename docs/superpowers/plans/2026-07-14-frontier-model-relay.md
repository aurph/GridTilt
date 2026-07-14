# Frontier Model Relay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a citation-first Frontier tab to GPU Prices that shows major frontier-model releases from GPT-2 through GPT-5.6 Sol and permits only exact, benchmark-compatible comparisons.

**Architecture:** A hand-curated JSON registry is validated by a pure server module and exposed through a thin Express route. Pure client transforms derive lab lanes, benchmark coverage, URL state, label priorities, and mobile year groups. A focused visx/SVG chart and embedded React page render the release timeline, benchmark lens, model receipt, source ledger, and responsive ledger without introducing a composite intelligence score.

**Tech Stack:** React 18.3.1, TypeScript 5.6.3, Express 5, TanStack Query 5, visx 4, Tailwind 3, Node test runner, existing GridTilt tokens and UI primitives.

## Global Constraints

- Keep the feature inside `/neocloud-intel` as a third `Frontier` tab; do not add a sidebar item or standalone route.
- Use official announcements, technical reports, system cards, benchmark-owner results, or identified independent evaluators. Every model and benchmark result must resolve to a source record.
- Do not create a universal GridTilt intelligence index, normalize scores across benchmarks, interpolate missing results, or represent missing values as zero.
- Plot values together only when their `comparabilityKey`, benchmark version, metric, and material evaluation settings match.
- Store the registry in `server/data/frontier-models.json`; runtime code never writes it.
- Preserve the existing GPU Prices and Economics response shapes and rendering.
- Dark mode only. Use shared tokens, Inter for interface text, JetBrains Mono for data, and literal `#F07800` for active GridTilt selection.
- New files use kebab-case. Product copy and commits use plain voice with no em dashes and no `Co-Authored-By` lines.
- New data logic must be pure and unit tested. Routes stay thin.
- Respect keyboard access, screen-reader tables, visible focus, color-independent identity, narrow layouts, and `prefers-reduced-motion`.
- No new dependency is required.

## File Map

**Create**

- `server/data/frontier-models.json`: normalized curated registry and citations.
- `server/frontier-models.ts`: types, validation, registry reader, and summary helpers.
- `server/__tests__/frontier-models.test.ts`: registry, validator, and endpoint invariants.
- `client/src/lib/frontier-series.ts`: pure timeline, benchmark, URL, and mobile transforms.
- `client/src/lib/__tests__/frontier-series.test.ts`: exhaustive transform tests.
- `client/src/components/frontier-relay-chart.tsx`: desktop visx/SVG release and benchmark rendering.
- `client/src/pages/frontier-models.tsx`: query state, controls, receipt, sources, mobile ledger, and accessible tables.
- `docs/FRONTIER_MODEL_METHODOLOGY.md`: public-facing evidence and update methodology.

**Modify**

- `server/routes.ts`: import registry reader and add `GET /api/frontier-models`.
- `client/src/pages/neocloud-intel.tsx`: add the third tab and embedded page branch.
- `CLAUDE.md`: document the new endpoint, data custody, and tab.

---

### Task 1: Establish the validated frontier registry

**Files:**

- Create: `server/data/frontier-models.json`
- Create: `server/frontier-models.ts`
- Create: `server/__tests__/frontier-models.test.ts`

**Interfaces:**

- Consumes: `process.cwd()` and the committed JSON file.
- Produces: `FrontierRegistry`, `FrontierLab`, `FrontierSource`, `BenchmarkDefinition`, `FrontierModel`, `FrontierBenchmarkResult`, `validateFrontierRegistry(value)`, `readFrontierRegistry()`, and `summarizeFrontierRegistry(registry)`.

- [ ] **Step 1: Write failing validator and shipped-data tests**

Create `server/__tests__/frontier-models.test.ts` with these initial tests:

```ts
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
    const model = registry.models.find((item) => item.benchmarks.length > 0)!;
    model.benchmarks[0].unit = "elo";
    assert.throws(() => validateFrontierRegistry(registry), /unit/i);
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
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run:

```bash
TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/frontier-models.test.ts
```

Expected: FAIL with `Cannot find module '../frontier-models'`.

- [ ] **Step 3: Implement the registry types, validation, reader, and summary**

Create `server/frontier-models.ts` with these public contracts and validation rules:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type BenchmarkFamily = "general" | "reasoning" | "coding" | "agents" | "multimodal";
export type BenchmarkUnit = "percent" | "elo" | "index" | "seconds" | "minutes" | "hours";
export type ReleaseStatus = "preview" | "general" | "open-weights" | "restricted";
export type InclusionReason = "flagship" | "frontier-move" | "open-weight-frontier" | "capability-shift";
export type Provenance = "lab" | "benchmark-owner" | "independent";
export type LabGlyph = "circle" | "square" | "diamond" | "triangle" | "hex";

export interface FrontierLab {
  id: string;
  name: string;
  color: string;
  glyph: LabGlyph;
}

export interface FrontierSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string;
  accessedAt: string;
  locator: string;
}

export interface BenchmarkDefinition {
  id: string;
  name: string;
  family: BenchmarkFamily;
  unit: BenchmarkUnit;
  higherIsBetter: boolean;
  introducedAt?: string;
}

export interface FrontierBenchmarkResult {
  benchmarkId: string;
  comparabilityKey: string;
  score: number;
  unit: BenchmarkUnit;
  provenance: Provenance;
  sourceId: string;
  setting: string;
  featured?: boolean;
}

export interface FrontierModel {
  id: string;
  labId: string;
  name: string;
  family: string;
  releaseDate: string;
  releaseStatus: ReleaseStatus;
  inclusionReason: InclusionReason;
  modalities: string[];
  contextWindow: number | null;
  summary: string;
  sourceIds: string[];
  milestone: boolean;
  benchmarks: FrontierBenchmarkResult[];
}

export interface FrontierRegistry {
  asOf: string;
  methodology: string;
  labs: FrontierLab[];
  benchmarks: BenchmarkDefinition[];
  sources: FrontierSource[];
  models: FrontierModel[];
}

const ISO_DAY = /^20\d\d-\d\d-\d\d$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNITS = new Set<BenchmarkUnit>(["percent", "elo", "index", "seconds", "minutes", "hours"]);
const STATUSES = new Set<ReleaseStatus>(["preview", "general", "open-weights", "restricted"]);
const REASONS = new Set<InclusionReason>(["flagship", "frontier-move", "open-weight-frontier", "capability-shift"]);
const PROVENANCE = new Set<Provenance>(["lab", "benchmark-owner", "independent"]);

function uniqueIds<T extends { id: string }>(rows: T[], label: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!ID.test(row.id)) throw new Error(`${label} has invalid id ${row.id}`);
    if (seen.has(row.id)) throw new Error(`${label} has duplicate id ${row.id}`);
    seen.add(row.id);
  }
}

export function validateFrontierRegistry(value: unknown): FrontierRegistry {
  if (!value || typeof value !== "object") throw new Error("frontier registry must be an object");
  const root = value as FrontierRegistry;
  if (!ISO_DAY.test(root.asOf)) throw new Error("frontier registry has invalid asOf");
  if (!root.methodology?.trim()) throw new Error("frontier registry needs methodology");
  if (!Array.isArray(root.labs) || !Array.isArray(root.benchmarks) || !Array.isArray(root.sources) || !Array.isArray(root.models)) throw new Error("frontier registry arrays are required");
  uniqueIds(root.labs, "lab");
  uniqueIds(root.benchmarks, "benchmark");
  uniqueIds(root.sources, "source");
  uniqueIds(root.models, "model");
  const labs = new Set(root.labs.map((item) => item.id));
  const sources = new Set(root.sources.map((item) => item.id));
  const benchmarks = new Map(root.benchmarks.map((item) => [item.id, item]));
  for (const source of root.sources) {
    if (!/^https:\/\//.test(source.url)) throw new Error(`source ${source.id} needs https URL`);
    if (!ISO_DAY.test(source.publishedAt) || !ISO_DAY.test(source.accessedAt)) throw new Error(`source ${source.id} has invalid date`);
  }
  for (const model of root.models) {
    if (!labs.has(model.labId)) throw new Error(`model ${model.id} references missing lab ${model.labId}`);
    if (!ISO_DAY.test(model.releaseDate) || model.releaseDate > root.asOf) throw new Error(`model ${model.id} has invalid release date`);
    if (!STATUSES.has(model.releaseStatus)) throw new Error(`model ${model.id} has invalid release status`);
    if (!REASONS.has(model.inclusionReason)) throw new Error(`model ${model.id} has invalid inclusion reason`);
    if (!model.sourceIds.length) throw new Error(`model ${model.id} needs a release source`);
    for (const sourceId of model.sourceIds) if (!sources.has(sourceId)) throw new Error(`model ${model.id} references missing source ${sourceId}`);
    for (const result of model.benchmarks) {
      const benchmark = benchmarks.get(result.benchmarkId);
      if (!benchmark) throw new Error(`model ${model.id} references missing benchmark ${result.benchmarkId}`);
      if (!sources.has(result.sourceId)) throw new Error(`model ${model.id} result references missing source ${result.sourceId}`);
      if (!Number.isFinite(result.score)) throw new Error(`model ${model.id} result has non-finite score`);
      if (!UNITS.has(result.unit) || result.unit !== benchmark.unit) throw new Error(`model ${model.id} result unit disagrees with ${benchmark.id}`);
      if (!PROVENANCE.has(result.provenance)) throw new Error(`model ${model.id} result has invalid provenance`);
      if (!result.comparabilityKey.startsWith(`${benchmark.id}:`)) throw new Error(`model ${model.id} result has invalid comparability key`);
      if (!result.setting.trim()) throw new Error(`model ${model.id} result needs setting`);
    }
  }
  return root;
}

export function readFrontierRegistry(): FrontierRegistry {
  const path = join(process.cwd(), "server", "data", "frontier-models.json");
  return validateFrontierRegistry(JSON.parse(readFileSync(path, "utf-8")));
}

export function summarizeFrontierRegistry(registry: FrontierRegistry) {
  const dates = registry.models.map((model) => model.releaseDate).sort();
  return {
    asOf: registry.asOf,
    labCount: registry.labs.length,
    modelCount: registry.models.length,
    sourceCount: registry.sources.length,
    firstReleaseDate: dates[0] ?? null,
    lastReleaseDate: dates.at(-1) ?? null,
  };
}
```

- [ ] **Step 4: Build the normalized registry from primary sources**

Create `server/data/frontier-models.json` with this exact top-level shape:

```json
{
  "asOf": "2026-07-14",
  "methodology": "Major publicly documented general-purpose frontier releases. Scores remain in native benchmark units and are compared only when version, metric, and material evaluation settings match.",
  "labs": [],
  "benchmarks": [],
  "sources": [],
  "models": []
}
```

Populate at least these audited milestone families; include a release only after its official source resolves and its date is verified:

| Lab | Required milestone families |
|---|---|
| OpenAI | GPT-2, GPT-3, GPT-3.5/ChatGPT, GPT-4, GPT-4 Turbo, GPT-4o, o1, o3, GPT-5, GPT-5.2, GPT-5.4, GPT-5.5, GPT-5.6 Sol |
| Anthropic | Claude 1, Claude 2, Claude 3 Opus, Claude 3.5 Sonnet, Claude 3.7 Sonnet, Claude 4, Claude 4.5, Claude 4.6, Claude 4.8, Claude Fable 5 |
| Google DeepMind | PaLM, PaLM 2, Gemini 1.0 Ultra, Gemini 1.5 Pro, Gemini 2.0, Gemini 2.5 Pro, Gemini 3, Gemini 3.1 Pro |
| Meta | LLaMA, Llama 2, Llama 3, Llama 3.1 405B, Llama 4 Maverick |
| xAI / SpaceXAI | Grok-1, Grok-1.5, Grok-2, Grok-3, Grok-4, Grok-4.20, Grok-4.3, Grok-4.5 |
| DeepSeek | DeepSeek-V2, DeepSeek-V3, DeepSeek-R1, DeepSeek-V3.1, DeepSeek-V3.2 |
| Alibaba / Qwen | Qwen, Qwen2.5-Max, Qwen3-235B, Qwen3-Max-Thinking, Qwen3.5-397B-A17B |
| Mistral AI | Mistral Large, Mistral Large 2, Mistral Large 3 |
| Moonshot / Kimi | Kimi k1.5, Kimi K2, Kimi K2.5, Kimi K2.7 |
| Zhipu / GLM | GLM-4, GLM-4.5, GLM-5, GLM-5.2 |
| MiniMax | MiniMax-01, MiniMax-M1, MiniMax-M2, MiniMax-M2.5 |

For every model:

1. use the first documented public/API/open-weight/restricted-preview date;
2. set the matching release status;
3. add one factual sentence with no unsupported superlative;
4. attach at least one release source;
5. add only scores printed in the cited source or benchmark-owner record;
6. encode the complete material setting in `setting` and `comparabilityKey`;
7. mark no more than four representative receipt scores `featured`;
8. mark only era-defining models `milestone` so overview labels stay legible.

Start with official source roots and follow their model-specific pages:

- `https://openai.com/index/`
- `https://deploymentsafety.openai.com/`
- `https://www.anthropic.com/news`
- `https://www-cdn.anthropic.com/`
- `https://blog.google/technology/google-deepmind/`
- `https://ai.meta.com/blog/`
- `https://x.ai/news`
- `https://api-docs.deepseek.com/news/`
- `https://qwenlm.github.io/blog/`
- `https://mistral.ai/news`
- `https://github.com/MoonshotAI/`
- `https://z.ai/blog`
- `https://www.minimax.io/news`

Use independent scores only from the named evaluator's own page or methodology record. Store the evaluator as publisher and use `provenance: "independent"`.

- [ ] **Step 5: Run registry tests and correct every data-contract failure**

Run:

```bash
TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/frontier-models.test.ts
```

Expected: all registry tests PASS, at least 10 labs, at least 40 models, first release `2019-02-14`, last release `2026-07-09`.

- [ ] **Step 6: Commit the validated registry**

```bash
git add server/data/frontier-models.json server/frontier-models.ts server/__tests__/frontier-models.test.ts
git commit -m "Frontier Models: add cited model registry"
```

---

### Task 2: Expose the registry through a thin public endpoint

**Files:**

- Modify: `server/routes.ts:1-45`
- Modify: `server/routes.ts:3810-3920`
- Modify: `server/__tests__/frontier-models.test.ts`

**Interfaces:**

- Consumes: `readFrontierRegistry()` and `summarizeFrontierRegistry()` from Task 1.
- Produces: `GET /api/frontier-models` returning `{ ...registry, summary }`.

- [ ] **Step 1: Add a failing endpoint test using the repository's local Express pattern**

Append to `server/__tests__/frontier-models.test.ts`:

```ts
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-frontier-models";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

test("GET /api/frontier-models returns the validated registry and summary", async () => {
  const { registerRoutes } = await import("../routes");
  const app = express();
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/frontier-models`);
    assert.equal(response.status, 200);
    const body = await response.json() as ReturnType<typeof readFrontierRegistry> & { summary: { modelCount: number; labCount: number } };
    assert.equal(body.summary.modelCount, body.models.length);
    assert.equal(body.summary.labCount, body.labs.length);
    assert.equal(body.asOf, "2026-07-14");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

- [ ] **Step 2: Run the test and verify the 404 failure**

Run the focused command from Task 1.

Expected: registry tests PASS and endpoint test FAILS with status `404`.

- [ ] **Step 3: Add the import and route**

At the top of `server/routes.ts` add:

```ts
import { readFrontierRegistry, summarizeFrontierRegistry } from "./frontier-models";
```

Near the other GPU public routes add:

```ts
app.get("/api/frontier-models", (_req, res) => {
  try {
    const registry = readFrontierRegistry();
    res.json({ ...registry, summary: summarizeFrontierRegistry(registry) });
  } catch (err) {
    console.error("Frontier models read error:", err);
    res.status(500).json({ error: "Failed to load frontier models" });
  }
});
```

- [ ] **Step 4: Run focused and full server tests**

Run:

```bash
TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/frontier-models.test.ts
npm test
```

Expected: focused test PASS and the full suite has zero failures.

- [ ] **Step 5: Commit the endpoint**

```bash
git add server/routes.ts server/__tests__/frontier-models.test.ts
git commit -m "Frontier Models: expose registry endpoint"
```

---

### Task 3: Build chart-library-independent frontier transforms

**Files:**

- Create: `client/src/lib/frontier-series.ts`
- Create: `client/src/lib/__tests__/frontier-series.test.ts`

**Interfaces:**

- Consumes: the client-mirrored `FrontierRegistry` response shape.
- Produces: `parseFrontierDate`, `orderLabs`, `releaseRows`, `benchmarkOptions`, `benchmarkSeries`, `benchmarkCoverage`, `parseFrontierParams`, `writeFrontierParams`, `groupModelsByYear`, `solveFrontierLabels`, and related exported types.

- [ ] **Step 1: Write failing transform tests**

Create `client/src/lib/__tests__/frontier-series.test.ts` with fixtures for three labs and two benchmark configurations. Cover these exact behaviors:

```ts
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

it("keeps milestone labels, selected labels, and non-overlapping optional labels", () => {
  const labels = solveFrontierLabels([
    { id: "a", x: 100, width: 60, priority: 1 },
    { id: "b", x: 110, width: 60, priority: 3 },
    { id: "c", x: 240, width: 60, priority: 1 },
  ], 0, 400);
  assert.deepEqual(labels.map((label) => label.id), ["b", "c"]);
});
```

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run:

```bash
TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test client/src/lib/__tests__/frontier-series.test.ts
```

Expected: FAIL with `Cannot find module '../frontier-series'`.

- [ ] **Step 3: Implement the exported types and pure transforms**

Mirror the server response types locally. Implement date parsing with strict UTC round-trip validation. Sort labs by earliest included release and name as a tie-breaker. Sort models within every derived sequence by date, then name. Group benchmark results by `comparabilityKey`; never infer compatibility from benchmark ID alone. Keep URL parsing independent of `window` by accepting a query string, and keep serialization in a pure `frontierSearchParams(state)` function so it can be tested.

Implement label solving as deterministic greedy selection: sort candidates by descending priority, then ascending x, accept only candidates whose padded intervals do not overlap an accepted interval, and finally return accepted candidates sorted by x.

Use these exact public shapes:

```ts
export type FrontierLens = "releases" | "benchmark";
export interface FrontierViewState {
  lens: FrontierLens;
  family: BenchmarkFamily | null;
  benchmarkId: string | null;
  comparabilityKey: string | null;
  labIds: string[];
  modelId: string;
}
export interface ReleaseRow { lab: FrontierLab; models: FrontierModel[]; }
export interface BenchmarkPoint { model: FrontierModel; lab: FrontierLab; result: FrontierBenchmarkResult; t: number; }
export interface YearGroup { year: number; models: FrontierModel[]; }
```

- [ ] **Step 4: Run focused tests, typecheck, and commit**

Run:

```bash
TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test client/src/lib/__tests__/frontier-series.test.ts
npm run check
```

Expected: all frontier-series tests PASS and TypeScript reports zero errors.

Commit:

```bash
git add client/src/lib/frontier-series.ts client/src/lib/__tests__/frontier-series.test.ts
git commit -m "Frontier Models: add timeline transforms"
```

---

### Task 4: Render the desktop Frontier Relay and benchmark lens

**Files:**

- Create: `client/src/components/frontier-relay-chart.tsx`
- Modify: `client/src/lib/frontier-series.ts`
- Modify: `client/src/lib/__tests__/frontier-series.test.ts`

**Interfaces:**

- Consumes: `ReleaseRow[]`, `BenchmarkPoint[]`, registry labs and benchmarks, selected model ID, visible lab IDs, lens, and measured width.
- Produces: `FrontierRelayChart` with keyboard-selectable model stamps and `onSelectModel(modelId)`.

- [ ] **Step 1: Add geometry tests before chart code**

Extend `frontier-series` with tested helpers:

```ts
export interface TimeDomain { start: number; end: number; }
export interface ScoreDomain { min: number; max: number; ticks: number[]; }
export function frontierTimeDomain(models: FrontierModel[], asOf: string): TimeDomain;
export function scoreDomain(points: BenchmarkPoint[], unit: BenchmarkUnit, higherIsBetter: boolean): ScoreDomain;
export function modelAriaLabel(model: FrontierModel, lab: FrontierLab): string;
```

Tests must assert a fixed `2019-02-14` start, the registry cutoff end, padded percentage domains clamped to `0..100`, non-clamped Elo domains, and an accessible label containing lab, model, date, and release status.

- [ ] **Step 2: Run the geometry tests and verify they fail**

Run the focused client command from Task 3.

Expected: FAIL because the new helpers are not exported.

- [ ] **Step 3: Implement minimal geometry helpers and pass tests**

Use native UTC milliseconds. Give percentage charts 5 percentage points of visual padding and clamp them to 0 through 100. Give other units 8 percent of observed span, with a minimum span of 1. Produce 4 to 6 monotonic ticks. Do not add regression or interpolation helpers.

- [ ] **Step 4: Create the chart component**

Implement `client/src/components/frontier-relay-chart.tsx` with this public interface:

```tsx
export interface FrontierRelayChartProps {
  width: number;
  height: number;
  registry: FrontierRegistry;
  lens: FrontierLens;
  releaseRows: ReleaseRow[];
  benchmarkPoints: BenchmarkPoint[];
  benchmark: BenchmarkDefinition | null;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

export default function FrontierRelayChart(props: FrontierRelayChartProps): JSX.Element;
```

Release rendering requirements:

- left label rail is 112 px and right padding is 28 px;
- top axis is 34 px; each lab lane is 48 px;
- year ticks use `CHART_CHROME.tick` and low-contrast rules;
- era bands are derived from fixed boundaries `2019-02-14`, `2022-11-30`, `2024-05-13`, `2024-09-12`, and `2025-01-01`, but era copy stays structural and does not claim a single causal event;
- lab lanes use neutral rules and direct lab names;
- selected model draws the `#F07800` vertical cursor and receipt anchor;
- model stamps use lab color plus the lab glyph; selected stamps add an orange ring;
- every stamp is a transparent SVG `<button>` equivalent implemented as focusable `<g role="button" tabIndex={0}>` with Enter and Space activation;
- permanent labels come only from selected or collision-solved milestone candidates;
- hover may reveal a temporary label but must not be required to obtain data.

Benchmark rendering requirements:

- y-axis and ticks use the benchmark native unit;
- points show provenance through solid fill for benchmark-owner, hollow fill for lab, and cross-hatched fill for independent;
- same-lab segments connect only points already filtered to the identical comparability key;
- draw a benchmark-introduction marker when `introducedAt` is available;
- no trend line, fitted curve, score normalization, or cross-key connection.

- [ ] **Step 5: Run typecheck and commit the renderer**

Run:

```bash
npm run check
```

Expected: zero TypeScript errors.

Commit:

```bash
git add client/src/components/frontier-relay-chart.tsx client/src/lib/frontier-series.ts client/src/lib/__tests__/frontier-series.test.ts
git commit -m "Frontier Models: render release and benchmark charts"
```

---

### Task 5: Build the embedded Frontier page, receipt, sources, and mobile ledger

**Files:**

- Create: `client/src/pages/frontier-models.tsx`
- Create: `docs/FRONTIER_MODEL_METHODOLOGY.md`

**Interfaces:**

- Consumes: `GET /api/frontier-models`, client transforms, `FrontierRelayChart`, `Card`, `Skeleton`, `ErrorState`, `SrChartTable`, `UITooltip`, `useMeasuredWidth`, and shared tokens.
- Produces: default export `FrontierModels({ embedded?: boolean })`.

- [ ] **Step 1: Implement query and URL-persisted page state**

Use:

```tsx
const query = useQuery<FrontierRegistry>({ queryKey: ["/api/frontier-models"] });
```

On first valid data, parse `window.location.search` with `parseFrontierParams`. On state changes, merge only `lens`, `family`, `benchmark`, `compare`, `labs`, and `model` into the current query string, preserving `tab=frontier`. Use `window.history.replaceState` as existing GPU chart state does.

Default state:

- lens: releases;
- all labs visible;
- selected model: latest release;
- no benchmark until a capability family is selected.

- [ ] **Step 2: Implement the compact controls and evidence header**

Render:

- `Feb 2019 - Jul 2026` coverage;
- model and lab counts from `summary`;
- `verified through Jul 14, 2026`;
- All releases plus General, Reasoning, Coding, Agents, and Multimodal controls;
- exact benchmark select and comparability-setting select when a family is active;
- lab visibility chips with direct labels and stable colors;
- `Show all labs` when the filter becomes empty.

Use `data-testid` values `frontier-lens-releases`, `frontier-family-<family>`, `frontier-benchmark`, `frontier-compare`, and `frontier-lab-<id>`.

- [ ] **Step 3: Add chart loading, error, sparse, and accessible-table states**

- loading: one `h-[560px]` chart skeleton and one receipt skeleton;
- query error: existing `ErrorState` with `query.refetch()`;
- benchmark with fewer than two comparable points: cited value list and the copy `No like-for-like series is available for this exact evaluation setup.`;
- zero visible labs: `Show all labs` button;
- desktop: chart hidden below `md` and sized from measured width;
- accessible release table columns: Date, Lab, Model, Status;
- accessible benchmark table columns: Date, Lab, Model, Score, Setting, Provenance.

- [ ] **Step 4: Implement the model receipt**

The receipt uses the selected model and normalized source lookup. Render model, lab, exact date, status, factual summary, modalities, context window or `not published`, up to four `featured` results, provenance label, setting, and direct source links. If no featured result exists, render `No directly comparable benchmark result was published in the tracked source set.`

Use `rel="noreferrer"`, open external citations in a new tab, and label links by source title rather than raw URL. Add `data-testid="frontier-receipt"` and `frontier-source-<source-id>`.

- [ ] **Step 5: Implement the narrow chronological ledger**

Below `md`, hide the SVG and render year groups descending from the cutoff. Each entry is a real button showing date, lab glyph, model, status, and at most one featured score. Selecting it expands the shared receipt immediately after that entry. Do not introduce horizontal page scrolling.

- [ ] **Step 6: Add methodology documentation and in-page note**

Create `docs/FRONTIER_MODEL_METHODOLOGY.md` with the inclusion rule, source hierarchy, result provenance, comparability-key policy, cutoff, manual update checklist, and explicit rejection of a universal index. Link to the document concept through an in-page expandable methodology block; because local docs are not a production URL, render the same concise method copy in the UI rather than linking to a filesystem path.

- [ ] **Step 7: Typecheck and commit the page**

Run:

```bash
npm run check
```

Expected: zero errors.

Commit:

```bash
git add client/src/pages/frontier-models.tsx docs/FRONTIER_MODEL_METHODOLOGY.md
git commit -m "Frontier Models: add relay research tab"
```

---

### Task 6: Integrate the Frontier tab without changing existing GPU views

**Files:**

- Modify: `client/src/pages/neocloud-intel.tsx:25-111`
- Modify: `client/src/pages/neocloud-intel.tsx:240-290`
- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: `FrontierModels` default export and existing `useToolTabs`.
- Produces: `/neocloud-intel?tab=frontier` while retaining Prices default and Economics behavior.

- [ ] **Step 1: Add the import and tab entry**

Add:

```tsx
import FrontierModels from "@/pages/frontier-models";
```

Change `GPU_TABS` to:

```ts
const GPU_TABS = [
  { id: "prices", label: "Prices" },
  { id: "economics", label: "Economics" },
  { id: "frontier", label: "Frontier" },
];
```

- [ ] **Step 2: Render the third branch explicitly**

Replace the two-way conditional with a three-way branch. Keep every line of the current Prices fragment unchanged inside the final branch:

```tsx
{tab === "economics" ? (
  <GpuEconomics embedded />
) : tab === "frontier" ? (
  <FrontierModels embedded />
) : (
  existingPricesFragment
)}
```

`existingPricesFragment` above denotes the current inline Prices JSX beginning with the price-card loading branch and ending with the methodology paragraph. Do not create a variable with that name; retain the existing fragment in place.

Do not move or refactor Prices content beyond the conditional wrapper.

- [ ] **Step 3: Update project context**

In `CLAUDE.md` update GPU Prices to state that it contains Prices, Economics, and Frontier tabs. Add `/api/frontier-models` to public read endpoints and `server/data/frontier-models.json` to hand-curated data custody. State that benchmark results require citations and exact comparability keys.

- [ ] **Step 4: Run focused tests, full tests, typecheck, and build**

Run:

```bash
TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/frontier-models.test.ts client/src/lib/__tests__/frontier-series.test.ts
npm test
npm run check
npm run build
```

Expected: all tests PASS, TypeScript reports zero errors, and production build completes.

- [ ] **Step 5: Commit integration**

```bash
git add client/src/pages/neocloud-intel.tsx CLAUDE.md
git commit -m "GPU Prices: integrate frontier model relay"
```

---

### Task 7: Audit citations and verify the finished feature visually

**Files:**

- Review and modify when the audit finds an issue: `server/data/frontier-models.json`
- Review and modify when the audit finds an issue: `client/src/components/frontier-relay-chart.tsx`
- Review and modify when the audit finds an issue: `client/src/pages/frontier-models.tsx`
- Review and modify when the audit finds an issue: `docs/FRONTIER_MODEL_METHODOLOGY.md`

**Interfaces:**

- Consumes: complete implementation and original cited sources.
- Produces: a verified, buildable feature with a clean worktree.

- [ ] **Step 1: Run an automated citation and source-domain audit**

Use the validator tests, then inspect all unique source URLs. Confirm that every URL is HTTPS, every model has a release citation, every score source exists, and primary sources are used when available. For secondary sources retained because no primary fact is available, make the limitation explicit in `locator`.

Run:

```bash
TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/frontier-models.test.ts
```

Expected: PASS with no unresolved identifiers.

- [ ] **Step 2: Start the app and inspect desktop**

Run:

```bash
npm run dev
```

Open `/neocloud-intel?tab=frontier` at about 1440 x 900. Verify:

- existing shell and compact GPU header remain intact;
- all lab lanes are readable;
- no milestone labels collide;
- selecting GPT-2 and GPT-5.6 Sol moves the cursor and updates the receipt;
- benchmark family and exact-setting controls never mix comparability keys;
- citations open the intended primary pages;
- Prices and Economics tabs still render unchanged.

- [ ] **Step 3: Inspect narrow layout and keyboard operation**

At about 390 x 844, verify the SVG is replaced by the year ledger, controls wrap without overflow, expanding a receipt keeps context, and there is no horizontal page scroll. Use Tab, Shift-Tab, Enter, and Space to operate tabs, filters, model stamps or ledger entries, and citations. Enable reduced motion and confirm the cursor and receipt no longer transition.

- [ ] **Step 4: Self-critique and remove one nonessential visual treatment**

Compare the implementation with the approved design. Remove any decorative glow, redundant border, repeated legend, or animation that does not clarify chronology, provenance, or selection. Keep the date cursor and model receipt as the single signature treatment.

- [ ] **Step 5: Run final verification from a clean process**

Stop the dev server, then run:

```bash
npm test
npm run check
npm run build
git diff --check
git status --short
```

Expected: tests PASS, typecheck PASS, build PASS, no whitespace errors, and only intentional changes are present.

- [ ] **Step 6: Commit audit corrections if the audit changed files**

```bash
git add server/data/frontier-models.json client/src/components/frontier-relay-chart.tsx client/src/pages/frontier-models.tsx docs/FRONTIER_MODEL_METHODOLOGY.md
git commit -m "Frontier Models: finish source and visual audit"
```

If Step 4 made no changes, do not create an empty commit.

## Completion Criteria

- `/neocloud-intel?tab=frontier` is directly shareable.
- Registry cutoff is 2026-07-14 and spans GPT-2 on 2019-02-14 through GPT-5.6 Sol on 2026-07-09.
- At least 10 labs and 40 material frontier models are included with release citations.
- Every benchmark result resolves to a source and retains native unit, provenance, setting, and comparability key.
- Release view, exact benchmark view, model receipt, source ledger, mobile ledger, and accessible tables are present.
- No synthetic intelligence index, interpolation, rumor, or uncited score appears.
- Existing Prices and Economics tabs remain unchanged.
- Full tests, TypeScript, production build, desktop review, narrow review, keyboard review, reduced-motion review, and citation spot checks pass.
