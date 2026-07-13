# GPU Pipeline and Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver observable GPU ingestion, recoverable raw history, an honest coverage-aware price chart, and deterministic GPU economics charts.

**Architecture:** Keep provider I/O outcomes structured through the live-price sweep, summarize persisted history with pure functions, and expose both through thin Express routes. Keep chart decisions in pure client libraries, render the dual-methodology history with visx, and render deterministic economics views with Recharts.

**Tech Stack:** TypeScript 5.6, Node test runner, Express 5, React 18, TanStack Query, visx 4, Recharts 2.15, Tailwind 3

## Global Constraints

- Dark mode only.
- Brand orange is literal `#F07800`; AMD is `#22D3EE` on GPU pages.
- JetBrains Mono is used for numeric and data text.
- New files use kebab-case.
- Client reads use `useQuery({ queryKey: ["/api/x"] })`.
- Client API interfaces remain local to each page.
- Interactive elements carry `data-testid`.
- Server additions are pure logic plus a thin route plus Node tests.
- Never fabricate, smooth, or present interpolated values as observations.
- `computeGpuIndex` period changes remain `null` without a nearby real point.
- `server/data/gpu-rental-prices.json` schema is unchanged.
- The `CLAUDE.md` do-not-touch list is unchanged.
- The history chart remains visx-only. Recharts renders the economics charts.
- Commits use imperative, area-prefixed subjects and no `Co-Authored-By` lines.

---

### Task 1: Structured live-provider outcomes

**Files:**
- Modify: `server/gpu-live.ts`
- Modify: `server/__tests__/gpu-live.test.ts`
- Modify: `server/routes.ts`

**Interfaces:**
- Produces: `ProviderRequestResult<T>`, `GpuSweepSummary`, `LiveSweepResult`, and `fetchLivePrices(...): Promise<LiveSweepResult>`.
- Consumes: Existing RunPod and Vast parsers and `LiveModelPrice` blending.

- [ ] **Step 1: Write failing tests for HTTP, thrown, partial, and total failures**

Add fixture responses with optional `status` and assertions shaped like:

```ts
const result = await fetchLivePrices(CURATED, fetchFixture);
assert.equal(result.summary.ok, false);
assert.deepEqual(result.summary.perProvider.runpod, {
  requests: 1,
  succeeded: 0,
  failed: 1,
  observations: 0,
});
assert.ok(result.prices.H100);
```

Capture `console.error` and assert messages contain `gpu-live`, the provider name, and `status 503` for non-OK responses.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/gpu-live.test.ts`

Expected: FAIL because `fetchLivePrices` still returns only the price record and silent provider functions expose no failure counts.

- [ ] **Step 3: Implement typed provider request results**

Add these public shapes and preserve successful-empty as distinct from failure:

```ts
export interface ProviderCounts {
  requests: number;
  succeeded: number;
  failed: number;
  observations: number;
}

export interface GpuSweepSummary {
  date: string;
  ok: boolean;
  perProvider: { runpod: ProviderCounts; vast: ProviderCounts };
  usableModels: number;
}

export interface LiveSweepResult {
  prices: Record<string, LiveModelPrice>;
  summary: GpuSweepSummary;
}
```

Extend `FetchLike` responses with `status?: number`, return structured results from provider fetches, and log provider, status, and error reason with `console.error`. Aggregate request and parsed-observation counts in `fetchLivePrices`. Set `ok` only when the failure total is zero.

Keep the route compiling by destructuring `prices` at its existing call site; Task 3 retains the summary in the metrics health response.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/gpu-live.test.ts && npm run check`

Expected: provider tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/gpu-live.ts server/__tests__/gpu-live.test.ts server/routes.ts
git commit -m "GPU Prices: report provider sweep failures"
```

### Task 2: History health and dispersion metadata

**Files:**
- Modify: `server/gpu-history.ts`
- Modify: `server/gpu-index.ts`
- Modify: `server/__tests__/gpu-index.test.ts`
- Create: `server/__tests__/gpu-history.test.ts`

**Interfaces:**
- Produces: `summarizeGpuHistory(snapshots): { recordedDays; lastRecordedDate }`.
- Produces: merged `GpuHistoryAnchor` values with optional `low`, `high`, `sources`, and `n`.
- Consumes: existing `Snapshot` and `SnapshotMeta` shapes.

- [ ] **Step 1: Write failing history-summary and metadata tests**

Use snapshots containing live, curated, out-of-order, and legacy entries:

```ts
assert.deepEqual(summarizeGpuHistory(snapshots), {
  recordedDays: 2,
  lastRecordedDate: "2026-07-13",
});
```

Add an index test that merges a monthly anchor and recorded point, then asserts only the recorded point carries:

```ts
{ low: 2.1, high: 2.9, sources: ["runpod-secure", "vast"], n: 2 }
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/gpu-history.test.ts server/__tests__/gpu-index.test.ts`

Expected: FAIL because the summary function and enriched anchor fields do not exist.

- [ ] **Step 3: Implement pure summary and enriched recorded series**

Extend `GpuHistoryAnchor`:

```ts
export interface GpuHistoryAnchor {
  date: string;
  price: number;
  low?: number;
  high?: number;
  sources?: string[];
  n?: number;
}
```

`summarizeGpuHistory` counts distinct `source === "live"` dates and chooses the lexicographically latest live date. `recordedByModel` copies snapshot metadata onto recorded points. `computeGpuIndex` deduplicates whole point objects so recorded same-date metadata survives while all existing change-window calculations continue to use only `date` and `price`.

- [ ] **Step 4: Run focused tests and full index regression**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/gpu-history.test.ts server/__tests__/gpu-index.test.ts`

Expected: PASS, including the existing null-over-fabrication period tests.

- [ ] **Step 5: Commit**

```bash
git add server/gpu-history.ts server/gpu-index.ts server/__tests__/gpu-history.test.ts server/__tests__/gpu-index.test.ts
git commit -m "GPU Prices: preserve live history provenance"
```

### Task 3: Health response and protected raw-history route

**Files:**
- Modify: `server/routes.ts`
- Modify: `server/__tests__/auth-boundary.test.ts`
- Create: `server/__tests__/gpu-routes.test.ts`

**Interfaces:**
- Consumes: `LiveSweepResult`, `summarizeGpuHistory`, and `readGpuHistory`.
- Produces: `/api/gpu-prices/metrics.health` and `GET /api/admin/gpu-history`.

- [ ] **Step 1: Write failing route tests**

Start the existing offline Express test server and assert:

```ts
const metrics = await fetch(`${url}/api/gpu-prices/metrics`).then((r) => r.json());
assert.equal(typeof metrics.health.recordedDays, "number");
assert.ok("lastRecordedDate" in metrics.health);
assert.ok("lastSweep" in metrics.health);
assert.equal(metrics.health.curatedLastRefreshed, metrics.lastRefreshed);
```

For the admin route, verify a correct key returns an array and no key returns `401` or `429`. Add `GET /api/admin/gpu-history` to `PROTECTED_ROUTES`.

- [ ] **Step 2: Run route tests and verify failure**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/gpu-routes.test.ts server/__tests__/auth-boundary.test.ts`

Expected: FAIL because the health object and route are absent.

- [ ] **Step 3: Implement thin route integration**

Maintain `let lastGpuSweep: GpuSweepSummary | null = null` beside the existing in-flight guard. Update the background sweep to:

```ts
.then(({ prices, summary }) => {
  lastGpuSweep = summary;
  recordDailyLivePrices(prices);
})
```

Build health from `summarizeGpuHistory(readGpuHistory())`, `lastGpuSweep`, and `root.lastRefreshed`. Add:

```ts
app.get("/api/admin/gpu-history", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(readGpuHistory());
});
```

- [ ] **Step 4: Run route tests and typecheck**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test server/__tests__/gpu-routes.test.ts server/__tests__/auth-boundary.test.ts && npm run check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts server/__tests__/gpu-routes.test.ts server/__tests__/auth-boundary.test.ts
git commit -m "GPU Prices: expose pipeline health and raw history"
```

### Task 4: Weekly history backup workflow and operations docs

**Files:**
- Create: `ops/n8n/gpu-history-backup.json`
- Modify: `ops/n8n/README.md`

**Interfaces:**
- Consumes: `GET https://gridtilt.com/api/admin/gpu-history`, a GridTilt admin HTTP Header Auth credential, and the existing GitHub PAT credential.
- Produces: weekly commits replacing `server/data/gpu-price-history.json` on `main`.

- [ ] **Step 1: Build an importable n8n workflow**

Create nodes for a weekly schedule, raw-history request, validation and serialization, GitHub current-file lookup, commit payload creation, GitHub PUT, and notification. The validation Code node must enforce:

```js
if (!Array.isArray(history)) throw new Error("GPU history response must be an array");
for (const row of history) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new Error("Invalid snapshot date");
  if (!row.prices || typeof row.prices !== "object") throw new Error("Invalid prices map");
}
const fileContent = JSON.stringify(history, null, 2) + "\n";
```

The commit subject is `GPU Prices: back up live history (YYYY-MM-DD)`.

- [ ] **Step 2: Document setup and failure behavior**

Document the admin header credential, GitHub PAT mapping, manual workflow import and activation, weekly schedule, raw-history validation, Replit redeploy warning, and the fact that activating the workflow does not repair the dead daily recorder ping.

- [ ] **Step 3: Validate workflow JSON and docs**

Run: `node -e 'const w=require("./ops/n8n/gpu-history-backup.json"); if(!Array.isArray(w.nodes)||!w.connections) process.exit(1)' && rg -n "gpu-history|ADMIN_API_KEY|manual|redeploy" ops/n8n/README.md`

Expected: command exits 0 and documentation matches every required setup item.

- [ ] **Step 4: Commit**

```bash
git add ops/n8n/gpu-history-backup.json ops/n8n/README.md
git commit -m "ops: add weekly GPU history backup"
```

### Task 5: Coverage and training-sensitivity data brains

**Files:**
- Modify: `client/src/lib/gpu-series.ts`
- Modify: `client/src/lib/__tests__/gpu-series.test.ts`
- Create: `client/src/lib/gpu-economics-series.ts`
- Create: `client/src/lib/__tests__/gpu-economics-series.test.ts`

**Interfaces:**
- Produces: `RangeKey = "1M" | "3M" | "6M" | "1Y" | "ALL"`.
- Produces: `rangeCoverage`, `rangeAvailability`, `coverageCaption`, and preserved `ChartPoint` dispersion.
- Produces: `trainingSensitivity(input, minMfu, maxMfu, step)`.

- [ ] **Step 1: Write failing series tests**

Add production-like sparse, reset baseline, and dense fixtures. Assert 1M/3M/6M/1Y availability, visibility-sensitive counts, `ALL` availability, no synthetic boundary counting, metadata preservation, and captions for zero, one, and seven points.

Add deterministic economics assertions:

```ts
const points = trainingSensitivity(input, 20, 60, 5);
assert.deepEqual(points.map((p) => p.mfu), [20, 25, 30, 35, 40, 45, 50, 55, 60]);
assert.ok(points[0].usdCost > points.at(-1)!.usdCost);
assert.equal(points.find((p) => p.mfu === 40)!.usdCost, expectedCurrentCost);
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test client/src/lib/__tests__/gpu-series.test.ts client/src/lib/__tests__/gpu-economics-series.test.ts`

Expected: FAIL because the new range, coverage functions, metadata, and sensitivity module are absent.

- [ ] **Step 3: Implement the pure helpers**

Extend `SeriesPointIn` and `ChartPoint` with optional `low`, `high`, `sources`, and `n`. Copy metadata only for real points. Keep clipped boundary points marked `synthetic: true` without dispersion.

Define availability from actual points only:

```ts
export function rangeCoverage(series: ChartSeries[], start: number | null, now: number): number {
  return series.reduce((count, s) => count + s.points.filter((p) => p.t <= now && (start == null || p.t >= start)).length, 0);
}
```

`trainingSensitivity` validates positive numeric inputs and calculates `gpuHours`, `usdCost`, and `wallClockDays` with the calculator's existing FLOPs formula at each MFU.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test client/src/lib/__tests__/gpu-series.test.ts client/src/lib/__tests__/gpu-economics-series.test.ts && npm run check`

Expected: focused tests PASS and typecheck exits 0; existing consumers accept the expanded union until their controls are updated in Tasks 6 and 7.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/gpu-series.ts client/src/lib/__tests__/gpu-series.test.ts client/src/lib/gpu-economics-series.ts client/src/lib/__tests__/gpu-economics-series.test.ts
git commit -m "GPU Prices: add coverage-aware chart data"
```

### Task 6: Rebuild the price-history experience

**Files:**
- Modify: `client/src/components/neocloud/PriceHistoryChart.tsx`
- Modify: `client/src/pages/neocloud-intel.tsx`

**Interfaces:**
- Consumes: enriched `ChartSeries`, range availability, sparse captions, and metrics health.
- Produces: coverage-aware controls and dual-methodology visx rendering.

- [ ] **Step 1: Wire local API types and state defaults**

Extend local `SeriesPoint` and `GpuMetrics` interfaces with optional dispersion and health. Add `1M` to `RANGE_KEYS`, default visible models to `H100`, `H200`, `B200`, and `A100`, and keep `ALL` as the URL default.

- [ ] **Step 2: Add health provenance and coverage-aware controls**

Render this factual line near the chart header:

```tsx
<p className="font-mono text-10 text-muted-foreground" data-testid="ni-pipeline-health">
  Live observations: {health.recordedDays} days, last {health.lastRecordedDate ?? "none"}. Curated reprice: {health.curatedLastRefreshed ?? "unknown"}.
</p>
```

Pass availability into the range controls. Disabled controls use `aria-disabled`, `title="no data in this window"`, stable `ni-range-*` test ids, and guarded click handlers. Fall back to `ALL` when a selected finite range becomes unavailable after chip changes.

- [ ] **Step 3: Render honest segments, points, and dispersion**

Use straight visx `LinePath` segments. Recorded observed segments are solid; anchor-involved or gapped segments are faint dashed. Anchors are hollow circles and recorded points are solid circles. Render an `AreaClosed` or equivalent SVG band only for contiguous recorded points carrying real `low` and `high` metadata.

Remove the current curated low-high rectangle from both overlay and panels because it is not recorded snapshot dispersion.

- [ ] **Step 4: Complete sparse states and tooltip**

For each visible series with fewer than six real in-range points, render `coverageCaption`. The tooltip snaps to real points and prints actual date, model, price, `recorded daily` or `monthly anchor (estimated)`, and low-high only when the point contains it. Never show `valueAt` interpolation as an observation.

- [ ] **Step 5: Verify UI compilation and focused tests**

Run: `npm run check && TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test client/src/lib/__tests__/gpu-series.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/neocloud/PriceHistoryChart.tsx client/src/pages/neocloud-intel.tsx
git commit -m "GPU Prices: redesign sparse price history"
```

### Task 7: Add economics charts

**Files:**
- Modify: `client/src/pages/gpu-economics.tsx`

**Interfaces:**
- Consumes: `/api/gpu-economics.rows` and `trainingSensitivity`.
- Produces: Recharts cost-efficiency bars and MFU sensitivity curve.

- [ ] **Step 1: Add the cost-efficiency chart**

Import Recharts `ResponsiveContainer`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `Cell`, and `LabelList`. Feed only rows with non-null `usdPerPflopHr`, preserve cheapest-first order, and use `#F07800` for NVIDIA and `#22D3EE` for AMD. Highlight the cheapest row with stronger opacity and render right-side `$0.00` value labels in JetBrains Mono. Set `isAnimationActive={false}`.

- [ ] **Step 2: Add the MFU sensitivity curve**

Import `LineChart`, `Line`, `ReferenceDot`, and supporting axes. Memoize `trainingSensitivity` from 20 through 60 using the selected inputs. Render a thin `#F07800` line, a reference dot at current MFU, currency tooltip, and the caption `Modeled training cost across machine utilization. Same inputs and formula as the calculator.` Set `isAnimationActive={false}`.

- [ ] **Step 3: Add empty and loading states**

Use skeletons while loading, the existing retry state on query failure, and factual text when no row has a compute specification. Add `data-testid="econ-efficiency-chart"` and `data-testid="econ-sensitivity-chart"`.

- [ ] **Step 4: Verify tests, typecheck, and build**

Run: `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test client/src/lib/__tests__/gpu-economics-series.test.ts && npm run check && npm run build`

Expected: PASS with a production bundle containing Recharts on economics and visx on history.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/gpu-economics.tsx
git commit -m "GPU Economics: visualize compute and training costs"
```

### Task 8: Full verification and handoff documentation

**Files:**
- Modify only if verification reveals a scoped defect in files listed above.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a release-ready verified branch and an evidence-backed handoff.

- [ ] **Step 1: Run complete automated gates**

Run: `npm test && npm run check && npm run build`

Expected: every test passes, TypeScript exits 0, and the Vite/esbuild production bundle completes.

- [ ] **Step 2: Verify protected invariants**

Run:

```bash
git diff origin/feat/live-gpu-prices -- server/data/gpu-rental-prices.json server/indices.ts server/index-history.ts server/index.ts server/seo.ts server/social-format.ts
rg -n "@visx/" client/src/components/neocloud/PriceHistoryChart.tsx
rg -n "recharts" client/src/components/neocloud/PriceHistoryChart.tsx
git diff --check
```

Expected: no protected-file diff, visx imports present, no Recharts import in the history chart, and no whitespace errors.

- [ ] **Step 3: Inspect both tabs at wide and narrow widths**

Run the app with test environment values, open `/neocloud-intel` and `/neocloud-intel?tab=economics`, and inspect wide and narrow layouts. Confirm production-like sparse history, reset fixture logic, dense fixture logic, disabled range behavior, model chips, log/linear, tooltip provenance, economics labels, and no overflow.

- [ ] **Step 4: Review commits and working tree**

Run: `git log --oneline origin/main..HEAD && git status --short`

Expected: small area-prefixed commits and a clean working tree.

- [ ] **Step 5: Deliver owner actions**

The handoff explicitly lists Jetson n8n repair, optional `VITE_GOATCOUNTER_CODE`, manual Replit redeploy, and the redeploy history-reset warning that motivates the weekly backup.
