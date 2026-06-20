# Compute Frontier — Build Log

Autonomous overnight build of the Compute Frontier module (AI supercluster
tracker) on branch `feat/compute-frontier`. Newest entry at the bottom.
Spec: `docs/COMPUTE_FRONTIER_SPEC.md`.

## How to read this

Each phase appends a dated entry: what was done, decisions made, sources
used, verification output, and what is next. `npm run check`, `npm test`,
and `npm run build` are run green before every commit.

## Status at a glance

| Phase | What | State |
|------|------|-------|
| 0 | Spec + build log | done |
| 1 | clusters.json data | pending |
| 2 | clusters.ts backend (TDD) | pending |
| 3 | compute-frontier page | pending |
| 4 | integration (route, sidebar, shortcut, cross-links) | pending |
| 5 | SEO + per-cluster pages | pending |
| 6 | social template (TDD) | pending |
| 7 | blog post | pending |
| 8 | docs + README | pending |
| 9 | verify + push + draft PR | pending |

---

## Phase 0 — Plan (2026-06-20)

**Did:**
- Read the codebase to lock onto existing patterns before writing anything:
  the pure-module + `node:test` pattern (`server/indices.ts`,
  `server/metrics.ts`, `server/physical.ts` and their tests), the social
  formatter rotation (`server/social-format.ts`), route registration and
  runtime JSON reads (`server/routes.ts`), SEO meta + sitemap
  (`server/seo.ts`), routing/shortcuts (`client/src/App.tsx`), the sidebar
  (`app-sidebar.tsx`), the dashboard page pattern (`Queue.tsx`), and the
  Leaflet pattern (`PowerMap.tsx`).
- Confirmed the nuclear-for-AI deals already tracked live in
  `server/data/interconnection-queue.json` with stable ids
  (`tmi-crane`, `susquehanna-aws`, `clinton-meta`, `duane-arnold-google`,
  `palisades`, ...). Compute Frontier links clusters to those ids.
- Wrote `docs/COMPUTE_FRONTIER_SPEC.md`: data model (incl. the
  `estimated: string[]` convention that makes "label every estimate" a
  tested property), pure metrics module signature, API endpoints, page
  layout, integration points, SEO, social, data methodology, and the
  phased plan.
- Set up branch `feat/compute-frontier` off an up-to-date `main`. Did not
  touch `main` or the existing PR branches.

**Decisions (and why):**
- *Clusters are a new dataset, not derived from `datacenters.json`.* The
  Power Map tracks campuses by power footprint; Compute Frontier tracks the
  compute layer (GPUs, chips, training/inference) and the power-secured
  layer (`linkedDeal`). Different schema, different intent, kept separate
  and cross-linked. Cleaner boundaries, independently testable.
- *Estimate labelling via a per-cluster `estimated: string[]`.* One
  convention, enforced by a unit test, rendered as an `est.` tag. GPU
  counts that aren't disclosed are `null` (excluded from sums), never
  invented.
- *Concentration = operator HHI + top-operator share of planned MW.* This
  is the "who controls the frontier / eliminate obfuscation" metric and is
  on-mission for citizen-investors.
- *Power-needed-vs-secured join lives in the route layer*, not the pure
  module, so `clusters.ts` keeps one responsibility (clusters-only math).
- *Keyboard shortcut G+0.* G+1..9 are already assigned; 0 is the natural
  next key.
- *Followed the brainstorming + writing-plans skills' thinking* (explore
  context, weigh approaches, design for clear boundaries, plan in
  bite-sized phases) but skipped their interactive approval gates per the
  explicit autonomous instruction. The spec is the combined design+plan
  artifact rather than three separate docs that could drift.

**Sources used this phase:** existing repo only (no external data yet).

**Verification:** docs-only phase; no code changed, so check/test/build are
unaffected. Full green run happens from Phase 2 onward and again at Phase 9.

**Next:** Phase 1 — build `server/data/clusters.json` with 25-40 real
announced superclusters, every estimated field flagged, real source URLs,
web-verifying the marquee clusters.
