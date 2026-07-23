# GridTilt Editorial Redesign — Design Spec

Date: 2026-07-23
Status: approved for build (Jack's directive 2026-07-23; PR review is the final gate)

## 0. Directive

Jack, verbatim intent: the UI and UX get rebuilt from scratch. The current site reads as
one-shot AI output — "terminal bullshit dark," slashes and mono labels everywhere, UI
over-explaining itself. Keep the orange from the logo (#F07800). Everything else, brand
principles included, can change. Informed by SWOT + competitor research (survey memo run
2026-07-23; findings folded in below).

## 1. Why the current design fails (diagnosis from code, main @ f1003ca)

1. **Inverted hierarchy.** Section headings are 10-12px uppercase tracking-widest microcaps,
   smaller than the data they label; page titles are 14px. Nothing leads.
2. **Terminal idiom = AI tell.** 317 `font-mono` uses, 127 uppercase-label instances,
   pipe/slash separators, JetBrains Mono wordmark with a typing animation, forced dark
   charcoal with orange glow. The competitor survey's "AI-generated dashboard" cliché list
   matches this UI nearly item for item.
3. **Chrome tax.** Sidebar + header + perpetually scrolling news ticker on every page.
4. **Over-explanation.** Info popovers beside every title, subtitles under every stat, badge
   pills, methodology asides inline. The UI narrates instead of trusting the data.
5. **No narrative entry.** "/" is detached dark marketing; the dashboard is a wall of
   equal-weight tiles with no front page saying what matters today.
6. **Type stack is the AI default.** Inter + JetBrains Mono.

## 2. SWOT (reconstructed from the council/monetization record)

**Strengths** — proprietary daily-accruing curated datasets (~235 clusters/77 operators, GPU
rental index + history, interconnection queue, power deals, frontier-model registry);
code-enforced integrity (est. flags, per-claim sources, honest empty states); the only
product joining the financial and physical layers for a lay audience; 265-test safety net.

**Weaknesses** — looks AI-generated (discredits the data work); no ownable visual identity;
no hierarchy of attention or start-here narrative; tiny type; mobile an afterthought.

**Opportunities** — the niche's visual field splits terminal-dark (trader tools) vs
academic-white (Epoch, OWID); nobody owns warm editorial data-journalism for AI
infrastructure; "explain your power bill" civic wedge; credible design raises the ceiling
for the planned paid tier and B2B briefings; entity pages become link-worthy.

**Threats** — dark AI dashboards are a commodity anyone can one-shot (distinctiveness is the
defense); SemiAnalysis/Bloomberg own the professional end; the honesty positioning is
fragile — integrity surfaces must survive the redesign.

## 3. Competitor survey conclusions used here

Full memo in the session record; the operative findings:

- Every research-credible comp is **light by default**; FT (#FFF1E5) and Cleanview (#F7F3ED)
  prove *tinted warm paper* reads more deliberate than white. Dark belongs to trader tools.
- Credible products run a **two-family type system** (display serif or named grotesque +
  body sans): Messina Sans/Serif, Playfair+Lato, Financier+Metric, Hanken Grotesk. Nobody
  credible uses Inter-alone or mono-as-identity.
- **Provenance chrome is the strongest crafted-vs-generated signal**: update dates, source
  lines, downloads, methodology links, citations. One-shot dashboards never have it.
- **Chart grammar** of the credible set: charts share the page background (no dark chart
  boxes), thin gridlines, direct end-of-line labels over legends, ≤4 series, one highlight
  color, sentence-style annotations, "Source / Updated" credit per chart.
- Open positioning gap: **the warm-paper research publication of the AI buildout**, with
  atlas/reference-work IA for the data-heavy pages. Matches zero surveyed competitors.
- #F07800 on cream fails text contrast (~2.8:1): orange stays graphic-only; orange text
  uses a darkened ink variant.

## 4. The new identity

**Concept: GridTilt is a publication that has instruments, not a dashboard that has posts.**
The daily-accruing datasets are the newsroom; the pages are its sections; every number
carries its custody chain.

### 4.1 Color — "warm paper" (light only; dark mode is removed, not themed)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#F6F2EA` | page ground everywhere (charts share it — no chart boxes) |
| `--paper-shade` | `#EFE9DD` | wells, alternating table rows, aside blocks |
| `--paper-deep` | `#E5DDCC` | pressed/hover fills |
| `--rule` | `#D9D0BE` | hairline rules and borders |
| `--rule-strong` | `#B9AE97` | emphasized rules (section heads, table heads) |
| `--ink` | `#1C1712` | primary text, warm near-black |
| `--ink-2` | `#5C544A` | secondary text |
| `--ink-3` | `#8A8172` | captions, provenance lines |
| `--brand` | `#F07800` | GRAPHIC ONLY: logo tilt mark, active-state bars, the one highlighted chart series, folio rules |
| `--brand-ink` | `#9E5000` | orange as text: links, active nav labels (AA on paper) |
| `--positive` | `#1E7A46` | gains/up (text-weight AA on paper) |
| `--negative` | `#B3382C` | losses/down |
| `--warning` | `#8F6400` | warnings, est. flags keep their distinct treatment |
| `--info-ink` | `#2B5D8A` | informational accents (rare) |

Chart chrome: grid `rgba(28,23,18,0.08)`, axis `#8A8172`, context series `#A79D8C` (warm
gray), reference lines `rgba(28,23,18,0.18)`. Categorical palette: rebuilt for the paper
ground with the dataviz-skill formula + validator at build time (≤8 slots, CVD-checked
against #F6F2EA); orange is NOT a categorical slot — it is reserved for highlight.
Semantic vs categorical separation is retained from the old system (it was correct).

### 4.2 Typography

- **Display: Newsreader** (variable, optical sizing) — page titles, deks, front-page
  headlines, pull numbers. Newspaper display heritage without the FT license.
- **Text/UI: Public Sans** — body, navigation, tables, chart labels; tabular figures
  (`font-variant-numeric: tabular-nums`) for every numeral. Franklin Gothic lineage =
  American newsprint sans; fits "on the side of the people."
- **Mono: removed from the identity.** JetBrains Mono leaves index.html. No mono labels,
  no mono numerals, no uppercase tracking-widest microcaps anywhere in app UI. The one
  sanctioned small-caps use: table column headers (a legitimate print idiom), set in
  Public Sans 11-12px medium, normal tracking, sentence case or true small caps.
- Scale: page title 32-40 (Newsreader 500, opsz high), dek 17-19 (Newsreader 400 italic or
  Public Sans 400), section head 18-20 (Public Sans 600 or Newsreader 600), body 15-16,
  table/data 13-14, caption/provenance 12-13. Nothing interactive below 12px.

### 4.3 Layout grammar ("atlas plates")

- Hairline rules structure the page (FT print grammar): double rule under the masthead,
  single rules between sections, column rules in multi-column bands where content allows.
- Max measure for prose ~68ch; data artifacts (tables, maps, charts) may go full-bleed to
  a 1200px content max.
- Cards mostly dissolve: sections are ruled bands on paper, not bordered boxes. Where a
  boxed artifact is needed (map, downloadable dataset), it gets a hairline border and a
  caption row, like a print plate.
- Tables are print tables: hairline horizontal rules only, right-aligned tabular figures,
  small-caps column heads, generous row height, `--paper-shade` for hover/zebra.
- **Provenance chrome is a first-class primitive**: every chart/table/stat band carries a
  credit line — "Source: <source> · Updated <date>" — plus methodology links where they
  exist. The est./synthetic data-quality flags survive restyled (ochre asterisk-dagger
  treatment, footnote-style), never removed.
- Motion: near none. No ticker loop, no typing animation, no pulse rings. Transitions
  120-200ms opacity/transform only.

### 4.4 Shell & navigation

- The sidebar + header + ticker shell is REPLACED by a **masthead layout**: wordmark line
  (tilt mark in orange + "GridTilt" set in Newsreader; tagline "Energy infrastructure, in
  plain sight." as the dek), a nav rule with the 8 sections as text links (active = orange
  underline bar + `--brand-ink` label), date line. Sticky-condensing on scroll (one thin
  row). Mobile: masthead collapses to wordmark + menu button opening a full-screen section
  index. G-chord shortcuts preserved.
- The news ticker dies as chrome; headlines become a "Latest headlines" ruled list module
  on the front page (and only there).
- Footer becomes the colophon: about/mission, methodology + sources index, citation block,
  subscribe, X link, MIT/data licensing note.

### 4.5 Page-by-page

- **"/" — the front page** (merges marketing + Overview's summary role): masthead; lead
  story = today's most newsworthy tracked metric with the featured chart and a written
  dek (computed from existing APIs; the "what changed" logic already powers the social
  formatters); key-numbers band (tracked AI DC power, GPU fleet price, grid headroom,
  signed nuclear GW) each with provenance; Latest headlines (news feed); Latest analysis
  (blog); section directory replacing FeaturesShowcase screenshots. Subscribe band.
- **/overview** — "Today": the at-a-glance page, redesigned in the new grammar: movers as
  a print table, sector pulse as a compact heat table, buildout-over-time chart with
  direct labels, catalyst list. No duplicate of the front page's lead-story framing.
- **/stack** — supply-chain layers as ruled sections with print tables; flow view (the D3
  force graph Jack loves) KEPT, restyled to paper (warm-gray links, ink nodes, orange
  focus; sans labels, no mono).
- **/power-map** (tabs Map/Deals/Queue): Leaflet map restyled with a light basemap
  (CartoDB Positron) and warm markers; deals + queue as print tables with firmness/status
  columns; the map becomes a captioned plate.
- **/compute-frontier** (+detail/compare/methodology): the atlas centerpiece — cluster
  table as the master list with per-row provenance, detail pages as reference entries,
  methodology page in prose measure.
- **/neocloud-intel** (tabs Prices/Economics/Frontier): price index chart in FT grammar
  (orange = fleet index, context grays = models on hover/select), maker-grouped print
  tables, economics calculators restyled as worksheet blocks.
- **/analyze** (Portfolio/Scenario): worksheet aesthetic — input panels as ruled forms,
  results as pull numbers + one chart; the model-basket/illustrative disclaimer language
  preserved.
- **/catalysts**: calendar as a print agenda list grouped by week, earnings vs policy
  visually distinguished by typography (not badge pills).
- **/blog + /blog/:slug**: becomes "Analysis" — the most literally editorial surface:
  Newsreader headlines, bylines + dates, prose measure, pull quotes; Brief content lives
  here (route already redirects).
- **Entity pages** (/stock/:ticker, /sector/:slug, /region/:slug, /operator/:slug):
  reference-entry template: name + classification line, key figures row, one chart, ruled
  relations lists (clusters/deals/holdings as applicable), provenance footer.
- **/subscribe + not-found**: simple prose pages in the new grammar.
- **Admin pages**: inherit tokens; no redesign investment.

### 4.6 What explicitly survives

- All 27 routes + redirects; G-chords; seo.ts meta (copy updated only where page framing
  changed); the D3 force graph; Leaflet maps; every API contract; est./synthetic flags,
  AsOf freshness, honest empty/error states (restyled via Freshness.tsx successors);
  admin auth surfaces; the social formatters (server-side, untouched).

## 5. Approaches considered

**A. Editorial warm-paper light (CHOSEN).** Maximum distance from the AI-terminal cliché;
converges with every credible research comp while the warm tint + serif display keep it
ownable; natural home for the orange. Risks: night-use comfort (accepted; dark variant is
future work), many-series charts on light ground (mitigated by the ≤4-series + highlight
grammar the survey endorses).

**B. Industrial documentary.** Warm light base + engineering-drawing costume (blueprint
diagrams, stamps). More flavor, higher gimmick risk. Borrowed elements only: hairline
rules, captioned plates, drawing-style diagram labels.

**C. De-terminalized dark.** Strip the mono/uppercase idiom but stay dark. Rejected: still
reads "dark AI dashboard" at a glance; the survey shows dark is the marked case owned by
the exact products GridTilt must not resemble.

## 6. Constraints (hard)

- #F07800 survives as the brand accent (graphic use; `--brand-ink` for orange text).
- Stack unchanged: React 18 + Vite + Tailwind 3 + wouter + react-query; Recharts/D3/Leaflet.
- Server/API untouched except serving existing pages; CLAUDE.md §5 do-not-touch respected.
- All tests green throughout; tokens.ts ↔ index.css sync test updated with the new tokens;
  the 3 pre-existing PowerMap tsc errors get fixed (leaflet.markercluster types).
- shadcn/ui house fork: restyle via tokens + targeted class changes; do not regenerate.

## 7. Sequencing (input to the implementation plan)

1. **M0 Foundation**: fonts (index.html), full token replacement (index.css + tokens.ts +
   sync test + tailwind.config), chart-theme.ts rebuilt for paper (dataviz-validated
   palette), masthead/footer shell replacing sidebar+ticker, core primitives (PageTitle,
   Dek, RuleSection, ProvenanceLine, print table styles, restyled ToolTabs), kill
   mono/uppercase utilities. PowerMap tsc fix.
2. **M1 Front page** "/" (merge marketing; Home components rebuilt).
3. **M2 Today** (/overview).
4. **M3 Markets**: The Stack + flow view restyle.
5. **M4 Power**: map plate + deals/queue tables.
6. **M5 Compute Frontier** + subpages.
7. **M6 GPU Prices** + tabs.
8. **M7 Analyze + Catalysts.**
9. **M8 Analysis** (blog index/post) + subscribe + not-found.
10. **M9 Entity pages** (4 templates).
11. **M10 Sweep**: grep-kill remaining mono/uppercase/dark remnants, seo.ts copy pass,
    README/CLAUDE.md design-section update, full-suite verification, screenshots of every
    page at 1440px + 390px reviewed against this spec.

Out of scope: server/data features, monetization build, dark variant, admin redesign.

## 8. Verification

- `npm run check` (0 errors — including the PowerMap fixes), `npm test`, `npm run build`
  all green at every milestone; final pass re-runs all three.
- Headless screenshots of all 8 tools + front page + one of each entity template at
  1440px and 390px; reviewed against §4 before the PR. Interactive paths exercised (tab
  switches, map, force graph, calculators); anything untested is declared in the PR.
- Ship: commit per milestone, push branch, draft PR. Jack merges; Replit redeploy ships it
  (push ≠ deploy).
