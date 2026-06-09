# Phase 2 — Rebuild & Modernization Plan

> Sequenced by value-at-risk and dependency. Each milestone is independently shippable, leaves `main` releasable, and lists scope / files / risk / verification / rollback. **Execution beyond docs needs owner sign-off** (guardrail: ask before merging to `main`, changing index methodology, changing the security posture, adding a paid/external dependency, or anything with runtime cost). Items needing an explicit decision are marked 🔶.

## Recommended order

```
M0  Truth + CI          (docs only + commit CI)        ← start here, zero behavior change
M1  Security closes      (SEC-1..5, TEST-1)            ← small, surgical, high value
M2  Durability 🔶         (DATA-1..3, kills DOC-1)      ← the architectural decision
M3  Perf + type contract (PERF-1, TYPE-1, QUERY-1)
M4  Decompose routes.ts  (ARCH-1, EXP-1, CORR-2)
M5  Integrity 🔶          (CORR-1 synthetic data)
M6  Frontend quality     (A11Y, DESIGN-1, DEAD, NAV-1)
M7  New capability 🔶     (LBNL deepening + AI track, Phase 4)
```

---

## M0 — Tell the truth, turn on CI
**Scope:** Fix DOC-1/DOC-3/DOC-4 and the doc half of SEC-7; commit the existing `.github/workflows/ci.yml` (CI-1); fix PORT-1 so `npm run dev` works on macOS.
**Files:** `README.md`, `CLAUDE.md`, `SECURITY.md`, `replit.md`, `HANDOFF.md`, `HOMEPAGE_HANDOFF.md`, `.github/workflows/ci.yml`, `server/index.ts`.
**Risk:** Negligible — docs + a CI file + one `listen()` option. **Verification:** `git add .github && push`, watch the Actions run go green; `npm run dev` boots locally. **Rollback:** revert commit.
**Why first:** every future session reads these docs and acts on them; the phantom persistence layer is actively dangerous. Turning on CI protects everything after.

## M1 — Close the security gaps
**Scope:** Add `requireAdmin` to SEC-1 and SEC-2; validate+normalize `timeframe` for SEC-3; move the news scanners off the public read path (SEC-4); escape datacenter names at the Leaflet render boundary (SEC-5). Add the TEST-1 auth-boundary integration test (enumerate every admin route → 401/503/200) plus unsubscribe-token tests.
**Files:** `server/routes.ts` (5 small edits), `client/src/pages/PowerMap.tsx`, `server/__tests__/auth-boundary.test.ts` (new).
**Risk:** Low; each change is a few lines with a test. SEC-4 needs care that the cron/manual scan path still works. **Verification:** new tests; re-run the curl probes (preview/social/generate → 401; `?timeframe=ZZZ` → coerced, single cached fetch). **Rollback:** per-change revert.

## M2 — Durability 🔶
**Scope:** Make subscriber + curated-dataset persistence survive redeploys (DATA-1, DATA-2), centralize atomic JSON IO (DATA-3), and make DOC-1's `IStorage` real instead of fictional.
**Decision needed (🔶):** pick the store —
- **(a) Neon Postgres + Drizzle** behind `IStorage` — matches what the docs already (falsely) claim; durable, queryable; free tier; small runtime dep. *Recommended.*
- **(b) SQLite on a Replit persistent volume** — simplest, no external service, but ties durability to one instance.
- **(c) Resend as source of truth for subscribers + keep JSON as cache** — smallest change, covers the Critical item only, leaves curated datasets ephemeral.
**Files:** new `server/storage.ts` + `shared/` schema; migrate `subscribers`, `interconnection-queue`, `datacenters*`, `market-constants`, `social-log` read/writes in `routes.ts`.
**Risk:** Medium — touches the subscriber path; needs a migration of the current JSON into the store and a careful cutover. **Adds a dependency / possible runtime cost → requires sign-off.** **Verification:** subscribe→redeploy→list persists; existing tests green; a seed/migration script. **Rollback:** feature-flag the storage backend; keep JSON path until verified.

## M3 — Performance + type contract
**Scope:** PERF-1 (lazy-load every route; `manualChunks` for d3/leaflet/recharts), TYPE-1 (real `shared/` response types, ideally zod-derived so the server validates and the client imports one source), QUERY-1 (retries, refetch, `isError`, route all fetches through `apiRequest`).
**Files:** `client/src/App.tsx`, `vite.config.ts`, new `shared/types.ts`, `client/src/lib/queryClient.ts`, the page query hooks.
**Risk:** Low-Medium; lazy-loading can surface Suspense-fallback gaps. **Verification:** bundle diff (entry chunk should drop well under 500 kB; viz libs in separate chunks); typecheck; Lighthouse before/after on `/` and `/overview`. **Rollback:** revert; chunks are build-time only.

## M4 — Decompose `routes.ts`
**Scope:** ARCH-1 — split into domain routers (`markets`, `supply-chain`, `catalysts`, `datacenters`, `queue`, `newsletter`, `social`, `seo`, `news`); lift `COMPANY_DATABASE`/`STATIC_MARKET_DATA` to `server/data/*.ts`; extract the X client, news scanners, OG renderer; dedupe the repeated helpers. Fold in EXP-1 (`asyncHandler`) and CORR-2 (single Eastern-tz date logic) during the move.
**Files:** `server/routes.ts` → `server/routes/*.ts`, `server/social/`, `server/news.ts`, `server/og.ts`, `server/data/companies.ts`.
**Risk:** Medium — large mechanical refactor; the danger is behavior drift. Do it one router at a time with the full test suite green between each, and an endpoint-parity check (diff responses before/after). **Verification:** every baseline endpoint returns an identical shape; tests green; `npm run check`. **Rollback:** per-router revert.

## M5 — Integrity 🔶
**Scope:** CORR-1 — replace the randomly generated CCJ/CEG correlation scatter with either a real computation from historical prices (the backtest already fetches them) or an unambiguous "illustrative model" label.
**Decision needed (🔶):** compute-for-real (preferred, on-brand) vs relabel. Either way, **do not touch the three headline indices' methodology without explicit sign-off**, and update `INDEX_VALIDATION.md`/backtest if anything in the index path changes.
**Files:** `server/routes.ts` (correlation generators), `client/src/pages/TheStack.tsx` (labels). **Risk:** Low. **Verification:** the scatter reflects real data or is clearly labeled; a unit test on the correlation computation. **Rollback:** revert.

## M6 — Frontend quality
**Scope:** A11Y-1/2 (sr-only fallback tables for chart/map data; swap the shortcuts modal to the unused Radix `Dialog`; keyboard affordances on map/graph), DESIGN-1 (`brand` Tailwind token + incremental literal migration), DEAD-1 (move volatile supply-chain metrics server-side), DEAD-2 (delete dead files; close `redesign/home-swiss` after rescuing CI), NAV-1 (breadcrumbs → `/overview`).
**Files:** `tailwind.config.ts`, `client/src/pages/*`, `client/src/components/ui/*`, `client/src/data/supply-chain-config.ts`. **Risk:** Low, but visual — screenshot before/after. **Verification:** axe/Lighthouse a11y pass; visual diff; build. **Rollback:** revert.

## M7 — New capability 🔶 (Phase 4)
**Scope:** Deepen the LBNL interconnection-queue module (homepage card, richer `/queue`), then the AI feature track — the Analyst agent (sourced daily brief upgrading the X poster), natural-language dataset query, reasoned portfolio narratives, news-pipeline intelligence, vision-assisted capex ingestion. Each behind a feature flag + admin gating, with a kill switch, a cost ceiling, eval cases, and a "how we verified it isn't hallucinating" note. Never present a sentiment gauge as a measurement.
**Decision needed (🔶):** this is net-new, costs money at runtime, and adds model calls → **full sign-off per feature.** Sequence and budget to be agreed before any build.
**Risk:** Medium-High (cost, correctness, brand). **Verification:** eval suite per feature; dedupe/length checks preserved on the poster; owner approves copy before it ships. **Rollback:** feature flags off.

---

## Definition of done (Phase 5)
`npm run check` / `npm test` / `npm run build` / `npm run backtest:indices` all green and run in CI on every PR; new tests cover the auth boundary and any touched client flows; all docs match reality; no security regression vs. the (corrected) threat model; index honesty preserved and backtest updated if any index-path code changed; a final `docs/audit/03_outcome.md` records what changed, what got measurably better (bundle size, type coverage, test count, Lighthouse), what's deferred, and the exact Replit redeploy steps.

## Standing reminders
- Pushing ≠ shipping on Replit. After any merge to `main`, say "pushed; redeploy on Replit to ship," never "shipped/live."
- Keep `main` releasable; one concern per PR; self-review with a reviewer subagent before opening.
