# Real Metrics: replace the three indices with the buildout scoreboard

Date: 2026-06-10. Owner: Jack. Status: approved direction, pending spec sign-off.
Branch: `feat/real-metrics` (stacked on `fix/m0-m1-truth-security`, PR #1).

## Why

The three headline indices (AI Demand, Grid Stress, NPI) are market-sentiment composites with invented scaffolding: arbitrary baselines (72, 68), clamps, a Jan-2024 = 100 anchor, and a hand-tuned policy multiplier. Our own backtest (`docs/INDEX_VALIDATION.md`) shows AI Demand and Grid Stress carry no physical signal, and NPI is r = 0.95 with VST alone. The honest labeling was a band-aid. Meanwhile the repo already curates the real thing: named nuclear deals with offtakers and MW, a datacenter pipeline in GW by status, the LBNL interconnection backlog, and sourced hyperscaler capex.

Decisions made with Jack (2026-06-10):
1. Headlines become real units. One thin, clearly labeled market line survives for daily pulse. No index levels, no base years, no clamps, anywhere.
2. Social posts become event-driven plus a Friday digest. Quiet day = no post.
3. The headline nuclear number counts signed deals only. Options, LOIs, and aggregates display in a separate bucket.

## The scoreboard

Four metric groups. Every group carries `asOf` and `source` (label + URL). Every number is traceable to a curated dataset or a public feed. Nothing is normalized, indexed, or clamped.

### 1. Nuclear-for-AI (replaces NPI)

Source: `server/data/interconnection-queue.json` projects where `type === "nuclear"` and `status === "active"` and `dcRelevant`, partitioned by a new curated `firmness` field.

- `signedGW` (headline): sum of `capacityMW` where `firmness === "signed"`, in GW.
- `announcedGW`: sum where `firmness` is `optioned` or `proposed`.
- `aggregateGW`: sum where `firmness === "aggregate"` (LOI pipelines). Footnote only, never in either headline bucket.
- `signedDeals` / `totalDeals`: counts.
- `uraniumSpot`: passthrough of `market-constants.json` (value, asOf, source). Commodity price, not a stock.

`firmness: "signed" | "optioned" | "proposed" | "aggregate"` is added to the project schema, the admin add/update endpoint allowlist, and validation. Initial classification (Jack reviews; flip any of these via the admin endpoint at any time):

| Project | MW | Proposed firmness | Reason |
|---|---|---|---|
| Crane (TMI-1 restart) | 835 | signed | 20-yr Microsoft PPA, restart underway |
| Palisades restart | 800 | signed | contracted restart, DOE loan, underway |
| Talen-AWS Susquehanna | 1,920 | signed | definitive 17-yr, $18B |
| Clinton extension + uprate | 1,121 | signed | 20-yr Meta VPPA, full output |
| Talen-AWS 300 MW FoM | 300 | signed | executed transition agreement |
| Vistra-Meta existing PPAs | 1,500 | signed | executed |
| Vistra-Meta SMR option site | 300 | optioned | option agreement |
| Meta-Oklo Pike County | 1,200 | proposed | prepayments, pre-construction |
| Kairos Hermes 2 | 500 | proposed | demo-scale; Jack may upgrade (TVA/Google PPA exists) |
| AWS-Oklo arrangement | 750 | proposed | framework |
| Standard Power NuScale fleet | 2,000 | proposed | announcements |
| Comanche Peak Unit 3 | 1,200 | proposed | no offtaker |
| Oklo customer pipeline | 2,100 | aggregate | LOIs, not projects |

With these defaults the headline reads roughly "6.5 GW signed across 6 deals, 6.0 GW announced" (exact values computed from data at runtime, never hand-summed).

### 2. AI load pipeline (replaces AI Demand)

Sources: `server/data/datacenters.json` (curated registry, >= 400 MW sites only) and `server/data/hyperscaler-capex.json`.

- `operationalGW`, `constructionGW`, `announcedGW`: sum of `powerMW` by `status`, in GW. Today: ~9.4 / ~15.6 / ~5.1.
- `siteCount`: registry size (58).
- `capexUsdBillions`: FY2025 total (340) + per-company components with source links, passthrough.
- Labeling rule: always "tracked", never "US total". The registry is curated, not a census.
- Deviation (implementation): `datacenters.json` stays a bare array (changing it to an object would break the existing loaders, ingester, and PowerMap). The pipeline group ships a source label describing the live registry instead of a per-file asOf.

### 3. The backlog (replaces Grid Stress)

Source: `interconnection-queue.json` headline, passthrough promotion. `queueOverallGW` (2,290), `queueOverallProjects`, `medianWaitMonths` (55), `historicalWithdrawalPct` (77), `ercotLargeLoadGW` + `ercotLargeLoadDataCenterPct`, `pjmReopenedGW`. All fields already carry asOf strings and the LBNL source URL. No new data work.

### 4. Grid pulse (new; the live, physical element)

- Primary: EIA US48 hourly demand via existing `physical.ts` (free key, 30-min cache): current load GW and delta vs the same hour one year ago. When `EIA_API_KEY` is absent the group returns `configured: false` and the UI omits it honestly.
- Companion: FRED `IPG2211A2N` latest month year-over-year %, no key, already cached 24h.

### Market line (the one stock element)

From `stackCache["1D"]` (zero new fetches): equal-weight mean of `changePercent` across all stack tickers with live data, plus the nuclear-layer subset. Display: "ai infra, equal weight across N names: +0.8% today · nuclear names: +1.4%". Rules: percent-change only, never a level; equal weight (the no-judgment choice); stale tickers excluded with the live count shown; `source: "live" | "static"` honesty flag retained.

## API

- `GET /api/metrics` (new): `{ nuclear, pipeline, backlog, gridPulse, market, asOf }` per the shapes above. Assembly lives in `server/metrics.ts`: pure, typed functions over plain inputs (same discipline as `indices.ts`), unit-tested; `routes.ts` only gathers file/cache IO.
- `GET /api/metrics/history` (new): served from `server/data/metrics-history.json`. A daily snapshot of the scoreboard scalars (signedGW, announcedGW, constructionGW, operationalGW, queueOverallGW, capexUsdBillions, uraniumSpot) appended once per calendar day on `/api/metrics` hits, using the same once-a-day guard pattern as `index-history.ts` (no weekday/market-hours gate; physical data has no trading hours). Sparse early history is expected and honest.
- `GET /api/kpis`: returns `410 Gone` with `{ moved: "/api/metrics" }` for one release, then removed. Its side-effect write to `index-history.json` stops with it.
- `GET /api/index-history`: stays, serving the frozen file, with `{ discontinued: true, reason, replacedBy: "/api/metrics/history" }` merged into the response. The file is the archived evidence.

## UI

- `Hero.tsx` (home): swap `/api/kpis` for `/api/metrics`; show signed nuclear GW, construction GW, queue GW, and grid pulse when configured.
- `TiltOverview.tsx`: KPI strip becomes four metric cards (nuclear / pipeline / backlog / pulse), each with unit, asOf, and a source link. Market line renders as a slim strip beneath them. The gauge-history chart becomes a buildout-history chart reading `/api/metrics/history` (lines: signedGW, constructionGW, queueOverallGW).
- OG images: `liveIndicesStats()` becomes scoreboard stats ("6.5 GW signed nuclear" style). Template cards updated.
- `/api/export/daily`: `indices` block replaced by a `metrics` block; `tilt_status` dies with the gauges (it was derived from them). Only consumer is Jack's own automation.
- Grep-verified consumer list to migrate: `Hero.tsx`, `TiltOverview.tsx` (client); `liveIndicesStats` (routes.ts:1067), `ogCardForTemplate` (1101), `composeTiltStatusTweet` (1594), `composeNpiUpdateTweet` (1613), `/api/kpis` (1728), `/api/export/daily` (2910) (server).

## Social: event-driven + Friday digest

State: `server/data/social-state.json` stores the last-posted scoreboard snapshot. The daily cron URL does not change (external cron-job.org keeps firing); the handler becomes an evaluator:

1. Compute current scoreboard; diff against last-posted snapshot.
2. If a meaningful event exists, post the highest-priority one: `new_deal` (project added or firmness upgraded to signed) > `pipeline_move` (a site changed status or GW totals moved) > `backlog_update` (queue headline fields changed) > `capex_update`.
3. Else if Friday: post the weekly digest: scoreboard values + deltas vs 7 days ago from metrics-history, plus next week's top catalyst (absorbs the Friday catalyst-preview slot). The digest always includes the week date ("week of jun 8"), so it is never byte-identical even in a flat week, and a flat week says so plainly.
4. Else: respond `{ skipped: true, reason: "no change" }` and log it. Honest silence.
5. Dedupe guard: never post text identical to any of the last 20 `social-log.json` entries.

Composer changes in `social-format.ts` (all pure + unit-tested): add `buildNewDealTweet`, `buildPipelineMoveTweet`, `buildBacklogUpdateTweet`, `buildCapexUpdateTweet`, `buildWeeklyDigestTweet`. Delete `buildTiltStatusTweet`, `buildNpiUpdateTweet`, `npiHistoryContext`, `effectiveNpiWeights`, and the day-of-week `ROTATING_TEMPLATES` keying. `buildTopMoversTweet` and `buildCatalystTweet` survive as manual-only templates via `/api/social/generate` and `post-now` (real data, honestly labeled, just not scheduled). Voice rules unchanged (lowercase prose, no padded columns, vary from real numbers).

## Rider: kill the synthetic correlation scatter (same disease)

`/api/stack` currently ships `generateCCJCorrelationData`/`generateCEGCorrelationData`: Math.random scatter tuned to target r values, plus a correlation coefficient computed from the fake points (audit finding CORR-1). No free daily uranium spot series exists to compute the real thing, so the honest fix is removal: delete the generators and the `correlation*` fields from `/api/stack`, and remove the scatter display from `TheStack.tsx`. No fabricated data survives this change.

## What stays, what dies

Stays: `server/indices.ts`, the backtest script, `indices.test.ts`, `docs/INDEX_VALIDATION.md`, and the frozen `index-history.json`. They are the public autopsy and keep `npm run backtest:indices` reproducible against the archive.
Dies from live code: `computeKpis` gauge assembly, `deriveSmrPolicyScore` (the 0-10 score becomes the raw deal count/GW it was derived from), NPI plumbing in routes, the gauge UI, the gauge/NPI tweet composers, the synthetic scatter.

## Docs and the public story

- README: "Index methodology" section becomes "The scoreboard: every number and where it comes from" (per-metric source table), plus a short "What happened to the indices" pointing at the validation study and archived series.
- Blog post + announcement tweet, drafted with the change, owner-approved before publishing: we built indices, backtested them against physical data, they failed, we replaced them with the real numbers.
- CLAUDE.md and SECURITY.md touch-ups where they reference gauges (no security-posture change; the admin schema gains `firmness`).

## Testing

- `metrics.test.ts` (new): firmness partition sums, aggregate exclusion, GW conversion/rounding, missing-file and missing-key degradation, asOf/source passthrough, market-line stale exclusion.
- `social-format.test.ts`: rewritten for the five new composers, including the flat-week digest, the date-inclusion guarantee, and length limits.
- Cron evaluator test: no-change -> skipped; synthetic diff -> correct event priority; dedupe against log.
- Existing suites stay green: indices tests (archive math), throttle test, auth-boundary test (`/api/metrics` is public read-only; no new admin surface beyond the `firmness` field on an existing gated endpoint).

## Out of scope

Durability of the JSON files (audit M2), the routes.ts decomposition (M4), and the AI feature track (M7). This change reads and writes the same files the app uses today.

## Definition of done

`check`/`test`/`build` green; every consumer migrated (grep for `/api/kpis` returns only the 410 stub); UI screenshots of home + overview reviewed; no index levels, base years, clamps, or random data anywhere in the live app; spec, README, and code agree.
