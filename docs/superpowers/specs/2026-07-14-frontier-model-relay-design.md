# Frontier Model Relay

**Date:** 2026-07-14

**Status:** Approved for implementation

**Scope:** A third tab inside the existing GPU Prices tool that tracks major frontier-model releases and their cited benchmark results from GPT-2 through GPT-5.6 Sol.

## Goal

Give a citizen-investor a clear, accurate view of how frontier AI models progressed from February 2019 through July 2026 without presenting incompatible benchmarks as one universal intelligence score.

The feature must answer three questions quickly:

1. Which labs released material frontier models, and when?
2. What changed at each release?
3. How do models compare when the same benchmark and evaluation setup are available?

The implementation belongs in GPU Prices as a compact research add-on, not as a new sidebar module or standalone route.

## Product Decision

Add a `Frontier` tab beside `Prices` and `Economics` on `/neocloud-intel`. The tab has two truthful views of the same curated dataset:

1. **All releases:** a horizontal lab-lane timeline called the Frontier Relay. Time is the only quantitative axis. Each model appears at its official public release or preview date.
2. **Benchmark lens:** a native-score time chart for one exact benchmark configuration. The y-axis uses the benchmark's published unit. Models are never compared across incompatible benchmark versions, metrics, tool settings, or reasoning configurations.

This combines the readability of a release timeline with the rigor of benchmark-specific comparison. It rejects a synthetic composite index because the benchmark suite, elicitation methods, and capability categories changed too much between 2019 and 2026 for one number to remain stable.

## Alternatives Considered

### Composite intelligence step chart

This most closely resembles the reference charts. It is visually familiar and makes lab handoffs easy to see, but it quietly depends on normalization, benchmark weighting, interpolation, and changing test suites. The result would imply more comparability than the underlying evidence supports.

### Benchmark small multiples

One chart per benchmark is methodologically clean, but the page becomes dense and repetitive. Older models disappear from newer panels, while the release story becomes hard to follow.

### Frontier Relay with benchmark lens - selected

The release view carries the seven-year narrative without inventing a score. The benchmark lens supports exact comparisons on demand. A shared model receipt connects the two views.

## Scope and Inclusion Rules

The initial registry covers major general-purpose frontier releases from:

- OpenAI
- Anthropic
- Google DeepMind
- Meta
- xAI / SpaceXAI
- DeepSeek
- Alibaba / Qwen
- Mistral AI
- Moonshot AI / Kimi
- Zhipu AI / GLM
- MiniMax
- other labs only when a release meets the same documented inclusion rule

A model is included when it was officially documented and publicly released, offered through an API, released as weights, or made available through a documented restricted preview, and it satisfies at least one of these conditions:

- it was the lab's new flagship general-purpose model;
- it materially moved a published frontier benchmark;
- it established a new open-weight frontier;
- it introduced a material capability shift such as multimodality, test-time reasoning, computer use, or long-horizon agents.

Minor aliases, silent checkpoints, fine-tunes, specialist-only models, and unverified rumored releases are excluded. A point release is included only when the lab published materially different capabilities or evaluation results. Each included record carries an `inclusionReason` so the editorial boundary is auditable.

The timeline begins with the announced staged release of GPT-2 on 2019-02-14. The record identifies it as a staged release rather than implying that all weights were available on that day. The initial data cutoff is 2026-07-14 and ends with the latest documented releases, including GPT-5.6 Sol from 2026-07-09.

## Evidence and Citation Policy

Every release date, benchmark score, and factual capability claim must reference a source record. Preferred evidence order is:

1. official model announcement, technical report, or system card;
2. benchmark-owner leaderboard or report;
3. independent standardized evaluator such as Artificial Analysis;
4. reputable secondary reporting only when it establishes a release detail absent from primary material.

Lab-reported, benchmark-owner, and independent results are visibly distinguished. A source record includes publisher, title, URL, publication date, access date, and a short locator or methodology note.

Benchmark values are stored with their evaluation configuration, including version, split, metric, pass count, tool availability, reasoning effort, and reported unit when those details are available. A `comparabilityKey` identifies values safe to plot together. The key changes whenever a material evaluation condition changes.

Rules:

- no score without a citation;
- no missing result represented as zero;
- no interpolated or estimated benchmark observations;
- no conversion of native scores into a GridTilt intelligence index;
- no lab-to-lab line connection unless both points share the same comparability key;
- a result with incomplete setup metadata may appear in the model receipt but not in the comparison plot;
- benchmark contamination or deprecated methodology notes remain visible when identified by the publisher or benchmark owner.

## Benchmark Taxonomy

Benchmarks are grouped for navigation, not combined mathematically.

### General knowledge

Legacy and contemporary examples include LAMBADA, MMLU, MMLU-Pro, Humanity's Last Exam, and Artificial Analysis Intelligence Index versions. Each exact benchmark remains a separate option.

### Reasoning and mathematics

Examples include GSM8K, MATH, MATH-500, AIME by year and scoring protocol, GPQA Diamond, FrontierMath by version and tier, and ARC-AGI by version.

### Coding

Examples include HumanEval, SWE-bench Verified, SWE-bench Pro, DeepSWE, and Terminal-Bench by version and harness.

### Agents and computer use

Examples include OSWorld, BrowseComp, tau-bench variants, Toolathlon, and other benchmark-owner agent evaluations with reproducible configurations.

### Multimodal

Examples include MMMU and MMMU-Pro, with tools and no-tools configurations separated.

The interface first selects a capability family, then an exact benchmark. Changing family never silently averages or substitutes benchmarks.

## Data Architecture

### Curated registry

Add `server/data/frontier-models.json` as a hand-curated source registry. Runtime code never writes this file.

The top-level shape is:

```ts
interface FrontierRegistry {
  asOf: string;
  methodology: string;
  labs: FrontierLab[];
  benchmarks: BenchmarkDefinition[];
  sources: FrontierSource[];
  models: FrontierModel[];
}
```

Important record fields:

```ts
interface FrontierModel {
  id: string;
  labId: string;
  name: string;
  family: string;
  releaseDate: string;
  releaseStatus: "preview" | "general" | "open-weights" | "restricted";
  inclusionReason: "flagship" | "frontier-move" | "open-weight-frontier" | "capability-shift";
  modalities: string[];
  contextWindow: number | null;
  summary: string;
  sourceIds: string[];
  benchmarks: FrontierBenchmarkResult[];
}

interface FrontierBenchmarkResult {
  benchmarkId: string;
  comparabilityKey: string;
  score: number;
  unit: "percent" | "elo" | "index" | "seconds" | "minutes" | "hours";
  provenance: "lab" | "benchmark-owner" | "independent";
  sourceId: string;
  setting: string;
  featured?: boolean;
}
```

The JSON remains normalized: model results reference benchmark and source identifiers rather than repeating source metadata.

### Server module and endpoint

Add `server/frontier-models.ts` to load and validate the registry and expose pure filtering helpers. Add a thin public route:

`GET /api/frontier-models`

The response returns the validated registry. The endpoint requires no external service and therefore has no fabricated fallback. Invalid committed data is a build/test failure. An unexpected runtime read error returns `500` with a concise error payload and server log.

### Client transforms

Add `client/src/lib/frontier-series.ts` for chart-library-independent logic:

- date parsing and chronological ordering;
- stable lab-lane ordering;
- era band generation;
- release-view geometry inputs;
- capability-family and benchmark filtering;
- comparability-key enforcement;
- latest-score and coverage summaries;
- URL-state parsing and serialization;
- collision-aware label candidates;
- mobile year grouping.

The page component consumes these derived structures but does not own research logic.

## Interface Structure

### GPU Prices integration

Extend `GPU_TABS` in `client/src/pages/neocloud-intel.tsx`:

```ts
[
  { id: "prices", label: "Prices" },
  { id: "economics", label: "Economics" },
  { id: "frontier", label: "Frontier" },
]
```

The existing `useToolTabs` URL behavior makes `/neocloud-intel?tab=frontier` directly shareable. The Prices and Economics views remain unchanged.

Add `client/src/pages/frontier-models.tsx` with an `embedded` presentation matching GPU Economics. A complex chart renderer may live in `client/src/components/frontier-relay-chart.tsx`; small receipt, legend, source, and control components remain private to the page.

### Header strip

The embedded tab begins with a compact evidence line rather than a second page hero:

- coverage: `Feb 2019 - Jul 2026`;
- number of included models and labs;
- source cutoff: `verified through Jul 14, 2026`;
- methodology link or popover.

### View controls

The first control is `All releases`. Capability-family controls follow: `General`, `Reasoning`, `Coding`, `Agents`, and `Multimodal`.

Selecting a capability family reveals an exact benchmark selector. The selected benchmark, lab visibility, and selected model persist in query parameters alongside `tab=frontier`:

- `lens=releases` or `lens=benchmark`;
- `benchmark=<benchmark-id>`;
- `labs=<comma-separated-lab-ids>`;
- `model=<model-id>`.

Invalid or stale parameters fall back to All releases without breaking the page.

## Frontier Relay View

Desktop renders a wide SVG using the existing visx primitives and GridTilt chart tokens.

- x-axis: official release date from February 2019 through the registry cutoff;
- y-axis: one labeled lane per lab, ordered by first qualifying release and then held stable;
- lane line: a quiet neutral rule, not a performance trajectory;
- model stamp: a small lab-coded glyph at the exact date;
- milestone label: permanently visible for the most consequential releases;
- other included models: visible stamps with names on focus, hover, or selection;
- era bands: restrained structural bands for foundation, chat, multimodal, reasoning, and agent eras;
- date cursor: a thin luminous vertical rule that moves to the selected model;
- current endpoint: a subtle `Jul 2026` edge marker, not a projection.

The chart avoids rainbow step lines. Lab color appears in stamps, short labels, and the receipt border. Selection uses GridTilt orange. Text and glyph shape ensure that color is not the sole identifier.

Clicking or focusing a model selects it and opens the model receipt. Hover is supplementary; every interaction is keyboard accessible.

## Benchmark Lens

The benchmark lens uses the same time axis and replaces lab lanes with a native score axis.

- only results matching the selected `comparabilityKey` are plotted;
- each point is positioned at the model release date and exact published score;
- same-lab points may connect with a thin line only when the exact evaluation configuration matches;
- provenance changes point treatment: lab-reported, benchmark-owner, and independent results use distinct fill patterns;
- tooltip and receipt show score, unit, setup, provenance, date, and source;
- the control shows coverage such as `18 models from 7 labs`;
- a benchmark-introduction marker explains why older models are absent;
- if fewer than two comparable values exist, the page shows the cited values as a receipt list rather than drawing a misleading chart.

There is no trend line, interpolation, or composite frontier curve.

## Model Receipt

The selected model opens a compact panel below or beside the chart, depending on width. It contains:

- model and lab;
- exact release date and release status;
- one-sentence factual summary;
- context window and modalities when officially documented;
- two to four featured benchmark results in native units;
- a provenance label on every result;
- direct links to all supporting sources;
- a note when no directly comparable score was published.

The receipt is the feature's signature element. It turns every plotted stamp into an inspectable evidence object instead of relying on an overloaded tooltip.

## Source Ledger and Methodology

A compact source ledger follows the visualization. It groups citations by selected model by default and can expand to all sources. Links use the official source title, publisher, publication date, and access date. Raw URLs are not used as primary labels.

The methodology note explains:

- how releases qualify;
- why native benchmarks cannot be merged into one score;
- the difference between lab-reported and independent results;
- why evaluation setup matters;
- the data cutoff and manual update process.

## Visual Direction

The feature inherits the existing GridTilt system:

- background and borders from the shared warm-charcoal tokens;
- Inter for interface copy;
- JetBrains Mono for dates, model names, scores, and citations;
- `#F07800` for selection and active controls;
- lab colors used sparingly on stamps and identifiers;
- square-to-soft card corners consistent with existing GPU cards;
- low-contrast grid and lane rules;
- no gradients, decorative glow fields, or oversized hero copy.

The single aesthetic risk is the moving evidence cursor paired with the receipt. It should feel like inspecting a historical instrument trace, not browsing a leaderboard.

Motion is limited to the cursor and receipt transition. `prefers-reduced-motion` removes both transitions.

## Responsive Behavior

At narrow widths the horizontal SVG becomes a vertical chronological ledger grouped by year. Each entry shows date, lab mark, model, status, and one featured cited score when available. Selecting an entry opens the same receipt inline.

The mobile view does not use horizontal page scrolling and does not shrink labels below readable sizes. Capability and benchmark controls wrap into a two-row control strip.

## Accessibility

- all model stamps are keyboard-focusable buttons with model, lab, date, and status in their accessible name;
- focus and selection states are visually distinct;
- every chart has a concise `aria-label`;
- an `SrChartTable` equivalent exposes release dates or benchmark values as real table content;
- color is reinforced by lab text, glyph shape, and provenance pattern;
- tooltips never contain the only copy of a value or citation;
- mobile ledger provides a fully non-graphical representation;
- reduced motion is respected.

## Loading, Empty, and Error States

- loading uses a chart-shaped skeleton and receipt placeholder;
- endpoint failure renders the existing `ErrorState` with retry;
- an exact benchmark with no comparable values explains that no like-for-like results are published;
- a filtered set with no labs selected offers `Show all labs`;
- an invalid selected model is removed from URL state and the latest release is selected;
- missing optional metadata renders `not published`, never an invented value;
- malformed committed registry data fails validation and tests rather than being partially displayed.

## Testing

### Server

Add tests for:

- registry schema and cutoff date;
- unique lab, model, benchmark, and source identifiers;
- valid release dates and chronological bounds;
- at least one valid citation per model;
- a valid source for every benchmark result;
- finite scores and valid units;
- comparability keys that resolve to one benchmark version and setup;
- endpoint response and runtime read failure behavior.

### Client pure logic

Add tests for:

- stable lab ordering and chronological release ordering;
- exact benchmark filtering;
- incompatible comparability keys never sharing a plotted series;
- coverage summaries;
- empty and single-result benchmark states;
- URL-state parsing and stale-parameter fallback;
- mobile year grouping;
- label priority and collision candidates.

### Final verification

Run:

- `npm test`
- `npm run check`
- `npm run build`
- desktop visual inspection around 1440 x 900;
- narrow visual inspection around 390 x 844;
- keyboard traversal of controls, model stamps, receipts, and source links;
- reduced-motion verification;
- citation spot checks against the original primary sources.

## Explicit Non-Goals

- no universal GridTilt intelligence index;
- no training-compute estimates unless a later feature adds separately sourced data;
- no model pricing comparison in this tab;
- no safety, popularity, or subjective quality ranking;
- no rumor or unreleased-model tracking;
- no automated scraping or unattended data mutation;
- no changes to the existing GPU Prices and Economics data contracts.

## Delivery Shape

The work will be implemented in small, area-prefixed commits:

1. frontier registry, validator, endpoint, and server tests;
2. client transforms and unit tests;
3. Frontier Relay and benchmark lens;
4. GPU tab integration, model receipt, citations, mobile layout, and final polish;
5. verification documentation.

As with every GridTilt change, a Git push does not deploy production. Replit must be manually redeployed after the finished branch is merged.
