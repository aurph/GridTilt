# Compute Frontier — Spec

> A new GridTilt module that tracks individual hyperscale AI training and
> inference clusters ("superclusters") and ties each one to the power that
> runs it and the nuclear-for-AI deals GridTilt already tracks.

**Status:** design locked (Phase 0). Built autonomously on the
`feat/compute-frontier` branch. This document is both the design (what and
why) and the implementation plan (the phases). The dated build journal is
`docs/COMPUTE_FRONTIER_BUILD_LOG.md`.

---

## 1. Why this module exists

GridTilt's mission is to make the datacenter buildout easier to track and
understand, to eliminate obfuscation, and to stand with citizen-investors
rather than hedge funds. The existing modules cover the buildout at the
level of *campuses* (Power Map), *the grid* (Backlog/Queue), *equities*
(The Stack), and *contracted nuclear power* (the scoreboard, sourced from
`interconnection-queue.json`).

What is missing is the **compute layer**: the specific named clusters that
the AI race is actually being run on. How many GPUs. Which chips. How much
power each one rated and planned. Who operates it. And — the connective
question GridTilt is positioned to answer — **is the power those clusters
need actually secured?** Compute Frontier joins the compute layer to the
power layer.

### Relationship to the Power Map (a deliberate boundary)

The Power Map tracks datacenter campuses by power footprint and grid region
(`server/data/datacenters.json`). Compute Frontier is a different lens on a
partially overlapping set of physical sites: it adds the *compute*
dimension (GPU counts, chip generation, training vs inference) and the
*power-secured* dimension (`linkedDeal`). The two datasets are kept
**separate on purpose** — different schema, different intent, independently
testable. Some sites appear in both (e.g. Stargate Abilene); that is fine.
We cross-link the two modules in the UI rather than merging the data.

---

## 2. Data model

`server/data/clusters.json` is a curated JSON array. Each entry:

```ts
interface Cluster {
  id: string;            // stable kebab slug, e.g. "stargate-abilene"
  name: string;          // "Stargate Abilene (OpenAI/Oracle)"
  operator: string;      // primary operator, e.g. "OpenAI / Oracle"
  status: "operational" | "construction" | "announced";
  location: { city: string; state: string; lat: number; lng: number };
  gridRegion: string;    // ISO / RTO, e.g. "ERCOT", "PJM", "MISO", "TVA/SERC"
  gpuCount: number | null;   // disclosed accelerator count, else null
  chipType: string;      // "NVIDIA GB200", "NVIDIA H100/H200", "Trainium2", "TPU v5p", "mixed"
  ratedPowerMW: number;  // power available/contracted today (0 if pre-construction)
  plannedPowerMW: number;// full announced build-out power
  energySource: string;  // "grid + on-site gas", "nuclear PPA", "grid", ...
  workload: "training" | "inference" | "mixed";
  linkedDeal: string | null; // id of a nuclear-for-AI deal in interconnection-queue.json
  onlineDate: string;    // "2024 Q3", "2026", "2028" (free text, sortable lexically by year)
  estimated: string[];   // names of fields whose VALUES are estimates (see below)
  sources: string[];     // real source URLs
  notes?: string;        // one-line context shown in tooltip / detail
}
```

### Labelling estimates — the core integrity rule

Data integrity is the whole ethos. Every number is either sourced or
explicitly marked an estimate. We use a single, testable convention:

- `estimated: string[]` lists the **field names whose values are
  estimates** (e.g. `["gpuCount", "plannedPowerMW"]`).
- The UI renders a small `est.` tag next to any value whose key is in that
  array. Sourced values render plain.
- A unit test asserts every entry in every `estimated[]` is a real,
  numeric/estimable field key (`gpuCount`, `ratedPowerMW`, `plannedPowerMW`,
  `onlineDate`). This makes "label every estimate" a property the test
  suite enforces, not a promise.
- `gpuCount: null` means "not disclosed and we will not invent one." Null is
  distinct from an estimate. Clusters with `null` GPU counts are excluded
  from GPU sums and the count of clusters-with-disclosed-GPUs is shown.

No fabricated precision: GPU counts and forward power figures are rounded to
the precision actually reported (e.g. "100,000 GPUs", "1,000 MW"), never to
false exactness.

### `linkedDeal`

When a cluster's power is (partly) served by a nuclear-for-AI deal GridTilt
already tracks, `linkedDeal` holds that deal's stable `id` from
`server/data/interconnection-queue.json`. Verified signed/optioned/proposed
deal ids available to link include: `tmi-crane` (Microsoft/Constellation),
`susquehanna-aws` + `talen-aws-frontofmeter` (AWS/Talen), `clinton-meta` +
`vistra-meta-existing-fleet` + `meta-oklo-pike` + `meta-terrapower-natrium`
(Meta), `duane-arnold-google` + `google-kairos-hermes2` (Google),
`aws-oklo-idaho` + `aws-xenergy-cascade` (AWS), `comanche-peak-3`,
`palisades`. Most clusters have `linkedDeal: null` (their power is grid or
gas, not a tracked nuclear deal) — that is the honest, common case.

---

## 3. Backend logic — `server/clusters.ts` (pure, TDD)

Mirrors `server/metrics.ts` / `server/indices.ts`: a pure module of
deterministic functions from dataset rows to displayed numbers, unit-tested
in `server/__tests__/clusters.test.ts`, with thin route wrappers in
`routes.ts`. No baselines, no normalization. Units are MW, GPUs, counts.

```ts
export interface ClusterLite { /* the fields the metrics need */ }

export interface ClusterMetrics {
  clusterCount: number;
  operationalCount: number;
  constructionCount: number;
  announcedCount: number;
  totalRatedMW: number;        // sum ratedPowerMW
  operationalMW: number;       // sum ratedPowerMW where status === operational
  totalPlannedMW: number;      // sum plannedPowerMW
  totalGpus: number;           // sum gpuCount, nulls skipped
  clustersWithGpuData: number; // how many contributed to totalGpus
  byStatus: StatusBucket[];    // { status, count, ratedMW, plannedMW }
  byOperator: OperatorBucket[];// { operator, count, ratedMW, plannedMW, gpus } desc by plannedMW
  byIso: IsoBucket[];          // { iso, count, ratedMW, plannedMW } desc by plannedMW
  gpusPerMW: number | null;    // totalGpus / (rated MW of the clusters counted in totalGpus); null if none
  concentration: {
    topOperator: string | null;
    topOperatorPlannedShare: number; // 0..1, top operator share of totalPlannedMW
    hhi: number;                     // Herfindahl index of operator planned-MW shares, 0..1
    operatorCount: number;
  };
  linkedDealCount: number;     // clusters with a non-null linkedDeal
  linkedDealIds: string[];     // distinct linked deal ids referenced
}

export function computeClusterMetrics(clusters: ClusterLite[]): ClusterMetrics;
```

Notes on the judgment calls (documented so they cannot drift silently):

- **`gpusPerMW`** divides total disclosed GPUs by the rated MW of *only the
  clusters that disclosed GPUs* — mixing in MW from GPU-less clusters would
  understate the ratio. Returns `null` when no cluster has both.
- **Concentration** uses planned MW (the forward buildout is the thing being
  concentrated). `hhi` is the sum of squared operator shares (1.0 = one
  operator owns everything; lower = more distributed). This is the
  "eliminate obfuscation / who controls the frontier" metric.
- All MW rounded to one decimal via a shared `toGw`-style helper; GPU sums
  are integers.

### Cross-dataset join (power needed vs power secured)

The pure module stays clusters-only. The **route layer** owns the join that
needs two datasets: for each cluster with a `linkedDeal`, look up that deal
in `interconnection-queue.json` and roll up "secured MW" vs "planned MW".
Exposed on `/api/clusters/metrics` as a `powerSecured` block. Kept out of
the pure module so `clusters.ts` has one clear responsibility.

---

## 4. API endpoints (thin wrappers in `routes.ts`)

- `GET /api/clusters` → the curated array (reads `clusters.json`).
- `GET /api/clusters/metrics` → `computeClusterMetrics(...)` plus the
  `powerSecured` join block.
- `GET /api/clusters/:id` → one cluster, 404 if unknown (feeds the
  per-cluster page).

All read `server/data/clusters.json` at request time via
`readFileSync(join(process.cwd(), "server", "data", "clusters.json"))`, the
same runtime-read pattern every other dataset uses (no bundling needed).

---

## 5. Frontend — `client/src/pages/compute-frontier.tsx`

Dark dashboard page, same shell as Queue/PowerMap (Tailwind HSL tokens,
`#F07800` accent used sparingly, `font-mono` for figures, shadcn `Card` /
`Badge` / `Skeleton` / `Tooltip`). Data via `@tanstack/react-query`.

Sections, top to bottom:

1. **Hero** (`grid-bg` band): title "Compute Frontier", one honest
   paragraph — tracked named AI superclusters, GPUs + power, tied to nuclear
   deals; "tracked, not exhaustive"; estimates labelled. Freshness chip +
   sources link, like Queue.
2. **Headline metric cards**: tracked clusters; operational MW / total rated
   MW; total planned MW; total tracked GPUs (with "across N disclosed");
   operators; planned MW with a secured-by-nuclear callout.
3. **Recharts breakdowns** (dark tooltip style already themed in
   `index.css`): MW by operator (horizontal bar), MW by ISO (bar), MW by
   status (bar), and a build timeline (planned MW coming online by year).
4. **Cluster table**: sortable (planned MW, rated MW, GPUs, online date,
   name) and filterable (operator, status, ISO, chip, linked-deal-only).
   Columns: name+operator, status badge, GPUs (`est.` tag when estimated),
   chip, rated MW, planned MW, ISO, energy, online, linked-deal star.
   Row tooltip shows notes + sources. Loading (Skeleton) / empty / error
   states, mirroring Queue.
5. **Leaflet map**: reuse the Power Map pattern — CARTO `dark_nolabels`
   tiles, `L.divIcon` glow markers colored by status, radius by planned MW,
   click → cluster. Loading + empty handled.

A per-cluster detail page renders at `/compute-frontier/:id` (Phase 5):
headline facts, power needed vs secured, linked deal link, sources.

## 6. Integration points

- `client/src/App.tsx`: routes `/compute-frontier` and
  `/compute-frontier/:id`; `PAGE_TITLES` entry; keyboard shortcut **G+0** →
  `/compute-frontier` (G+1..9 are taken; 0 is the natural next key) added to
  both the `SHORTCUTS` panel and the keydown handler.
- `client/src/components/app-sidebar.tsx`: nav item "Compute Frontier"
  (lucide `Cpu` icon), description "AI superclusters by GPU and power".
- Cross-links: Power Map → Compute Frontier and back; the buildout
  scoreboard (TiltOverview) → Compute Frontier; cluster rows with a
  `linkedDeal` → `/queue`.

## 7. SEO + programmatic pages (Phase 5)

- `server/seo.ts`: add `/compute-frontier` to `STATIC_PAGES` and a
  `Dataset` + breadcrumb JSON-LD branch in `getPageMeta`.
- Per-cluster meta: a `/^\/compute-frontier\/([a-z0-9-]+)$/` matcher in
  `getPageMeta` reading `clusters.json` for the cluster's name/location to
  build title, description, and `Place` + breadcrumb structured data.
- `export const SITEMAP_CLUSTER_SLUGS`, consumed by the `/sitemap.xml`
  builder in `routes.ts`.

## 8. Social (Phase 6, dry-run only)

`server/social-format.ts`: add a pure `buildComputeFrontierTweet(...)`
following the existing voice rules (lowercase prose; keep tickers/acronyms'
case; no manual column alignment; vary copy from real numbers; full
`https://` url). Unit-tested in `social-format.test.ts` like every other
template. A thin composer in `routes.ts` gathers live metrics and is wired
into `/api/social/generate` as a selectable template. **No posting** — dry
run only.

## 9. Content (Phase 7)

A blog post in `content/blog/articles.json` announcing Compute Frontier, in
GridTilt's plain non-marketing voice: no em dashes, no hype, states plainly
which figures are sourced and which are estimated.

## 10. Data methodology (sourced vs estimated)

Built from public announcements (company press releases, Reuters, Tom's
Hardware, Data Center Dynamics, SemiAnalysis, Tom's, utility filings). The
marquee clusters (Stargate Abilene, xAI Colossus, Meta Hyperion/Prometheus,
Microsoft Fairwater, AWS/Anthropic Rainier) are verified against multiple
sources, including a web pass during Phase 1, with real source URLs.

Power (MW) is the most consistently reported figure and is sourced where
possible. **GPU counts and forward/planned power are frequently undisclosed
or stated as targets**; these carry `estimated[]` flags or `gpuCount: null`.
Chip generation is sourced where stated, else `"mixed"`. We never invent a
derivation — if a number isn't reported and can't be conservatively bounded
from a stated figure, the field is null or flagged.

---

## 11. Phased implementation plan

Each phase: write code, run `npm run check` + `npm test` + `npm run build`
green, commit, append a build-log entry. TDD where there is pure logic
(Phases 2 and 6 write the test first).

- **Phase 0** — this spec + build log. Commit.
- **Phase 1** — `clusters.json` (25-40 clusters, all fields, `estimated[]`,
  real URLs; web-verify the marquee set). Commit.
- **Phase 2** — `clusters.test.ts` first, then `clusters.ts`; then
  `/api/clusters`, `/api/clusters/metrics`, `/api/clusters/:id`. Commit.
- **Phase 3** — `compute-frontier.tsx` (cards, charts, table, map, states).
  Commit.
- **Phase 4** — App route + G+0 + sidebar + cross-links. Commit.
- **Phase 5** — SEO static + per-cluster pages + sitemap. Commit.
- **Phase 6** — social template (TDD) + composer. Commit.
- **Phase 7** — blog post. Commit.
- **Phase 8** — README + build log. Commit.
- **Phase 9** — full verify green (real output), push, draft PR. No merge,
  no Replit.

Extensions if time remains: more clusters, cluster-vs-cluster comparison,
a methodology page, an expanded power-needed-vs-secured view, more tests.

---

## 12. Verification

`npm run check` (tsc), `npm test` (node:test), `npm run build`
(vite + esbuild). All three must be green before every commit and again at
Phase 9 with real output pasted into the build log and PR. macOS: do not
touch the `reusePort` line in `server/index.ts`; `dev` is not required.
