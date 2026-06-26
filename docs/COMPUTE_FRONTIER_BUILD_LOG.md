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
| 2 | clusters.ts backend (TDD) | done |
| 3 | compute-frontier page | done |
| 4 | integration (route, sidebar, shortcut, cross-links) | done |
| 5 | SEO + per-cluster pages | done |
| 6 | social template (TDD) | done |
| 7 | blog post | done |
| 8 | docs + README | done |
| 9 | verify + push + draft PR | done |

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

---

## Phase 2 — Backend logic, TDD (2026-06-20)

**Did (test-first):** Wrote `server/__tests__/clusters.test.ts` against a
fixed fixture with hand-computed totals, watched it fail (module missing),
then implemented the pure `server/clusters.ts` to pass. 13 tests, all green.
`computeClusterMetrics` returns: status counts; total/operational/planned
MW; total GPUs (nulls skipped) + count of disclosing clusters; byStatus,
byOperator, byIso breakdowns; gpusPerMW; concentration (operator HHI +
top-operator planned share); linkedDeal rollup. One test guards the live
`clusters.json` itself (estimated[] only names real fields, status enum,
gpuCount number-or-null, sources present, metrics stay self-consistent).
Added the thin wrappers in routes.ts: `/api/clusters`,
`/api/clusters/metrics` (metrics + powerSecured join + lastRefreshed), and
`/api/clusters/:id` (registered after /metrics so "metrics" isn't captured
as an id).

**!! Branch correction (important for whoever reads next):** my initial
file reads happened while the repo was on `feat/real-metrics`, but this
branch is off `main`. Main does NOT have the metrics.ts refactor: no
`server/metrics.ts`, no scoreboard, and `routes.ts` + `social-format.ts`
are the older indices-era versions. I re-baselined: confirmed via
`git diff --stat main feat/real-metrics` that `seo.ts`, `App.tsx`,
`app-sidebar.tsx`, `index.css`, `Queue.tsx`, `datacenters.json` are
**identical** on both branches (so those patterns still hold), while
`routes.ts`, `social-format.ts`, `articles.json`, `TiltOverview.tsx`, and
`interconnection-queue.json` differ and must be read fresh on main. The
pure `clusters.ts` imports nothing, so it is branch-independent.

**Decisions (and why):**
- *Power-secured join is firmness-tolerant.* Main's queue rows have no
  `firmness` field (that lands in feat/real-metrics), so the join defaults
  to `"tracked"` and computes `signedSecuredMW` only from rows that do carry
  `firmness === "signed"`. Works on main now (securedMW 3,620 across the 3
  linked deals) and will light up the signed/proposed split automatically
  once the richer queue merges. No fabricated firmness.
- *Concentration on planned MW.* HHI of operator planned-MW shares + the top
  operator's share is the "who controls the frontier" lens for
  citizen-investors. On the live data the metrics stay in-range (HHI 0..1,
  operationalMW <= totalRatedMW), asserted by the integrity test.
- Used `Array.from(map.values())` not spread, to satisfy the repo's tsc
  target (no downlevelIteration).

**Verification (real output):**
- `npm run check` -> tsc exit 0, error count 0.
- `npm test` -> tests 43, pass 43, fail 0 (12 new clusters tests + the 31
  pre-existing).
- `npm run build` -> exit 0 (client + server; pre-existing chunk warning).
- Runtime smoke of the join on real data: clustersWithDeal 3, securedMW
  3,620 MW (meta-oklo-pike 1,200 + susquehanna-aws 1,920 + google-kairos-
  hermes2 500), totalPlannedMW 30,335.

**Next:** Phase 3 — `client/src/pages/compute-frontier.tsx`: metric cards,
sortable/filterable table with status badges, Recharts breakdowns, Leaflet
map, loading/empty/error states, dark aesthetic.

---

## Phase 3 — Frontend page (2026-06-20)

**Did:** Built `client/src/pages/compute-frontier.tsx`, matching the Queue
dashboard pattern and GridTilt's dark tokens (`#F07800` sparingly,
`font-mono` figures, shadcn Card/Badge/Skeleton/Tooltip, `grid-bg` hero).
Sections: hero with honest copy + cross-links; six headline metric cards
(clusters, operational/rated GW, planned GW, tracked GPUs, operators with
top-operator share, nuclear secured GW); four Recharts breakdowns (planned
MW by operator [horizontal], by ISO, by status [status-colored cells], and a
build timeline bucketed by first announced year); a Leaflet map; a
sortable + filterable table; a "power needed vs power secured" card; and a
methodology footnote.

**Decisions (and why):**
- *Declarative `CircleMarker`s* (react-leaflet) instead of Power Map's
  imperative `L.divIcon` layer code: simpler, reliable, status-colored,
  radius ~ sqrt(planned MW). Same CARTO `dark_nolabels` tiles so it reads as
  one family with the Power Map.
- *`est.` tag component* renders next to any value whose field key is in the
  cluster's `estimated[]` (gpuCount/rated/planned/online); undisclosed GPU
  counts render "—". The integrity rule is visible to the user, not buried.
- *Charts use planned MW* (the forward buildout) with GW-scaled axes; status
  chart colors each bar by status to match the map legend.
- *Cluster name links to `/compute-frontier/:id`* (the per-cluster page lands
  in Phase 5); nuclear-linked rows link to `/queue`.
- The page is committed before routing (Phase 4 wires the route, sidebar,
  shortcut, and cross-links); it is tsc-clean now and gets bundled +
  reachable next phase.

**Verification (real output):**
- `npm run check` -> tsc exit 0, total errors 0 (page typechecks).
- `npm run build` -> exit 0.
- (Full `npm test` unchanged at 43 pass; no server logic touched this phase.)

**Next:** Phase 4 — route + PAGE_TITLES + G+0 shortcut in App.tsx, sidebar
entry, and cross-links from the Power Map and the dashboard; then verify the
page bundles and renders.

---

## Phase 4 — Integration (2026-06-20)

**Did:**
- `App.tsx`: eager-imported the page (consistent with the other Leaflet/
  Recharts dashboard pages), added the `/compute-frontier` route, a
  `PAGE_TITLES` entry, and the **G+0** keyboard shortcut in both the
  shortcuts panel and the keydown router (G+1..9 were taken).
- `app-sidebar.tsx`: added a "Compute Frontier" nav item (lucide `Cpu`),
  placed right after Power Map, description "AI superclusters by GPU and
  power".
- Cross-links: Power Map's "≥ 400 MW only" banner now points to Compute
  Frontier for the compute layer; the dashboard (TiltOverview) Modules grid
  gains a Compute Frontier card. (Main's TiltOverview is the indices-era
  version; the card slots into its existing `FEATURE_SLIDES` array. `preview`
  is unused by the grid render, so the entry reuses an existing asset
  invisibly.)

**Decisions (and why):**
- *G+0* is the natural next nav key; keeps the existing G+digit pattern.
- *Eager import* matches the other dashboard pages and avoids a Suspense
  flash; the heavy deps (Recharts, Leaflet) are already in the bundle via
  the other eager pages.

**Verification (real output):**
- `npm run check` -> tsc exit 0, 0 errors (the page is now imported, so this
  also typechecks the route wiring end to end).
- `npm test` -> tests 43, pass 43, fail 0.
- `npm run build` -> exit 0; the page is bundled into the client app (no
  separate-chunk warning beyond the pre-existing one).
- **Honest caveat (headless session):** I verified compile + bundle, not a
  live browser render. The page closely mirrors the verified Queue/PowerMap
  patterns (same query fetcher, Card/Badge/Skeleton, CARTO dark tiles). A
  human should click through `/compute-frontier` once to confirm the map and
  charts paint; flagging it as not-yet-exercised interactively.

**Next:** Phase 5 — SEO: `/compute-frontier` in STATIC_PAGES + JSON-LD,
per-cluster `/compute-frontier/:id` pages (server meta + client page), and
`SITEMAP_CLUSTER_SLUGS` wired into sitemap.xml.

---

## Phase 5 — SEO + programmatic pages (2026-06-20)

**Did:**
- `server/seo.ts`: added `/compute-frontier` to `STATIC_PAGES` (so it joins
  the sitemap automatically) with a `Dataset` + breadcrumb JSON-LD branch in
  `getPageMeta`. Added a `/^\/compute-frontier\/([a-z0-9-]+)$/` matcher that
  reads `clusters.json` and returns per-cluster title, description, and
  `Place` (with PostalAddress + GeoCoordinates) + breadcrumb structured data;
  unknown ids fall through to the site default. Exported
  `SITEMAP_CLUSTER_SLUGS` (32 ids).
- `server/routes.ts`: imported `SITEMAP_CLUSTER_SLUGS` and added the
  per-cluster loop to `/sitemap.xml`.
- Client: new `client/src/pages/ComputeFrontierDetail.tsx` (a focused
  per-cluster page: facts grid with est. tags, power/linked-deal card,
  sources list, loading/error/not-found states) wired at
  `/compute-frontier/:id` in `App.tsx`.

**Decisions (and why):**
- *Used `·` not an em dash* in the SEO titles, matching the existing `/queue`
  title and honoring Jack's no-em-dash rule.
- *`SITEMAP_CLUSTER_SLUGS` computed once at module load* (like the other
  SITEMAP_* exports), read from `clusters.json`; cluster ids are stable, so
  per-request freshness is unnecessary.
- The detail page links its linked deal to `/queue` rather than duplicating
  deal data, keeping the page clusters-only.

**Verification (real output):**
- `npm run check` -> tsc exit 0, 0 errors.
- SEO smoke (called `getPageMeta`): `/compute-frontier` -> title
  "Compute Frontier · AI Supercluster Tracker · GridTilt", JSON-LD
  [Dataset, BreadcrumbList]; `/compute-frontier/stargate-abilene` -> title
  carries the cluster name, canonical `…/compute-frontier/stargate-abilene`,
  JSON-LD [Place, BreadcrumbList]; unknown id -> site default;
  `SITEMAP_CLUSTER_SLUGS` count 32.
- `npm test` -> tests 43, pass 43, fail 0.
- `npm run build` -> exit 0.

**Next:** Phase 6 — a `compute_frontier` social template in
`server/social-format.ts` (TDD, following main's existing template/voice),
plus a thin composer in routes.ts. Dry-run only.

---

## Phase 6 — Social template, TDD (2026-06-20)

**Did (test-first):** Added four failing tests for
`buildComputeFrontierTweet` to `social-format.test.ts`, watched them fail,
then implemented the pure template in `social-format.ts` following the
existing voice (lowercase prose, acronyms/operator names keep case, interpunct
data row, insight assembled from live numbers, full https url). Wired a
module-level `composeComputeFrontierTweet` in routes.ts that reads
`clusters.json`, runs `computeClusterMetrics`, sums distinct linked-deal
capacity, and builds the tweet. Exposed it via a new `ON_DEMAND_TEMPLATES`
map resolved by `/api/social/generate`.

**Decisions (and why):**
- *Dry-run only, enforced by where it is wired.* compute_frontier is in
  `ON_DEMAND_TEMPLATES`, NOT in the Mon-Fri `ROTATING_TEMPLATES` that the
  cron (`/api/admin/cron/daily-tweet`) auto-posts. So it can be generated on
  demand for review but will never auto-post until a human adds it.
- *Half-up accelerator rounding.* The first test caught `toFixed(2)` mis-
  rounding 1,315,000 to "1.31M" (float representation). I fixed the
  formatter to round half-up (`Math.round(n/10_000)/100`) -> "1.32M" rather
  than weaken the test. Fix the code, not the test.
- The insight is genuinely data-driven: on the live data it reads "Meta
  leads at 28% of planned MW" because Hyperion's 5 GW dominates, not a
  hard-coded operator.

**Verification (real output):**
- `npm run check` -> tsc exit 0, 0 errors.
- `npm test` -> tests 47, pass 47, fail 0 (4 new compute-frontier cases).
- `npm run build` -> exit 0.
- Dry-run of the composer on live data (254 chars, under 280):
  > gridtilt · compute frontier
  >
  > 32 AI superclusters tracked · 3.0 GW operational · 30.3 GW planned
  >
  > Meta leads at 28% of planned MW. 1.32M accelerators disclosed across 5 clusters. 3.6 GW tied to tracked nuclear deals.
  >
  > https://gridtilt.com/compute-frontier

**Next:** Phase 7 — announcement blog post in `content/blog/articles.json`,
plain voice, no em dashes, states sourced vs estimated.

---

## Phase 7 — Content (2026-06-20)

**Did:** Added the announcement post "Tracking the Compute Frontier: Every
Named AI Supercluster We Can Verify" (slug
`compute-frontier-ai-supercluster-tracker`) to
`content/blog/articles.json`. It explains the module, the data model, the
sourced-vs-estimated rules, the power-needed-vs-secured angle, and the
concentration metric, in GridTilt's plain voice. No em dashes, no hype.

**Decisions (and why):**
- *Inserted by splicing*, not by re-serializing the whole array: the file
  does not round-trip through `JSON.stringify(…, 2)`, so a full rewrite would
  have reformatted all 8 existing posts. The splice leaves them byte-identical
  and the diff is just the new entry. A temp script (deleted after) handled
  the apostrophe-heavy content so nothing had to be hand-escaped.
- *Asserted no em dash* programmatically before writing; the whole blog file
  is em-dash-free, matching Jack's voice rule.

**Verification (real output):**
- Blog SEO smoke: `getPageMeta("/blog/compute-frontier-ai-supercluster-tracker")`
  -> correct title, canonical, JSON-LD [Article, BreadcrumbList].
- File parses; 9 entries; new post first; slug matches the `/blog/:slug`
  route regex; no em dash anywhere in the file.
- `npm run check` 0 errors · `npm test` 47/47 · `npm run build` exit 0.

**Next:** Phase 8 — README module section (sourced vs estimated) + build log
refresh.

---

## Phase 8 — Docs (2026-06-20)

**Did:** Added a Compute Frontier row to the README "What it does" table and
a dedicated "AI superclusters (Compute Frontier)" row to the "Data sources"
table that states the sources, the `estimated[]` flagging convention, and the
GPU-disclosure rule (counts only where disclosed, else "not disclosed").
Refreshed this build log.

**Decisions (and why):**
- *Did not rewrite the README's index methodology section.* On `main` the
  README still documents the live AI Demand / Grid Stress / NPI indices; the
  metrics/scoreboard rewrite lives on `feat/real-metrics`. Rewriting it here
  would be out of scope and would collide with that PR. I only added the
  Compute Frontier rows.
- *Kept my additions em-dash-free* even though the surrounding README uses
  em dashes, honoring Jack's voice rule for new content.

**Verification:** docs-only change; the authoritative `check` + `test` +
`build` run is Phase 9 (next).

**Next:** Phase 9 — full green verification with real output, push, open the
draft PR.

---

## Phase 9 — Final verification, push, draft PR (2026-06-20)

**Did:** Ran the full verification trio fresh on the finished branch, pushed
`feat/compute-frontier`, and opened the draft PR. Did not merge and did not
touch Replit.

**Verification (real output, this run):**
- `npm run check` -> `CHECK_EXIT=0` (tsc, no errors).
- `npm test` -> `TEST_EXIT=0`, `tests 47 · pass 47 · fail 0` (includes the
  13 clusters tests and the 4 compute-frontier social tests).
- `npm run build` -> `BUILD_EXIT=0` (client + server bundle; only the
  pre-existing >500 kB chunk-size warning).

**Requirements checklist (against the brief):**
- Phase 0 spec + build log ✓ · Phase 1 32 clusters with estimated[] + real
  sources + linkedDeal ✓ · Phase 2 TDD pure module (MW totals, GPUs, power
  by ISO, status/operator breakdowns, GPU/MW efficiency, HHI concentration)
  + /api/clusters, /metrics, /:id ✓ · Phase 3 page (cards, sortable/
  filterable table, 4 Recharts breakdowns incl. build timeline, Leaflet map,
  loading/empty/error) ✓ · Phase 4 route + sidebar + G+0 + Power Map and
  dashboard cross-links ✓ · Phase 5 SEO static + per-cluster pages + sitemap
  ✓ · Phase 6 social template (TDD) + dry-run composer ✓ · Phase 7 blog post
  (plain voice, no em dashes) ✓ · Phase 8 README sourced-vs-estimated ✓.

**Data integrity recap:** every numeric value is either sourced (per-cluster
`sources[]`) or carries an `estimated[]` flag; GPU counts are null where
undisclosed (27 of 32). Marquee clusters were web-verified. Only 3
`linkedDeal`s, all resolving to real tracked deals on this branch.

**Status: COMPLETE.** Branch pushed, draft PR open, nothing merged.

---

## Extensions (2026-06-20, after the 9 phases)

The brief said to keep deepening the module after the core phases. These are
additive commits on the same branch; the draft PR updates as they land.

### Ext A + B — methodology page and more tests

**Did:**
- *More backend tests* (`clusters.test.ts`, now 16): single-operator HHI =
  1.0 and 100% share; operator/ISO sort tie-break is alphabetical; gpusPerMW
  is null when disclosed GPUs sit on 0 rated MW; linkedDealCount counts every
  link while linkedDealIds dedupes a shared deal.
- *Methodology page* `client/src/pages/ComputeFrontierMethodology.tsx` at
  `/compute-frontier/methodology`: what is tracked, sourced-vs-estimated,
  how each headline number is computed, power-needed-vs-secured, sources, and
  limitations. Plain voice, no em dashes. Routed BEFORE `/compute-frontier/:id`
  so the word "methodology" is not treated as a cluster id. SEO entry added to
  `STATIC_PAGES` (joins the sitemap, breadcrumb JSON-LD) and the main page
  footnote links to it.

**Verification (real output):**
- `npm run check` -> exit 0, 0 errors.
- Methodology SEO smoke: title correct, JSON-LD [BreadcrumbList], canonical
  `…/compute-frontier/methodology`, present in the static sitemap, and NOT in
  the cluster slug list.
- `npm test` -> tests 51, pass 51, fail 0.
- `npm run build` -> exit 0.

### Ext C — cluster comparison view

**Did:** Added `client/src/pages/ComputeFrontierCompare.tsx` at
`/compute-frontier/compare`: three column pickers (seeded with the two
largest clusters by planned MW) and a field-by-field side-by-side table
(operator, status, location, ISO, chip, GPUs, rated/planned MW, energy,
workload, online, nuclear deal) with est. tags and links to each cluster's
detail page. Routed before `/compute-frontier/:id`; SEO STATIC_PAGES entry +
breadcrumb; linked from the main page footnote.

**Decisions (and why):**
- *Route order matters.* `compare` and `methodology` are registered before
  the `:id` route so those words are not treated as cluster ids; verified
  that a real id (`xai-colossus-memphis`) still resolves to its Place page.
- Kept the picker simple (3 fixed slots, "none" allowed) rather than a
  tag-style multi-select; fewer states, clearer behavior.

**Verification (real output):**
- `npm run check` -> exit 0, 0 errors.
- SEO: `/compute-frontier/compare` -> BreadcrumbList, in the static sitemap,
  not a cluster slug; a real cluster id still resolves to [Place,
  BreadcrumbList].
- `npm test` -> tests 51, pass 51, fail 0.
- `npm run build` -> exit 0.

**Compute Frontier now spans:** the main dashboard, per-cluster pages, a
methodology page, and a comparison view, plus the API, SEO, sitemap, social
dry-run, and the blog post. All green.

### Ext D — OG cards

**Did:** The Phase 5 SEO meta points the social/preview image at
`/api/og?page=compute-frontier`. That endpoint had no branch for the page, so
it fell back to the generic home card. Added a proper Compute Frontier og card
(and a per-cluster variant keyed on the `name` param) backed by a small
`computeFrontierOgStats` helper (clusters, planned GW, operational GW). Now the
shared link card actually reflects the module.

**Verification:** `npm run check` exit 0 (0 errors) · `npm test` 51/51 ·
`npm run build` exit 0.

### Ext E — one more verified cluster (and two integrity-driven exclusions)

**Did:** Added **Stargate Michigan (Saline Township)** after a web pass:
~1.4 GW, MISO, DTE Energy + battery, construction began early 2026, part of
the 4.5 GW Oracle-OpenAI expansion, with three real sources. Registry is now
33 clusters, ~31.7 GW planned. Updated the README and blog counts to match.

**Decisions (and why):**
- *Excluded Fermi America "Project Matador" (Amarillo, 11 GW), on purpose.*
  It is an energy complex led by an energy developer, not a hyperscaler
  cluster, and it has no published compute-only power figure. Counting its
  full 11 GW as compute power would have distorted the planned-MW total and
  the operator-concentration metric. No defensible compute number means no
  entry. Integrity over count.
- *Excluded the Anthropic/Fluidstack Texas + New York sites* for now: the
  $50B plan is real but the announcement does not pin specific sites,
  coordinates, or per-site MW, so a precise entry would be invented.

**Verification (real output):** dataset revalidated (33 clusters, 3 linked
deals, 31.7 GW planned, no errors) · `npm run check` exit 0 · `npm test`
51/51 · `npm run build` exit 0.

---

## Merge to main (2026-06-20, follow-up; Jack's call, reversing the original "do not touch main")

**Did:** Per Jack's explicit instruction after the overnight run, fast-forwarded
`main` to the Compute Frontier work and pushed it. PR #3 auto-closed as MERGED.
- `git merge --ff-only feat/compute-frontier` into main: clean fast-forward, no
  conflicts (the branch descended straight from main's tip).
- Re-verified on `main`: `npm run check` exit 0 (0 errors), `npm test` 51/51,
  `npm run build` exit 0.
- `git push origin main` (`4286183..5f6eb25`).

## Research pass + data refresh (2026-06-23)

**Did:** Jack flagged we might be missing key players, so I ran four parallel
research agents (Stargate ecosystem; Meta/Microsoft/Google; AWS/xAI/Tesla;
neoclouds + miner-turned-AI). Folded in the high-confidence, multi-sourced
findings. **Registry grew 33 -> 49 clusters, 11 -> 19 operators, ~30 -> ~47 GW
planned, ~1.3M -> ~1.52M disclosed accelerators (now 7 disclosing clusters).**

**8 operators that were missing entirely, now added:** Nscale (Cedarvale/
Barstow TX, ~104k GB300 for Microsoft), Galaxy Digital (Helios, Dickens
County TX, 800 MW to CoreWeave), IREN (Sweetwater 2 GW hub + Childress,
GB300/Microsoft), Applied Digital (Polaris Forge 2, Harwood ND), TeraWulf
(Lake Mariner NY), Cipher Mining (Black Pearl, Wink TX, AWS), Stack
Infrastructure (Stafford VA, 1.1 GW), and Tallgrass (Project Jade, the
re-attributed Cheyenne site). Plus new flagship sites from existing
operators: Stargate Wisconsin (Vantage Lighthouse), Meta El Paso and Temple,
Microsoft/Chevron Pecos (Project Kilby, clean 2 GW compute figure), QTS Van
Wert, Crusoe Goodnight (Google) and Crusoe Abilene II (Microsoft), and a
split Tesla Cortex 1 / Cortex 2.

**Staleness fixes:** xAI Colossus 1 power 300 -> ~500 MW; Colossus 2
construction -> operational (ramping, ~350 MW) since Google/SpaceX rent
capacity there; Tesla single entry split into Cortex 1 (130 MW) + Cortex 2
(500 MW); Nebius Independence 800 -> 1,200 MW; Microsoft Fairwater WI ->
operational (first building live 6/23/2026); Stargate Dona Ana announced ->
construction (developer STACK).

**Decisions (integrity calls):**
- *Removed `crusoe-wyoming`, re-added as `project-jade-cheyenne`.* Crusoe
  paused/exited that project (~Apr-Jun 2026, reportedly after Google raised
  concerns); leaving it as "Crusoe, 1.8 GW" was wrong. Re-attributed to
  Tallgrass (DC developer undisclosed), 2.7 GW.
- *Still excluded Fermi America (11 GW Amarillo) and Homer City* — energy
  campuses with no published compute-only figure. Added Microsoft Pecos
  instead because it has a clean disclosed 2 GW compute target separate from
  generation.
- *Did not invent Google-Anthropic TPU sites* (the 1M-TPU deal is real but
  the 5 sites are disclosed only at state level) or speculative Anthropic/
  Fluidstack city pins; added the better-sourced TeraWulf Lake Mariner site
  on its own merits. Skipped pure-colo (Switch) and sub-300 MW Tier-B sites.
- Every new figure is sourced (per-cluster `sources[]`) or flagged in
  `estimated[]`; GPU counts null unless an operator disclosed one.

**Verification (real output):** integrity revalidated (49 clusters, 19
operators, no dup ids, every `estimated[]` a real field, every `linkedDeal`
resolves, all https sources) · `npm run check` exit 0, 0 errors · `npm test`
51/51 · `npm run build` exit 0. README + blog counts updated to 49/19.

## Coverage expansion round 3 (2026-06-26)

**Did:** Third discovery-only sweep (deep tail: REIT/colo AI campuses, more
hyperscaler regional, neoclouds, AI-chip clouds, smaller miners, full state
sweep). 133 candidates; integrated 64 net-new after dropping, on integrity
grounds: 2 generation-as-compute (Homer City 3.7 GW, Vermaland 3 GW land play),
5 operational-with-zero-power (Voltage Park x3, Groq, Cerebras), 5 low-
confidence, and a string of developer-vs-tenant / same-site duplicates that the
operator-aware dedup missed because the operator name differs (e.g.
vantage-port-washington == stargate-wisconsin, stargate-saline +
related-digital-the-barn == stargate-michigan, stargate-red-oak == databank-
red-oak, fluidstack-barber-lake == cipher-barber-lake, applied-digital-forge-1
== coreweave-ellendale, fluidstack-lake-mariner == terawulf-lake-mariner,
edgeconnex-lambda-chicago == lambda-chicago-edgeconnex, two more Lordstown/
Shackelford restatements). A follow-up consolidation pass then harmonized
operator strings (PowerHouse) and removed 5 more same-operator dups
(xai-colossus-2-memphis, qts-cedar-rapids-big-cedar, applied-digital-forge-2 ==
applied-digital-harwood, vantage-nv1 restatement, powerhouse-provident
restatement). **Registry 176 -> 235 clusters, 64 -> 77 operators, ~106 -> ~125
GW planned, ~11.2 GW operational, 12 GPU-disclosing (~1.58M).**

**Dedup hardening:** added a cross-operator same-site detector that compares
coordinates AND shared non-city name tokens, so a campus listed under both its
developer and its AI tenant collapses to one entry, while genuinely distinct
operators co-located in a hub (New Albany OH, Lithia Springs GA, Eagle Mountain
UT, Mesa AZ, Culpeper VA, the Tahoe-Reno Industrial Center) stay separate.
Final scan shows zero residual cross-operator shared-identity pairs.

**Integrity:** generation-vs-compute and tenant-in-landlord double-counts kept
out; every entry sourced; operational entries all have rated power > 0 (guard);
GPU null unless disclosed. Node integrity check + 53 tests + build all green.

---

## Coverage expansion round 2 (2026-06-26)

**Did:** Discovery-only sweep (12 deep slices, no verify stage, so no stall).
Found 147 candidates; 53 were dups of the live set (caught by id + name +
operator-aware coordinate proximity, e.g. google-goodnight == crusoe-goodnight,
vantage-frontier == stargate-shackelford). Integrated 88 net-new after
dropping a low-confidence Quincy entry, an SB-Energy framing of the existing
Milam Stargate site, a bad-source Bitfarms entry, and one true tenant-in-
landlord double count (lambda-cologix-col4 == cologix-col4). **Registry 90 ->
178 clusters, 41 -> 68 operators, ~75 -> ~106 GW planned, ~9.5 GW operational,
11 GPU-disclosing clusters (~1.57M accelerators).**

**Dedup lesson (fixed mid-integration):** a naive coordinate-proximity dedup
wrongly merged DISTINCT operators' campuses that merely share a metro (Mesa AZ,
Culpeper Tech Zone, Frederick/Quantum Loophole, Tahoe-Reno Industrial Center).
Fixed to operator-aware: merge only same-operator-near OR same exact facility.
Multi-operator co-located hubs are real and now correctly listed separately.

**Integrity:** spot-checked the most obscure finds (Gigaland Fauquier VA,
Copper Ridge Culpeper VA, CloudBurst San Marcos TX) against live sources -- all
real; agents sourced accurately. Operator strings normalized (tenant/landlord
parentheticals stripped). Every entry sourced; operational entries all have
rated power > 0 (guard); GPU null unless disclosed; generation-vs-compute
excluded. Node integrity check + 53 tests + build all green.

---

## Coverage expansion round 1 (2026-06-26)

**Did:** Jack asked to maximize entries. Ran a 12-slice parallel discovery +
adversarial-verification workflow. Discovery found 121 candidates (120 after
dedup); the verification phase partly stalled, so it returned 44 fully-verified
ones. Integrated 43 (dropped Fermi America's "HyperGrid"/Project Matador, which
listed 11 GW of generation as compute power, a generation-vs-compute violation I
hold a standing exclusion on). **Registry 49 -> 92 clusters, 19 -> 41
operators, ~47 -> ~75.5 GW planned, ~5.2 GW operational.**

New operators include the miner-turned-AI and developer long tail: Hut 8,
Bitdeer, Riot Platforms, Soluna, CleanSpark, Keel (ex-Bitfarms), Northern Data,
plus Aligned, Vantage, Switch, Compass, T5, Prime, PowerHouse, Tract/Fleet,
Sailfish, Prometheus Hyperscale, Novva, GridFree AI, New Era (TCDC), Poolside,
and six more Meta campuses (Lebanon/Jeffersonville IN, Kansas City, DeKalb,
Fort Worth, Montgomery).

**Integrity:** every added entry carries >=1 real https source; operator names
normalized (parentheticals/tenant clauses moved out so the operator breakdown
does not fragment); operational entries all have rated power > 0 (the guard);
linkedDeal null on all new ones; GPU counts null unless disclosed (no new
disclosures, so 7 clusters / ~1.52M accelerators unchanged); big announced land
plays kept as status=announced with planned MW flagged est. Full node integrity
check passes (no dup ids, all sources https, all estimated[] valid).

**Verification:** `npm run check` 0 errors · `npm test` 53/53 · `npm run build`
exit 0. More rounds to come (leaner, without the verify stage that stalled).

---

## Headline correction + integrity guards (2026-06-25)

**Did:** A multi-agent audit workflow (audit -> judge -> synthesize) picked the
single best improvement and caught a real bug: `microsoft-fairwater-wi` was the
only operational cluster with `ratedPowerMW: 0` (introduced 2026-06-23 when its
status flipped to operational but rated power was left at 0). That silently
dropped ~400 MW (10%) from the "Operational power" headline on the flagship
Compute Frontier page.

- TDD fix: added two dataset-invariant tests first (no operational cluster has
  zero rated power; every linkedDeal resolves to a tracked deal id), watched the
  first fail on Fairwater, then set `ratedPowerMW` 0 -> 400 (flagged `est.`).
- Sourced the number: 400 MW is Microsoft's own Phase-1 figure from the We
  Energies / Wisconsin PSC filing (added as a source); 900 MW remains the
  two-phase single-site figure. Both adversarially web-verified.
- Headline `operationalMW` corrected 3,920 -> 4,320 MW (3.9 -> 4.3 GW). The two
  new guards make this whole class of error fail the build going forward.

**Verification (real output):** `npm run check` exit 0 (0 errors) · `npm test`
53/53 pass (51 + 2 new guards) · `npm run build` exit 0. Diff review verdict:
SHIP (surgical data edit, real guards, number flows to the headline, est. tag
renders, no side effects).

**Flags for Jack:**
- **Replit is not redeployed.** main is pushed but not shipped; redeploy via
  Replit → Deployments → Redeploy to put it on gridtilt.com.
- **The other open PRs now sit behind this on main.** PR #2
  (`feat/real-metrics`, the indices→scoreboard rewrite) edits the same files
  Compute Frontier touched (`routes.ts`, `seo.ts`, `social-format.ts`), so it
  will need conflict resolution against the new main when it merges. PR #1
  (`fix/m0-m1-truth-security`) similarly rebases onto the new main.
- **Live render still unverified by me.** The harness blocks me from running
  the dev server (it crosses the reusePort/no-dev boundary from the brief), so
  the browser render of the new pages has not been exercised from here. Static
  verification (tsc, 51 tests, build) is green. Confirm the live UI via a Replit
  redeploy, or locally by temporarily removing the `reusePort` line in
  `server/index.ts` and running `UNSUB_TOKEN_SECRET=dev-x PORT=5050 npm run dev`
  then opening `http://localhost:5050/compute-frontier`.
