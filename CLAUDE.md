# GridTilt - Claude Code Context

Working reference for agents, derived from the code on main (2026-07-02). When this
file and the code disagree, the code wins; fix this file in the same commit.

## 1. Project

Research dashboard tracking the financial and physical buildout of AI infrastructure:
compute, data centers, generation, transmission, and the public companies positioned
around them. Tagline: "Equities, infrastructure, and power data for the AI power
economy." Live at gridtilt.com. Built and directed by Jack Schwartz (aurph). Audience:
the citizen-investor researching the AI power economy, not fund analysts or day traders.

14 sidebar modules, 27 routes (wouter, client/src/App.tsx):

| Module | Route | Key |
|---|---|---|
| Tilt Overview | /overview | G+1 |
| The Stack | /stack | G+2 |
| Power Map | /power-map | G+3 |
| Supply Chain | /supply-chain | G+4 |
| Portfolio Overlay | /portfolio | G+5 |
| Scenario Calculator | /trade | G+6 |
| Catalyst Tracker | /catalysts | G+7 |
| Analysis (blog) | /blog | G+8 |
| Backlog | /queue | G+9 |
| Compute Frontier | /compute-frontier (+ /:id, /compare, /methodology) | G+0 |
| GPU Prices (Prices, Economics, Frontier tabs) | /neocloud-intel | G+N |
| AI Power Deals | /power-deals | G+D |
| The Buildout Brief | /brief | G+B |
| GPU Economics | /gpu-economics | G+E |

Off-nav: "/" (marketing landing, bare layout, lazy Home.tsx), /subscribe, /admin/datacenters,
/admin/social, /stock/:ticker, /sector/:slug, /region/:slug, /operator/:slug, /blog/:slug.
Every route except "/" gets the dashboard shell (AppSidebar + header + NewsTicker).
The G-chord list is maintained twice in App.tsx (display ~67-83, handler ~250-254); keep in sync.

## 2. Stack

- React 18.3.1, TypeScript 5.6.3 (exact pin), Vite ^7.3.0, wouter ^3.3.5. NOT Next.js.
- Express ^5.0.1, one process: Vite middleware in dev, static from dist/public in prod. Port 5000.
- @tanstack/react-query ^5.60.5 is the only client data layer. No redux/zustand/app context.
- Tailwind ^3.4.17 via PostCSS + shadcn/ui (new-york). The 12 files in client/src/components/ui
  are a house-modified fork (Replit elevate classes, custom tokens); do not regenerate from upstream.
- Charts: recharts ^2.15.2 (9 pages), react-leaflet ^4.2.1 (Power Map, Compute Frontier),
  d3 ^7.9.0 (Supply Chain force graph only).
- Server libs: yahoo-finance2 ^3.13.1, rss-parser, satori + @resvg/resvg-js (OG cards), zod,
  helmet, express-rate-limit.
- Tests: Node's built-in runner. `npm test` = server/__tests__ + client/src/lib/__tests__ (300 tests). No component/DOM tests.
- Scripts: `dev` (tsx), `build` (script/build.ts: vite client + esbuild server to dist/index.cjs),
  `start`, `check` (tsc), `test`, `backtest:indices`.
- Persistence: JSON in server/data/ plus content/blog/articles.json. There is NO database,
  NO Drizzle, NO shared/ dir, NO server/storage.ts (README still claims these; it is wrong).

## 3. Conventions

Derived from the code; starred rules confirmed by Jack 2026-07-02.

- Aliases: `@/` = client/src (vite + tsconfig); `@assets` = attached_assets (vite only).
- *New files: kebab-case (power-deals.tsx style). Existing PascalCase files stay; no renames.
- *Reads: `useQuery({ queryKey: ["/api/x"] })`; the default queryFn (client/src/lib/queryClient.ts)
  turns the key into the URL. Inline queryFn only to build query strings. Writes: the `apiRequest()`
  helper, not raw fetch. Query defaults: staleTime Infinity, no refetch, no retry.
- Types: each page re-declares the API payload shapes it consumes (local interfaces at top of
  file). Nothing is shared with server/. Changing a response shape means updating consumers by
  hand; grep first.
- Pages keep small private subcomponents at the bottom of the same file; no per-page component
  folders. data-testid on interactive elements.
- Styling: dark mode only, forced (html class="dark", :root vars in index.css, no .dark block).
  Warm charcoal + orange terminal theme. *Brand orange is the literal hex #F07800; keep using
  the raw hex (211 existing uses; no Tailwind token). Amber #F0A500 is the secondary accent.
  Fonts: Inter body, JetBrains Mono for data/branding (often inline style), Source Serif 4 on
  marketing only. The landing has its own scoped tokens (.gt-marketing, client/src/styles/anchor.css).
- Server layout: every route lives in server/routes.ts; math and fetching live in small pure
  modules routes call (indices.ts, clusters.ts, deals.ts, gpu-index.ts, gpu-economics.ts,
  gpu-history.ts, brief.ts, physical.ts, social-format.ts, og-card.ts). New module = pure module + thin
  route + test. server/physical.ts is the house template: constant URL, in-memory TTL cache,
  typed honest degradation ({configured:false} when keyless, 502 on failure), never fabricate.
- Frontier model data is public at `/api/frontier-models`. Benchmark records require a cited
  source, native unit, evaluation setting, and exact comparability key. Never connect or rank
  results that only share a benchmark name.
- Env: process.env direct. Required: UNSUB_TOKEN_SECRET (boot throws), ADMIN_API_KEY (admin 503s
  without). Optional: RESEND_API_KEY, EIA_API_KEY, NEWSDATA_API_KEY, X_API_KEY, X_API_SECRET,
  X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, X_POSTING_ENABLED, DISABLE_DATACENTER_INGESTER
  (last two missing from .env.example).
- Admin auth: x-admin-key header, timingSafeEqual; covers /api/admin/*, /api/newsletter/send,
  /api/export/daily.
- Commits: imperative subject prefixed by area ("Social: ...", "docs: ..."). NO Co-Authored-By
  lines, ever. Product copy and commits: plain voice, no em dashes, no marketing language.

## 4. Data sources

| Source | Key | Provides | Cache | Stale/keyless behavior |
|---|---|---|---|---|
| Yahoo Finance (yahoo-finance2) | none | quotes + sparklines (~100 tickers), earnings dates | 10 min stack, 4 h earnings | per-ticker fallback to STATIC_MARKET_DATA with stale:true, null change (UI shows "--"); indices fall back to static deltas labeled source:"static"; recorders refuse static values |
| FRED CSV | none | monthly US electric output | 24 h | 502, never faked |
| EIA v2 | EIA_API_KEY | US48 hourly demand (168 h) | 30 min | 503 + {configured:false, howTo} |
| NewsData.io | NEWSDATA_API_KEY | news ticker tier 1 | 1 h | falls back to the 8 built-in RSS feeds |
| RSS (8 news + 4 ingester feeds) | none | news fallback; datacenter discovery | ingester 6 h | items just absent |
| LBNL Queued Up page | none | new-edition flag only | 24 h throttle | manual XLSX ingest regardless |
| Resend | RESEND_API_KEY | audience sync, newsletter send | on demand | subscribe still saves locally; send 400s |
| X API (OAuth 1.0a) | 4 creds + X_POSTING_ENABLED=true | weekday 8:30 ET post | external cron | dry-run, logged to social-log.json |

Schedulers (no node-cron anywhere):
- In-process: datacenter ingester setInterval every 6 h (off in tests; DISABLE_DATACENTER_INGESTER=1).
- External cron-job.org: POST /api/admin/cron/daily-tweet weekdays 8:30 ET. Rotation: Mon
  buildout, Tue gpu_rental, Wed cluster_spotlight, Thu grid_backlog, Fri power_mix. Kill switch
  X_POSTING_ENABLED defaults OFF.
- External n8n (Jetson homelab): weekly GPU reprice (rewrites gpu-rental-prices.json through a
  validation gate, commits to main) + daily GET /api/gpu-prices/metrics ping.
- Request-piggybacked daily recorders: /api/kpis appends index-history.json (live data, weekdays,
  after 10 AM ET only); /api/gpu-prices/metrics appends gpu-price-history.json.

server/data custody (the fragility map):
- Hand-curated, code never writes: catalysts.json, clusters.json, supply-chain-stages.json,
  frontier-models.json,
  hyperscaler-capex.json, content/blog/articles.json (admin blog CRUD can also write it; see debt).
- Machine-written, never hand-edit: datacenters.json, datacenters-pending.json, index-history.json,
  gpu-price-history.json, market-constants.json, social-log.json, subscribers.json,
  backlog-auto-updates.json.
- Shared custody, be careful: interconnection-queue.json (curated projects; news scanner and
  admin routes write into it). gpu-rental-prices.json is rewritten weekly by n8n; schema changes
  break the unattended refresh.

## 4b. Social / OG cards

server/og-card.ts owns the layout, fonts and map for every card (/api/og and the
daily X post). routes.ts only gathers data; ogCardForTemplate returns an OgCard.

- Every card MUST carry `asOf` and `source`. They are required fields, not
  optional decoration: the product claim is "tracked with sourced numbers", so a
  card showing a number without a date and a provenance line contradicts it.
  Missing asOf prints "AS OF —"; never substitute today's date.
- Fonts: Inter-Regular.ttf (400), Inter-Bold.woff (700), JetBrainsMono-Bold.woff
  (700), all in server/fonts/, all registered in og-card.ts. satori CANNOT
  synthesize weights. Asking for a weight or family that is not registered
  renders regular silently, which is how the pre-2026-08 card shipped flat for
  months. server/__tests__/og-card.test.ts fails if a face goes missing.
- satori silently TRUNCATES large inline SVG markup. The US outline must stay a
  single concatenated path; per-state <path> elements exceeded the limit and
  rendered a country missing most of its states with no error. Guarded by
  assertMapPathIntact().
- server/us-map.ts is GENERATED by scripts/generate-map-path.mjs. It carries the
  outline path plus closed-form Albers constants, so the server projects
  coordinates with plain arithmetic and never imports d3-geo, which is ESM-only
  and would throw ERR_REQUIRE_ESM from the CJS bundle on older Node. d3-geo is a
  devDependency used only by that script and the parity test.
- `npx tsx scripts/preview-cards.ts` renders every template to .card-preview/
  for eyeballing. It posts nothing.
- client/src/data/us-states.geo.json is the source geometry. The copy that
  shipped on the elevate branch had Virginia's outer ring wound backwards, which
  d3 reads as "the whole sphere minus Virginia". geoAlbersUsa's clipping hid it;
  any non-composite projection does not. The committed copy is rewound, and the
  generator rewinds + warns if a bad ring ever reappears. Client-side map work
  should use this file, not the elevate copy.

## 5. Do not touch

- server/indices.ts constants (baselines, gains, clamps, NPI_BASE anchors, weights): published
  methodology. Tests, scripts/backtest-indices.ts, and the committed index-history.json seed
  assume exact values; changing them splices two methodologies into one public series.
- index-history.ts recording guards and npiEquityLegsFrom: mirror the backtest exactly.
- deriveSmrPolicyScore (routes.ts ~397): hand-anchored to preserve NPI continuity.
- Security middleware block (server/index.ts ~15-112): trust proxy, helmet CSP with per-directive
  rationale, limiters, 100 kb body cap. Security-reviewed; do not casually edit.
- Unsub token + admin auth crypto (routes.ts ~2143-2171): unsub links in already-sent emails
  depend on the exact HMAC derivation.
- seo.ts: hand-written per-page meta, regex head surgery, sitemap slug exports. Fragile by design.
- social-format.ts: public tweet copy locked character-for-character by tests; change copy and
  test in the same commit, on purpose.
- News scanner regexes + sanity ranges (routes.ts ~659-741, ~866-871): they auto-write curated
  data files; widening a range turns headline noise into data corruption.
- Deal firmness field: zero "signed" entries today is deliberate (signedSecuredMW stays 0 until
  curated). Do not invent classifications.
- attached_assets/previews/*.svg: live code assets imported via @assets. The rest of
  attached_assets is design-source archive.

## 6. Known debt

Documented, not to fix casually or silently:

- Fake-data debt CLOSED on feat/live-gpu-prices (2026-07-04): the CCJ/CEG scatter now computes
  from real SRUUF/CCJ/CEG weekly closes (server/uranium-correlation.ts, tested); fetch failure
  serves empty + null r, never invented dots. PR #2's removal approach is obsolete.
- Security closes from PR #1 (da97234) APPLIED on feat/live-gpu-prices (2026-07-04): SEC-1..5 +
  auth-boundary tests. PR #1 itself is obsolete once that branch merges. Note: cron-job.org needs
  a second job POSTing /api/admin/scan-news-now (x-admin-key) to restore automated news scans.
- PR #2 (feat/real-metrics) proposes retiring the sentiment indices for a sourced scoreboard;
  main kept the indices (served at /api/kpis, out of the social rotation). Owner decision pending.
- No CI (no .github/ at all). Tests and tsc run only when someone remembers.
- Durability (audit M2): subscribers.json and all machine-written JSON live on autoscale
  ephemeral disk; admin blog CRUD writes git-tracked content/ at runtime. A redeploy can lose
  subscribers and posts. Jetson Postgres is the planned fix.
- `npm run dev` on macOS: server/index.ts:188 sets reusePort unconditionally, which fails on
  darwin; the off-darwin conditional is stranded in unmerged PR #1.
- routes.ts is a 3,913-line monolith (70 routes + OAuth client + OG renderer + 3 scanners +
  static data tables).
- README + replit.md rewritten from code truth (2026-07-04, feat/live-gpu-prices). HANDOFF.md and
  HOMEPAGE_HANDOFF.md remain historical records, not current state.
- Dead weight (mostly cleared 2026-07-04): date-fns, @tailwindcss/vite, @radix-ui/react-toggle,
  dates.ts, ui/dialog.tsx, ui/toggle.tsx removed; package renamed "gridtilt". Still open:
  EmailCapture's unused marketing branch (~200 lines), .replit's postgresql-16 and python-3.11
  modules.

## 7. Deploy (the gotcha that keeps biting)

- Replit autoscale. A push to GitHub does NOT deploy, and autoscale does not auto-pull. Merge,
  then Replit -> Deployments -> Redeploy, manually. Never say "shipped" after a push.
- Build: npm run build (vite client to dist/public, esbuild server to dist/index.cjs); the
  .replit postMerge hook runs npm install.
- After redeploy, sanity-check /api/stack, /api/kpis, and /api/clusters/metrics.
