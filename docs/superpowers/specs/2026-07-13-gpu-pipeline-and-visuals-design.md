# GPU Pipeline and Visuals Overhaul

**Date:** 2026-07-13  
**Status:** Implemented and verified
**Scope:** Pipeline health, recoverable history, price-history visualization, and GPU economics charts

## Goal

Make GridTilt's GPU surface operationally trustworthy and visually complete without weakening its data-integrity doctrine. Provider failures must be visible, daily observations must be recoverable after redeploys, sparse histories must look intentional, and the economics tab must expose its core deterministic insights graphically.

The implementation must preserve these invariants:

- No fabricated, smoothed, or interpolated value may be presented as an observation.
- Curated monthly anchors remain estimates and are visually distinct from recorded daily observations.
- Period changes remain `null` when no real point is near the lookback window.
- `server/data/gpu-rental-prices.json` keeps its exact schema.
- The existing do-not-touch boundaries in `CLAUDE.md` remain untouched.
- The history chart uses one rendering library. visx remains the selected library; Recharts is used only for the economics charts.

## Approach Selection

Three implementation approaches were considered.

1. **Keep visx for history and use Recharts for economics. Selected.** visx provides direct control over observed segments, estimated anchor segments, hollow versus solid points, exact tooltip semantics, and per-point dispersion bands. Recharts remains the house library for conventional deterministic bar and line charts.
2. **Port the history chart to Recharts.** This would remove five visx dependencies, but expressing discontinuous observed segments, anchor-only dashed context, non-fabricated range clipping, and live-only dispersion would require custom shapes and internal Recharts behavior. It reduces dependency count at the cost of less transparent rendering logic.
3. **Replace the chart with a canvas or bespoke SVG implementation.** This offers control but creates unnecessary interaction, accessibility, and maintenance work while duplicating capabilities already present in visx.

## Phase 0: Branch Adoption and Baseline

Fast-forward `main` to `origin/feat/live-gpu-prices`. Read the resulting `CLAUDE.md` as binding. Install the locked dependencies and establish a clean baseline with `npm test` and `npm run check` before new changes.

## Phase 1: Pipeline Health and Recoverable History

### Structured provider outcomes

`server/gpu-live.ts` will stop collapsing every upstream failure into an empty array. Provider requests will return a typed outcome that distinguishes successful empty results from HTTP failures and thrown errors. Every failed request will emit `console.error` with the provider name, upstream status when available, and a concise error reason.

The full sweep will return both usable model prices and a summary:

- Eastern date of the attempt
- overall `ok`, true only when every attempted provider request completed successfully
- per-provider request, success, failure, and observation counts
- total usable model count

Partial success remains valid input. Surviving providers may produce recorded prices; failed providers are counted and visible. Total failure records no snapshot.

### Health response

The metrics route will retain the latest sweep summary in process memory and include a `health` object with:

- `recordedDays`: count of live snapshot days
- `lastRecordedDate`: latest live date or `null`
- `lastSweep`: latest process-local sweep summary or `null`
- `curatedLastRefreshed`: the curated file's refresh date or `null`

Pure history-summary logic will live outside the route and be unit tested. The client will render a compact provenance line beneath the GPU price header. Missing or stale inputs remain factual context, not an invented alert state.

### Dispersion propagation

The merged metrics series will preserve optional recorded-point metadata (`low`, `high`, `sources`, and `n`) sourced from snapshot metadata. Curated anchors will not receive dispersion metadata. Recorded points continue to win same-date deduplication. The current change-window tolerance logic remains unchanged and covered by its existing tests.

### Raw history endpoint

Add admin-gated `GET /api/admin/gpu-history`. It returns `readGpuHistory()` exactly, including snapshot source and metadata. The existing constant-time admin-key boundary protects it. Tests will prove a valid key returns the raw payload and a missing key never succeeds.

### Weekly backup workflow

Add an importable n8n workflow under `ops/n8n/` that:

1. runs weekly;
2. calls the admin history endpoint with `x-admin-key`;
3. validates that the response is a snapshot array;
4. serializes it as `server/data/gpu-price-history.json` with a trailing newline;
5. reads the current file SHA from GitHub;
6. commits the replacement to `main` through the GitHub contents API.

The workflow documentation will list required credentials and environment values, import and activation steps, failure behavior, and the explicit manual owner action. A redeploy can then lose no more than the interval since the last successful weekly backup.

## Phase 2: Coverage-Aware Price History

### Data brain

`client/src/lib/gpu-series.ts` remains chart-library agnostic and owns:

- ranges `1M`, `3M`, `6M`, `1Y`, and `ALL`;
- real-point coverage counts for visible series and each candidate window;
- optional recorded-point dispersion metadata;
- sparse-state summaries and coverage captions;
- clipping that clearly marks a synthetic boundary point and never treats it as an observation or dispersion sample.

A range is selectable only when at least two real points from the currently visible models fall within its window. `ALL` is always available. The default is `ALL`. If the current URL range becomes unavailable after model visibility changes, the page falls back to `ALL` and keeps the URL synchronized.

### Rendering semantics

The visx chart will use only straight segments and real points:

- consecutive recorded daily points: solid line segments and small solid dots;
- any segment involving a curated monthly anchor or a large recorded gap: faint dashed line;
- curated anchors: larger hollow dots;
- recorded dispersion: a translucent low-to-high band only where real recorded metadata exists;
- no curve smoothing, invented intermediate dots, or anchor dispersion.

The legend names the two methodologies explicitly: `recorded daily` and `monthly anchor (estimated)`.

### Sparse states

Fewer than six real points in range activates a deliberate sparse presentation. Points remain prominent and each visible model receives a caption such as `7 observations since 2025-06; daily history accrues automatically`. Anchors-only and reset-to-baseline histories render the same designed state rather than a blank plot or error.

### Controls and URL state

The chart keeps overlay/grid and log/linear controls. Model chips default to H100, H200, B200, and A100 and persist through `?gpus=`. View and range continue to persist through `?view=` and `?range=`. Disabled ranges use native disabled behavior, `aria-disabled`, a `no data in this window` tooltip, and stable `data-testid="ni-range-*"` values. Every other interactive control also has a test id.

### Tooltip and polish

The tooltip snaps to real points. It shows the actual date, model, price, provenance, and recorded low-high spread when present. It does not label an interpolated cursor value as observed. Chart chrome uses 10-11px muted ticks, low-contrast gridlines, the card surface and border, JetBrains Mono numerals, and no animation.

## Phase 3: Economics Charts

### Cost efficiency bars

The economics tab will add a horizontal Recharts bar chart sourced directly from `/api/gpu-economics.rows`. It displays `$ / PFLOP-hr`, preserves the endpoint's cheapest-first ordering, highlights the cheapest-compute row, uses NVIDIA orange and AMD cyan, prints right-side JetBrains Mono values, and disables animation. Rows without a compute value are omitted from the chart but remain in the table.

### Training sensitivity

The calculator will add a Recharts line chart for total training cost across MFU values from 20% through 60%. Every point uses the same deterministic formula as the existing calculator with the selected preset, GPU, cluster size, and hourly price. The curve is a thin orange line with a reference dot at the current MFU. The chart is explicitly labeled as modeled cost, not observation.

Pure client math for the sensitivity series will be extracted and unit tested so calculator and chart assumptions cannot drift.

## Error Handling

- Individual provider failures log loudly and contribute to health counts without discarding successful providers.
- A completely empty sweep records nothing and reports the failed or empty attempt through `lastSweep`.
- File read and write failures retain existing server error logging and never generate replacement observations.
- Metrics and economics query failures retain the page's existing designed error and retry states.
- Empty economics rows and missing compute specifications produce honest empty chart states, not zero-valued bars.
- Missing admin configuration returns the existing `503`; wrong or absent keys return the existing unauthorized response.

## Testing and Verification

Server tests will cover HTTP failures, thrown provider errors, partial and total sweep results, per-provider counts, history summary fields, dispersion propagation, and the protected raw-history route.

Client unit tests will cover all five ranges, coverage-based availability, visibility changes, synthetic-boundary exclusion, sparse captions, metadata preservation, reset-to-baseline fixtures, current sparse production-like fixtures, dense fixtures, and MFU sensitivity math.

Final verification requires:

- `npm test`
- `npm run check`
- `npm run build`
- visual inspection of the prices and economics tabs at desktop and narrow widths
- confirmation that `gpu-rental-prices.json` and every `CLAUDE.md` do-not-touch file remain unmodified
- confirmation that only visx imports render the history chart

## Delivery and Owner Actions

Changes will be split into small, imperative, area-prefixed commits. The final handoff must state that the owner still needs to:

1. restart or repair the Jetson n8n instance;
2. set `VITE_GOATCOUNTER_CODE` at build time if analytics is wanted;
3. manually redeploy on Replit because a Git push does not deploy.

The handoff must also state that redeploying resets accrued production GPU history to the committed baseline until the weekly backup workflow has successfully committed newer history.
