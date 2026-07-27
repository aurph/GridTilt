# GridTilt Editorial Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild GridTilt's UI/UX as a warm-paper editorial research publication (spec: `docs/superpowers/specs/2026-07-23-editorial-redesign-design.md`), removing the dark-terminal idiom entirely.

**Architecture:** Token-level replacement first (the shadcn HSL vars + Lake-1 data tokens flip every existing component to paper in one move), then a new masthead shell replaces the sidebar/ticker chrome, then per-page conversion applying a fixed editorial grammar via shared primitives. Server untouched.

**Tech Stack:** React 18 + Vite + Tailwind 3 + wouter + react-query (unchanged); Recharts/D3/Leaflet (unchanged); Google Fonts Newsreader + Public Sans (new).

**Plan style note:** Foundation tasks (1-5) carry exact code. Page tasks (6-14) carry a conversion contract — target structure, primitives, kill-list, verification — because page JSX is produced against rendered output at execution time per the spec's grammar (§4.3-4.5). Executor must have the spec open. Before any chart-color work, load the `dataviz` skill (Task 2 requires it).

## Global Constraints

- Brand orange `#F07800` graphic-only; orange text uses `#9E5000` (`--brand-ink`).
- Light only. No `.dark` block, no forced dark, no mono identity type, no uppercase tracking-widest microcaps (exception: table column heads, Public Sans 11-12px, small-caps).
- All 27 routes + redirects and G-chord shortcuts keep working; seo.ts copy edits only.
- CLAUDE.md §5 do-not-touch respected (server modules, seo.ts structure, social-format.ts, security middleware, index math).
- shadcn `client/src/components/ui/*` is a house fork — restyle via tokens/classes, never regenerate.
- Tests green at every commit (`npm test`, 265 passing baseline); `npm run check` gains zero NEW errors and Task 5 removes the 3 pre-existing PowerMap errors; `npm run build` green at every milestone commit.
- Commits: imperative, area-prefixed, no Co-Authored-By. No em dashes in any product copy; plain voice.
- New files kebab-case; reads via default queryFn `useQuery({queryKey:["/api/x"]})`; writes via `apiRequest()`.

---

### Task 1: Fonts + token system replacement

**Files:**
- Modify: `client/index.html` (font link, `class="dark"` removal, theme-color)
- Modify: `client/src/index.css` (full `:root` replacement; delete terminal CSS)
- Modify: `client/src/lib/tokens.ts` (TS mirror)
- Modify: `tailwind.config.ts` (only if a var alias needs adding; fonts already read `var(--font-*)`)
- Test: `client/src/lib/__tests__/tokens-sync.test.ts`

**Interfaces:**
- Produces: CSS vars + `tokens` object consumed by every later task. Names: `--paper`, `--paper-shade`, `--paper-deep`, `--rule`, `--rule-strong`, `--ink`, `--ink-2`, `--ink-3`, `--brand`, `--brand-ink`, `--positive`, `--negative`, `--warning`, `--info-ink`, `--estimate`, chart chrome vars (Task 2), plus remapped shadcn slots.

- [ ] **Step 1: Read `tokens-sync.test.ts` and `tokens.ts`** to learn the sync mechanism before touching either.
- [ ] **Step 2: index.html** — replace the fonts link; drop `class="dark"`:

```html
<html lang="en">
...
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700&family=Public+Sans:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
```

Keep `theme-color` `#F07800` (brand mark, fine on any bg).
- [ ] **Step 3: index.css `:root`** — replace both token blocks. shadcn HSL slots:

```css
:root {
  --background: 40 40% 94%;        /* #F6F2EA paper */
  --foreground: 30 22% 9%;         /* #1C1712 ink */
  --border: 40 26% 80%;            /* #D9D0BE rule */
  --card: 40 43% 96%;              /* #F9F6F0 plate */
  --card-foreground: 30 22% 9%;
  --card-border: 40 26% 80%;
  --popover: 40 43% 96%;
  --popover-foreground: 30 22% 9%;
  --popover-border: 40 26% 80%;
  --primary: 30 100% 47%;          /* #F07800 graphic */
  --primary-foreground: 30 22% 9%; /* ink on orange (white fails contrast) */
  --secondary: 40 36% 90%;         /* #EFE9DD */
  --secondary-foreground: 30 22% 9%;
  --muted: 40 36% 90%;
  --muted-foreground: 33 11% 33%;  /* #5C544A */
  --accent: 40 36% 90%;
  --accent-foreground: 30 22% 9%;
  --destructive: 5 61% 44%;        /* #B3382C */
  --destructive-foreground: 40 40% 94%;
  --input: 40 26% 80%;
  --ring: 30 100% 31%;             /* #9E5000 */
  --radius: 0.125rem;
  --font-sans: "Public Sans", -apple-system, "Segoe UI", sans-serif;
  --font-serif: "Newsreader", Georgia, serif;
  --font-mono: ui-monospace, "SF Mono", monospace; /* fallback only; never identity */
  /* keep --sidebar-* slots mapped to paper equivalents so ui/sidebar.tsx compiles:
     sidebar=card, sidebar-foreground=ink, sidebar-primary=30 100% 31%, accent=muted */
}
```

Data tokens (same `:root`):

```css
  --paper: #F6F2EA; --paper-shade: #EFE9DD; --paper-deep: #E5DDCC;
  --rule: #D9D0BE; --rule-strong: #B9AE97;
  --ink: #1C1712; --ink-2: #5C544A; --ink-3: #8A8172;
  --brand: #F07800; --brand-ink: #9E5000;
  --brand-wash: rgba(240, 120, 0, 0.07);
  --positive: #1E7A46; --negative: #B3382C; --warning: #8F6400; --info-ink: #2B5D8A;
  --estimate: #8F6400; --dq-estimated-opacity: 0.6; --dq-synthetic-opacity: 0.35;
  --chart-axis: #8A8172; --chart-tick: #5C544A;
  --chart-grid: rgba(28, 23, 18, 0.08); --chart-crosshair: rgba(28, 23, 18, 0.3);
  --chart-ref-line: rgba(28, 23, 18, 0.18); --chart-context: #A79D8C;
  --focus-ring-color: #9E5000; --focus-ring-width: 2px;
  --duration-fast: 120ms; --duration-base: 200ms; --duration-slow: 350ms;
```

Keep the old `--series-1..10` slots temporarily (Task 2 replaces values) so the sync test scope is clear per commit. Elevate/shadow vars: replace with light equivalents (`--elevate-1: rgba(28,23,18,.03)`, `--elevate-2: rgba(28,23,18,.06)`, shadows at low alpha `rgba(28,23,18,.08-.16)`).
- [ ] **Step 4: Delete terminal CSS from index.css**: `html { color-scheme: dark }` → `light`; kill `.live-pulse`, `.ticker-scroll` + keyframes, `.sc-mono`, the mono font-family declarations inside every `.sc-*` rule (inherit sans), custom scrollbar rules (native scrollbars are the print-honest choice), `.sidebar-nav-*` rules, `.feature-preview-img`, carousel keyframes. KEEP: `.sc-page/graph/legend/detail` structural rules (restyle colors to new vars), focus-visible block, reduced-motion block (drop dead selectors), tabular-nums block (change selector `.font-mono, code, td, th` → `td, th, .tnum`).
- [ ] **Step 5: tokens.ts** — mirror every value changed above, per the sync mechanism learned in Step 1.
- [ ] **Step 6: Update `tokens-sync.test.ts` expectations** for renamed/removed vars (e.g. surface-sunken/raised/overlay → paper trio) if the test hardcodes names.
- [ ] **Step 7: Run** `npm test` → 265 pass (or knowingly-updated count); `npm run check` → only the 3 pre-existing PowerMap errors; `npm run build` → green.
- [ ] **Step 8: Commit** `design: replace terminal tokens with warm-paper editorial system`

### Task 2: Chart theme + categorical palette (REQUIRES dataviz skill loaded first)

**Files:**
- Modify: `client/src/lib/chart-theme.ts`, `client/src/index.css` + `client/src/lib/tokens.ts` (`--series-*` values)
- Test: existing `tokens-sync.test.ts`; add validation evidence to commit message

**Interfaces:**
- Produces: `chartTheme` consumed by all chart code: axis/tick/grid colors from Task 1 vars; `SERIES: string[]` (≤8, assign-in-order); `HIGHLIGHT = tokens.brand` (#F07800, reserved, not a SERIES slot); `CONTEXT = #A79D8C`.

- [ ] **Step 1: Load the `dataviz` skill.** Follow its color formula + run its validator for a categorical set against `#F6F2EA`.
- [ ] **Step 2: Candidate set** (muted editorial, no orange-family): slate blue `#2B5D8A`, green `#3E7A4E`, plum `#7C5288`, teal `#2E7D74`, maroon `#8F4A3C`, ochre `#8F6D1F`, warm gray `#7A7264`, navy `#274060`. Replace/reorder per validator (adjacent-ΔE + CVD sims on paper ground). Failures → adjust L/C, re-run.
- [ ] **Step 3: Rewrite chart-theme.ts**: paper grammar constants (grid hairlines, no chart-box backgrounds, direct-label helpers if present), validated SERIES, HIGHLIGHT/CONTEXT exports; update `--series-*` in index.css + tokens.ts to final values.
- [ ] **Step 4: Run** `npm test`, `npm run check`. Green (minus the 3 PowerMap).
- [ ] **Step 5: Commit** `design: paper-ground chart theme, validated categorical palette`

### Task 3: PowerMap type errors (pre-existing main breakage)

**Files:**
- Modify: `client/src/pages/PowerMap.tsx:459-477` or `tsconfig.json` types config

- [ ] **Step 1: Reproduce in worktree**: `npm run check` → 3 errors (`MarkerClusterGroup` not on `@types/leaflet`). Both `leaflet.markercluster@^1.5.3` and `@types/leaflet.markercluster@^1.5.6` are installed; diagnose why augmentation fails (likely @types/leaflet v2 vs augmentation targeting v1, or missing side-effect type import).
- [ ] **Step 2: Fix minimally** — prefer aligning the @types pair or adding `import type {} from "leaflet.markercluster"`; cast-with-comment only as last resort.
- [ ] **Step 3: Run** `npm run check` → **0 errors** repo-wide. This is the gate every later task inherits.
- [ ] **Step 4: Commit** `fix: restore leaflet markercluster typings`

### Task 4: Masthead shell replaces sidebar + ticker chrome

**Files:**
- Create: `client/src/components/masthead.tsx`, `client/src/components/colophon.tsx`
- Modify: `client/src/App.tsx` (dashboard + marketing layouts unify under masthead)
- Delete from shell (files kept until Task 15 sweep): `app-sidebar.tsx` usage, `NewsTicker` mount, `Header()` in App.tsx

**Interfaces:**
- Produces: `<Masthead condensed?: boolean>` — wordmark row (orange tilt mark SVG reused from existing logo asset + "GridTilt" in Newsreader 600; dek "Energy infrastructure, in plain sight."), nav rule row (8 sections: Today `/overview`, Markets `/stack`, Power `/power-map`, Compute `/compute-frontier`, GPUs `/neocloud-intel`, Analyze `/analyze`, Catalysts `/catalysts`, Analysis `/blog`), date line ("Wednesday, July 23, 2026" from client Date), sticky condensation on scroll (single thin row: mark + sections). Active section = 3px `--brand` underline bar + `--brand-ink` label. Mobile (<768px): wordmark + "Sections" button → full-screen index overlay.
- `<Colophon>` — mission line, methodology/sources links (existing routes), citation block, subscribe link, X link, licensing note. Double rule top.

- [ ] **Step 1: Build `masthead.tsx`** with wouter `useLocation` for active state; keyboard: preserve existing G-chord handler in App.tsx untouched.
- [ ] **Step 2: Build `colophon.tsx`.**
- [ ] **Step 3: Rework App.tsx layouts**: one layout — `<Masthead/>` + `<main>` + `<Colophon/>` for ALL routes including "/" (Home keeps its own hero inside `<main>`). Remove `SidebarProvider/AppSidebar/Header/NewsTicker` from the tree. Admin routes may keep a plain wrapper. BARE_ROUTES logic simplifies; verify `/admin/*` still render.
- [ ] **Step 4: Run** app locally (`UNSUB_TOKEN_SECRET=dev-x PORT=5050 npm run dev`), click through all 8 sections, verify chords + mobile overlay at 390px via devtools emulation (headless screenshot).
- [ ] **Step 5: `npm test` + `npm run check` + `npm run build`** green. Some tests may import removed components — fix imports, never skip tests.
- [ ] **Step 6: Commit** `design: masthead shell replaces sidebar and ticker chrome`

### Task 5: Editorial primitives

**Files:**
- Create: `client/src/components/editorial.tsx` (one file, focused exports)
- Modify: `client/src/components/PageHeader.tsx` (reimplement atop primitives, keep export signature so pages compile until converted), `client/src/components/ToolTabs.tsx` (restyle: text tabs + orange underline bar, no boxes), `client/src/components/Freshness.tsx` (AsOf → provenance line style; ErrorState/SrChartTable restyled)

**Interfaces (Produces, exact):**
```tsx
export function PageTitle({ title, dek, right }: { title: string; dek?: ReactNode; right?: ReactNode })
// Newsreader 32-40px title, optional 17-19px dek, hairline rule below; right slot for page-level controls
export function RuleSection({ head, aside, children }: { head: string; aside?: ReactNode; children: ReactNode })
// 18-20px sentence-case section head over hairline rule; aside = right-aligned meta
export function Provenance({ source, updated, href, extra }: { source: string; updated?: string; href?: string; extra?: ReactNode })
// 12-13px --ink-3 credit line: "Source: X · Updated Y"; href wraps source; extra for methodology links
export function PullStat({ label, value, delta, note }: { label: string; value: string; delta?: ReactNode; note?: string })
// Newsreader value 28-34px tabular, sans label 13px sentence case, NOT a bordered card
export function PrintTable(props: React.TableHTMLAttributes<HTMLTableElement>) // + <th>/<td> conventions via CSS
// .print-table CSS in index.css: hairline horizontal rules, small-caps heads, right-aligned .tnum figures, --paper-shade hover
```

- [ ] **Step 1: Implement `editorial.tsx`** + `.print-table` CSS block.
- [ ] **Step 2: Reimplement PageHeader** as a thin adapter rendering PageTitle (title + about→dek demotion, stats→right slot) so unconverted pages instantly read editorial; HeaderStat loses mono/uppercase (sans label + tabular value).
- [ ] **Step 3: Restyle ToolTabs + Freshness** per grammar (no pills, no mono).
- [ ] **Step 4: Verify** dev-server pass across several unconverted pages: they should already look 70% converted (paper, sans, editorial headers). Screenshot /overview + /catalysts as the before/after checkpoints.
- [ ] **Step 5: Tests + check + build; commit** `design: editorial primitives; PageHeader, tabs, freshness restyled`

### Task 6: Front page "/"

**Files:**
- Modify: `client/src/pages/Home.tsx`; Create: `client/src/components/home/front-page.tsx` (replaces Hero/FeaturesShowcase/Wordmark/FloatingScrollCue/DemandChart usage; old files deleted in Task 15)
- Modify: `client/src/styles/anchor.css` → superseded; Home stops importing `.gt-marketing` (delete import; file removed Task 15)

**Contract:** Newspaper front page per spec §4.5: masthead already global; lead story (biggest tracked delta today — reuse the diff logic pattern from `server/social-format.ts` consumers via existing APIs `/api/clusters/metrics`, `/api/gpu-prices/metrics`, `/api/stack`; pick by largest meaningful move, fallback priority order; written headline + one featured chart in FT grammar); key-numbers band (4 PullStats + Provenance each: tracked AI DC power, fleet GPU price, grid headroom, signed nuclear GW — all served today); Latest headlines (existing `/api/news` feed as ruled list with source+time, no scroll animation); Latest analysis (blog index API, 3 entries, bylined); section directory (8 sections, one-line description each, no screenshots); subscribe band (EmailCapture restyled). Typing animation, scroll cue, dark hero: dead. SEO: "/" meta copy in seo.ts updated to publication framing (copy-only edit).

- [ ] Step 1: Build front-page.tsx sections against live dev data.
- [ ] Step 2: 1440px + 390px screenshots; adjust to grammar.
- [ ] Step 3: Tests + check + build; commit `design: front page merges marketing and daily lead`

### Task 7: Today (/overview)

**Files:** Modify `client/src/pages/TiltOverview.tsx`

**Contract:** PageTitle "Today" + dated dek; movers as PrintTable (ticker, name, price, change — positive/negative ink colors, no arrows-in-pills); sector pulse as compact heat table (bg intensity via `--brand-wash`→`--paper-deep` ramp, ink text, CVD-safe since intensity+number); buildout-over-time chart in FT grammar (direct end labels, orange = tracked-total series only); catalyst list as agenda rows; module carousel and @gridtilt embed sections REMOVED (front page owns directory role); US demand chart kept with Provenance (FRED/EIA). Kill all uppercase microcap h2s (RuleSection heads), all font-mono, info-popover explains → one dek sentence or nothing.

- [ ] Steps: convert → screenshots both widths → tests/check/build → commit `design: overview page in editorial grammar`

### Task 8: Markets (/stack + flow view)

**Files:** Modify `client/src/pages/TheStack.tsx`, `client/src/pages/SupplyChain.tsx`, `client/src/lib/stack-transforms.ts` only if view props change

**Contract:** Layers as RuleSections with PrintTables (sparklines keep honest-baseline behavior, recolor: line `--ink-2`, fill none, current point `--brand`); cards/heatmap/flow view switcher via restyled ToolTabs. Force graph KEPT: paper bg, links `--rule-strong`, nodes by stage via SERIES, labels Public Sans 11px (kill `.sc-*` mono families — done partly in Task 1 CSS), stage-anchored x explicit label retained, focus ring `--brand`. `.sc-topbar` pipe separators removed (spacing does the separation).

- [ ] Steps: convert both files → exercise all views incl. graph drag/click → screenshots → tests/check/build → commit `design: stack and supply-chain flow in editorial grammar`

### Task 9: Power (/power-map: Map/Deals/Queue)

**Files:** Modify `client/src/pages/PowerMap.tsx`, `client/src/pages/power-deals.tsx`, `client/src/pages/Queue.tsx`

**Contract:** Leaflet basemap → CartoDB Positron (light) tiles with attribution; markers/cluster styles warm (orange dot = operational, ink ring = construction, ochre = announced; MarkerCluster.Default.css overridden by scoped CSS); map as captioned plate (hairline border + caption row + Provenance). Deals/Queue → PrintTables; firmness/status as typographic distinctions (weight/ink color + dagger footnotes), not badge pills. LBNL/queue provenance lines mandatory.

- [ ] Steps: convert → verify cluster interactions + tab switches → screenshots → tests/check/build → commit `design: power map, deals, queue in editorial grammar`

### Task 10: Compute Frontier (+detail/compare/methodology)

**Files:** Modify `client/src/pages/compute-frontier.tsx`, `ComputeFrontierDetail.tsx`, `ComputeFrontierCompare.tsx`, `ComputeFrontierMethodology.tsx`

**Contract:** Master cluster table = the atlas centerpiece: PrintTable with per-row est. footnote daggers, operator links, energy-source column; summary PullStats band with Provenance; detail = reference entry (name + classification line, figures row, relations lists, sources footer); compare = side-by-side ruled columns; methodology = prose measure (68ch) Newsreader-led. Est. flags: ochre dagger + footnote line, never removed.

- [ ] Steps: convert 4 files → screenshots (list + one detail) → tests/check/build → commit `design: compute frontier atlas pages`

### Task 11: GPU Prices (/neocloud-intel: Prices/Economics/Frontier tabs)

**Files:** Modify `client/src/pages/neocloud-intel.tsx`, `client/src/pages/gpu-economics.tsx`, `client/src/pages/frontier-models.tsx`, `client/src/components/neocloud/*`, chart transform libs untouched

**Contract:** Index chart in FT grammar: fleet index line = orange HIGHLIGHT, per-model lines = CONTEXT gray until hovered/selected (then SERIES slot), direct end labels, no legend box; maker-grouped PrintTables (est. daggers); weighted index table with Provenance-on-row-hover → visible Provenance line instead; economics calculators as worksheet blocks (ruled forms, results as PullStats); frontier relay charts recolored via chartTheme.

- [ ] Steps: convert → exercise tab/hover/select interactions → screenshots → tests/check/build → commit `design: gpu price pages in editorial grammar`

### Task 12: Analyze + Catalysts

**Files:** Modify `client/src/pages/Analyze.tsx`, `PortfolioOverlay.tsx`, `TheTrade.tsx`, `CatalystTracker.tsx`

**Contract:** Analyze = worksheet: inputs as ruled form sections, outputs as PullStats + one chart each; model-basket/illustrative disclaimer text preserved verbatim, restyled as a footnote block. Catalysts = print agenda grouped by week: date column (Newsreader numerals), event line, earnings vs policy distinguished by type treatment (weight + `--info-ink` vs ink), no pills.

- [ ] Steps: convert → exercise sliders/inputs → screenshots → tests/check/build → commit `design: analyze worksheets and catalyst agenda`

### Task 13: Analysis (blog) + subscribe + not-found

**Files:** Modify `client/src/pages/BlogIndex.tsx`, `BlogPost.tsx`, `brief.tsx` (redirect target only — confirm no dead UI), `Subscribe.tsx`, `not-found.tsx`, `client/src/components/EmailCapture.tsx`

**Contract:** The most literally-editorial surface: index = headline list with deks/bylines/dates (Newsreader headlines); post = 68ch prose, drop-rule under title, source blocks; subscribe = single prose column + form (EmailCapture's dead marketing branch removed if trivially separable, else Task 15); not-found = one witty plain line + section links.

- [ ] Steps: convert → screenshots → tests/check/build → commit `design: analysis pages, subscribe, not-found`

### Task 14: Entity reference pages

**Files:** Modify `client/src/pages/StockPage.tsx`, `SectorPage.tsx`, `RegionPage.tsx`, `OperatorPage.tsx`

**Contract:** One shared visual template (implement inline per file, no premature abstraction): name + classification line, key-figures row (PullStats), one chart (FT grammar), ruled relation lists (holdings/clusters/deals per type), Provenance footer. Yahoo `stale:true` shows the honest "--" treatment restyled.

- [ ] Steps: convert 4 → screenshot one of each → tests/check/build → commit `design: entity reference templates`

### Task 15: Sweep, copy, docs, final verification

**Files:** Delete: `client/src/components/app-sidebar.tsx`, `client/src/components/NewsTicker.tsx` (if truly unmounted), `client/src/components/home/{Hero,FeaturesShowcase,FloatingScrollCue,Wordmark,DemandChart,HomeFooter}.tsx`, `client/src/styles/anchor.css`; Modify: `server/seo.ts` (copy strings only), `README.md` (design section), `CLAUDE.md` (§3 styling conventions rewritten to editorial system), `.claude`-adjacent docs untouched

- [ ] **Step 1: Grep gates** — each must return 0 in `client/src` (excluding ui/ fork internals where inert):
  - `grep -rn "font-mono" client/src --include="*.tsx"` (0)
  - `grep -rn "uppercase tracking-wide" client/src --include="*.tsx"` (0; small-caps table heads use CSS `font-variant-caps`)
  - `grep -rn "JetBrains\|Inter\|Source Serif" client/ --include="*.html" --include="*.css" --include="*.tsx"` (0)
  - `grep -rn "gt-marketing\|anchor.css" client/src` (0)
- [ ] **Step 2: Dead-file deletion** + import sweep; `npm run build` proves nothing referenced.
- [ ] **Step 3: seo.ts copy pass** (publication framing; structure/slugs untouched) + README/CLAUDE.md design sections.
- [ ] **Step 4: Full verify**: `npm test` (all pass), `npm run check` (0 errors), `npm run build` (green).
- [ ] **Step 5: Screenshot portfolio**: every section page + front page + one entity each, 1440px + 390px, saved to `docs/screenshots/redesign-2026-07/`; review against spec §4; declare any untested interactive path in the PR body.
- [ ] **Step 6: Commit** `design: sweep terminal remnants; copy and docs pass` → push branch → draft PR (title "Editorial redesign: warm-paper publication system", body = spec summary + screenshot gallery + verification evidence + untested-paths declaration).

## Self-review notes

- Spec coverage: §4.1-4.6 map to Tasks 1-14; §7 sequencing preserved; §8 verification = Task 15 + per-task steps. Provenance primitive (spec's first-class requirement) lands in Task 5 and is contractually required in every page task.
- Type consistency: primitive signatures defined once (Task 5) and referenced by name only afterward.
- Known judgment calls deferred to execution: exact lead-story fallback order (Task 6), sector-pulse ramp stops (Task 7), marker color mapping (Task 9) — all bounded by the spec's grammar.
