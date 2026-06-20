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
| 1 | clusters.json data | done |
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

---

## Phase 1 — Data (2026-06-20)

**Did:** Built `server/data/clusters.json` — **32 real announced AI
superclusters**, 11 operators (OpenAI/Oracle, xAI, Meta, Microsoft, Amazon,
Google, CoreWeave, Crusoe, Tesla, Nebius, QTS), 6 ISOs (ERCOT, MISO, PJM,
SERC, SPP, WECC). Status mix: 9 operational, 19 construction, 4 announced.
Totals: ~30.3 GW planned, ~3.2 GW rated today, ~1.32M disclosed
accelerators across the 5 clusters that disclose counts. A node integrity
check passes: no duplicate ids, every `estimated[]` entry is a real field,
every `linkedDeal` resolves to a real deal id, every source is https.

**Web-verified the marquee set** (figures + real source URLs) via a web
pass: Stargate Abilene (450k GB200 target, 1.2 GW, GPT-5.5 trained there),
xAI Colossus Memphis (~230k H100/H200/GB200, ~250 MW, 35 gas turbines +
Tesla batteries) and Colossus 2 (~1.2 GW), Meta Prometheus (1 GW, 2026) and
Hyperion (up to 5 GW, Entergy gas), Microsoft Fairwater WI + Atlanta (>2 GW
superfactory), AWS Project Rainier (~500k Trainium2 for Anthropic, 2.2 GW),
Tesla Cortex (Giga Texas, ~500 MW), CoreWeave Ellendale (250 MW lease),
Crusoe/Tallgrass Wyoming (1.8 GW gas), Nebius KC, QTS Cedar Rapids, Vantage
Frontier/Shackelford (1.4 GW).

**Decisions (and why):**
- *Estimate labelling, enforced.* `estimated[]` lists fields whose values
  are GridTilt estimates **or announced forward targets not yet realized**
  (e.g. Abilene's 450k GPUs is a deployment target -> flagged). gpuCount is
  `null` (not invented) for the 27 clusters that do not disclose a count.
- *Only 3 `linkedDeal`s, on purpose.* They point at deals that genuinely
  apply and exist on this branch: `aws-susquehanna -> susquehanna-aws`
  (signed BTM), `meta-pike-county-oh -> meta-oklo-pike` (proposed Oklo SMR),
  `google-clarksville-tn -> google-kairos-hermes2` (proposed Kairos SMR).
  Most clusters run on grid or on-site gas, not a tracked nuclear deal, so
  their `linkedDeal` is null. That restraint is the integrity point.
- *Caught a branch mismatch.* My first read of the deal ids was on
  `feat/real-metrics`, which carries deals (`duane-arnold-google`,
  `aws-xenergy-cascade`) that are NOT on `main`/this branch. Rather than
  link to ids that don't exist here, I set those two clusters' `linkedDeal`
  to null and noted in each that the deal isn't yet in GridTilt's tracked
  set. No invented links.
- *Clean ISO codes* (ERCOT/PJM/MISO/SERC/SPP/WECC) so the by-ISO breakdown
  groups cleanly; utility/TVA detail lives in `energySource`/`notes`.

**Sources used:** OpenAI, CNBC, DCD, Tom's Hardware, SemiAnalysis,
TechCrunch, Data Center Frontier, Microsoft blog, Anthropic, BusinessWire,
Crusoe, Nebius, Vantage/constructionreviewonline, plus operator data-center
pages (Google, Meta, AWS) for sites cross-referenced from the Power Map
registry. Per-cluster URLs are in each entry's `sources[]`.

**Verification (real output):**
- `npm run check` -> tsc clean (no errors).
- `npm test` -> tests 31, pass 31, fail 0.
- `npm run build` -> client + server built (pre-existing >500 kB chunk-size
  warning only, not an error).

**Next:** Phase 2 — write `server/__tests__/clusters.test.ts` first, then
the pure `server/clusters.ts` metrics module, then the thin `/api/clusters`,
`/api/clusters/metrics`, `/api/clusters/:id` route wrappers (TDD).
