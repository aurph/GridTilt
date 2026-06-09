# Phase 1 — Audit Findings

> `main` @ `dbbf7ac`, 2026-06-09. Every finding has an ID, a severity, file:line evidence, and a recommendation. IDs are referenced by `02_plan.md`. Severity = blast radius × likelihood for a single-instance public app on ephemeral hosting. Items marked ✓verified were reproduced directly during this audit; others are cited from the code read.

## Severity summary

| ID | Severity | One-line |
|---|---|---|
| DATA-1 | **Critical** | Subscriber list lives only in instance-local JSON; lost on every Replit redeploy unless Resend is configured |
| DOC-1 | **Critical** | README/CLAUDE.md describe a Drizzle/Postgres/`storage.ts`/`shared/` persistence layer that does not exist |
| SEC-1 | **High** | `/api/newsletter/preview` is unauthenticated and leaks the subscriber count ✓verified |
| SEC-2 | **High** | `/api/social/generate` is unauthenticated; burns Yahoo quota and leaks pre-publish copy ✓verified |
| SEC-3 | **High** | `/api/stack?timeframe=` is unvalidated → cache-bypass Yahoo-quota amplification ✓verified |
| SEC-4 | **High** | Public `GET /api/news` writes persisted data files via news scanners |
| SEC-5 | **High** | Stored-XSS vector: datacenter `name` interpolated into Leaflet `divIcon` HTML |
| DATA-2 | **High** | Admin backlog/datacenter edits silently revert on redeploy (advertised as durable) |
| PERF-1 | **High** | Inverted code-splitting: D3+Leaflet+Recharts ship in a 1.2 MB entry chunk to every visitor ✓verified |
| TYPE-1 | **High** | No shared client/server type contract; KPI/catalyst shapes defined 2–3× and already drifted |
| CI-1 | **High** | A finished CI workflow exists but is untracked, so nothing gates pushes to `main` ✓verified |
| TEST-1 | **High** | The admin-auth boundary and HMAC unsubscribe flow have zero test coverage |
| ARCH-1 | **High** | `routes.ts` is a 3,485-line god-file mixing ~60 endpoints, inline datasets, crypto, and the X client |
| SEC-6 | Medium | Unsubscribe tokens have no expiry/revocation — a leaked link works forever |
| SEC-7 | Medium | SECURITY.md claims controls (Twitter CSP, Permissions-Policy) the code does not enforce ✓verified |
| DATA-3 | Medium | All JSON writes are non-atomic, lock-free; corruption is silently swallowed as `[]` |
| DATA-4 | Medium | Deploy artifact is not self-contained; depends on full workspace at `process.cwd()` |
| CORR-1 | Medium | Stack page ships synthetic (randomly generated) CCJ/CEG correlation scatter data |
| CORR-2 | Medium | Earnings calendar uses two inconsistent "today" definitions (UTC vs server-local) |
| EXP-1 | Medium | Express 5: async route throws aren't auto-forwarded; `/api/kpis` has no try/catch |
| A11Y-1 | Medium | D3 graph and Leaflet map are mouse-only; no keyboard path, no screen-reader fallback |
| A11Y-2 | Medium | Keyboard-shortcuts modal is a hand-rolled div with no dialog semantics/focus trap |
| QUERY-1 | Medium | `retry:false` + `staleTime:Infinity` + no refetch traps pages in a permanent error/stale state |
| DOC-3 | Medium | README module/stack counts wrong (8→13 layers, 21/44→24/52 nodes/links); replit.md is a fossil |
| DOC-4 | Medium | HANDOFF/HOMEPAGE_HANDOFF/CLAUDE.md describe shipped work as open roadmap |
| DEAD-1 | Medium | Stale market claims baked into the client bundle (`supply-chain-config.ts`) |
| DESIGN-1 | Medium | 534 hardcoded hex literals; `#F07800` is not a Tailwind token |
| DEP-1 | Low | Tailwind v4 vite plugin sits unused alongside active Tailwind 3; unused deps; misplaced `@types` |
| DEAD-2 | Low | Dead files/branches: `ui/dialog`, `ui/toggle`, `lib/dates`, duplicated datasets, `redesign/home-swiss` |
| PORT-1 | Low | `reusePort: true` in `listen()` throws `ENOTSUP` on macOS — blocks local `npm run dev` ✓verified |
| NAV-1 | Low | 6 dashboard breadcrumbs link to `/`, now ejecting users to the marketing page |

---

## Critical

### DATA-1 — Subscriber list is ephemeral
**`server/routes.ts:1927,1944-1946`.** `subscribers.json` is the documented single source of truth for the mailing list, written with `writeFileSync` to instance-local disk. On Replit autoscale the deployed image has no such file, so a redeploy/scale event resets the list to empty; multiple instances each keep their own copy. The only durable mirror is Resend, and only when `RESEND_API_KEY` is set (`routes.ts:2026`). This is the one dataset that cannot be re-derived or re-committed from local dev. Unsubscribe state is lost the same way (a compliance problem).
**Fix:** introduce a real durable store. Recommended: a small Postgres (Neon free tier) or SQLite-on-a-volume behind a genuine `IStorage` interface — which also makes the phantom DOC-1 abstraction real. Minimum viable: make Resend the source of truth and treat the JSON as a cache; fail loudly if neither is configured in production.

### DOC-1 — Phantom persistence layer
**`README.md:58,91,104-107`; `CLAUDE.md:7,13-14`; `HOMEPAGE_HANDOFF.md:27`.** All three claim Drizzle ORM, optional Postgres via `DATABASE_URL`, `server/storage.ts` with an `IStorage` interface, and a `shared/` directory of Drizzle schemas. ✓verified absent: `shared/` and `server/storage.ts` do not exist; `package.json` has 0 drizzle/pg refs; 0 `DATABASE_URL` references anywhere in code. `HANDOFF.md:139` already admits "the drizzle/users scaffolding was deleted." A future engineer/agent told `DATABASE_URL` makes subscribers durable will lose data by trusting it.
**Fix:** either build the real abstraction (preferred, pairs with DATA-1) or delete every claim. The docs must match the code before anything else, because agents act on them.

---

## High

### SEC-1 — Unauthenticated newsletter preview ✓verified
**`server/routes.ts:2081-2137`.** `GET /api/newsletter/preview` has no `requireAdmin` call. It sits under the `/api/newsletter/` prefix so it gets the *failed-auth* limiter, but it never authenticates, so it is fully public and renders "Sent to N subscribers" — leaking exact list size. Returned **200 with no key** in testing.
**Fix:** add `requireAdmin`, or compute the count only in the admin send path.

### SEC-2 — Unauthenticated social compose ✓verified
**`server/routes.ts:2933-2955`.** `POST /api/social/generate` has no `requireAdmin`. Anonymous callers drive live Yahoo fetches (quota burn) and read composed tweet copy before publish. The admin UI sends `x-admin-key` here but the server never checks it. Returned **200 with no key**.
**Fix:** add `requireAdmin`.

### SEC-3 — Stack cache bypass / Yahoo-quota amplification ✓verified
**`server/routes.ts:1760-1763,496`.** `/api/stack` reads `req.query.timeframe` unvalidated and uses it directly as the `stackCache` key. Any unrecognized string is a permanent cache miss → ~200 Yahoo calls per request, defeating the 10-minute cache the threat model relies on, and growing the cache map unbounded. `?timeframe=ZZZ` returned 200 in ~3.8s (full fetch). `chartOptsForTimeframe` already normalizes unknown values to "1D" for the fetch — but not for the cache key.
**Fix:** validate `timeframe` against an allowlist (`1D|5D|1W|1M`...) and key the cache on the normalized value; reject or coerce others.

### SEC-4 — Public input writes to disk
**`server/routes.ts:2348,2376-2378,2392-2394`.** A public `GET /api/news` runs `scanNewsForBacklogUpdates` and `scanNewsForMarketConstants`, which **write** `interconnection-queue.json` and `market-constants.json` from RSS/NewsData headline matches. An attacker who lands a crafted headline in one of the 8 sources can move displayed queue/uranium figures within the sanity bands, with no auth and only the global limit.
**Fix:** gate the scanners behind the admin/cron path (they already have a manual `/api/admin/scan-news-now`), or move them off the public read path entirely; persist only from an authenticated trigger.

### SEC-5 — Stored XSS via datacenter name
**`client/src/pages/PowerMap.tsx:332` (and the popup builder ~143-170).** `dc.name` is interpolated into `L.divIcon({ html: ... })` without escaping. Datacenter names enter through the admin form and the ingester pipeline, so a malicious/garbled name renders as live HTML in every visitor's map.
**Fix:** escape on render (or sanitize on write in `validateDatacenter`). Prefer escaping at the render boundary so existing data is covered.

### DATA-2 — Admin edits silently revert
**`server/routes.ts:3083-3085,3098,2592`.** The backlog admin routes are explicitly sold as "keep the dataset fresh from anywhere without a redeploy," and datacenter CRUD writes JSON the same way. On autoscale every such edit reverts to the committed seed on the next deploy. Same root cause as DATA-1; called out separately because the feature actively promises durability it doesn't have.
**Fix:** same durable-store solution as DATA-1, or relabel these as "edits persist until next deploy; commit to make permanent."

### PERF-1 — Inverted code-splitting ✓verified
**`client/src/App.tsx:9-34`.** Only `Home` and `TiltOverview` are `React.lazy`; every other page is statically imported at module top, so D3 (SupplyChain), Leaflet (PowerMap), and Recharts (TheStack/TheTrade/StockPage/PortfolioOverlay) all land in the 1.2 MB entry chunk (343 kB gzip) that a `/` marketing visitor downloads before the lazy Home chunk. The code comment claims the opposite ("each visitor only pays for the chunks they need").
**Fix:** `React.lazy` every route component; add `manualChunks` for the heavy viz libs; verify with a rebuild + bundle diff.

### TYPE-1 — No client/server type contract
**`client/src/lib/types.ts` vs `client/src/pages/TiltOverview.tsx:63-78`, `CatalystTracker.tsx:15-45`.** Response types are hand-maintained local interfaces casted onto `useQuery<T>` — no shared module, no runtime validation. The KPI shape is defined twice and has already drifted (`lib/types.ts` includes `source`/`asOf`; TiltOverview omits them); the catalyst shape exists in three places; `/api/queue` is typed `any`.
**Fix:** create a real `shared/` (resurrecting the name the docs already promise) with the response types — ideally derived from zod schemas so the server validates and the client imports one source of truth.

### CI-1 — CI exists but is inert ✓verified
**`.github/workflows/ci.yml` (untracked).** A complete pipeline (check/test/build/`npm audit --omit=dev`) sits in the working tree uncommitted, and on the stale `redesign/home-swiss` branch. Nothing runs on push to `main`.
**Fix:** commit it on `main`. Extend later with the new client/e2e tests.

### TEST-1 — Untested security boundary
**`server/__tests__/`.** The 31 passing tests cover index math, tweet copy, the ingester, FRED parsing, and the throttle path — but not `requireAdmin` (no test that admin routes 401 without a key / 503 without the env / 200 with it) and not the HMAC unsubscribe flow. A "every admin route rejects anonymous" test would have caught SEC-1 and SEC-2.
**Fix:** add an auth-boundary integration test enumerating every admin/mutating route; add unsubscribe token tests (forge, cross-email, expiry once SEC-6 lands).

### ARCH-1 — `routes.ts` god-file
**`server/routes.ts` (3,485 lines).** One file holds ~60 endpoints, the inline `COMPANY_DATABASE` (53-172) and `STATIC_MARKET_DATA` (222-344) datasets, the news→file scanners (630-984), the OG renderer (1056-1216), the full X OAuth 1.0a client (1218-1412), the tweet composers, and all admin CRUD. Helpers like `STAGE_MAP` rebuild per boot inside `registerRoutes`. Duplicated logic: the top-movers sort appears 5×; "load+parse queue JSON" 7×; earnings selection in 3 places; `escapeXml`/`escapeHtml` duplicated across files.
**Fix:** decompose into domain routers (`markets`, `supply-chain`, `catalysts`, `datacenters`, `queue`, `newsletter`, `social`, `seo`, `news`); lift datasets to `server/data/*.ts`; lift the X client, scanners, and OG renderer to their own modules. Cleanest first extractions: X client, news scanners, OG renderer.

---

## Medium

### SEC-6 — Replayable unsubscribe tokens
**`server/routes.ts:1955-1956,2056-2063`.** The token is a static `HMAC-SHA256(email)` with no timestamp/nonce/version. It can't be forged (good) or used across subscribers (good), but a captured link works forever and can't be individually revoked short of rotating the global secret (which invalidates everyone's links).
**Fix:** add a version/issued-at component, or accept the tradeoff explicitly in SECURITY.md. Low urgency; note alongside the auth work.

### SEC-7 — SECURITY.md overstates the posture ✓verified
**`SECURITY.md:34,42,51` vs `server/index.ts:62-74`.** The doc claims prod CSP `script-src/frame-src` include `https://platform.twitter.com` (the code ships `'self'` only — tighter, the Twitter widget was removed) and claims a `Permissions-Policy: camera=() microphone=() geolocation=()` header that is **never set** (helmet 8 doesn't emit it by default; absent in dev probe). A security doc that overstates controls is worse than none.
**Fix:** make the doc match the code (and optionally actually set Permissions-Policy, which is cheap and worth having).

### DATA-3 — Non-atomic, lock-free writes
**`server/routes.ts:1945,2592,3098`; `server/datacenter-ingester.ts:457-459`.** Every persisted file is a read-modify-`writeFileSync` with no temp-file-rename and no locking. A crash mid-write truncates the JSON, which loaders swallow as `[]` (silent data loss). `approvePendingDatacenter` writes two files separately; a crash between duplicates the entry. Concurrent ingester (6h) + admin write can interleave.
**Fix:** centralize JSON IO in one helper that writes to a temp file and renames; once a real store lands (DATA-1) this mostly evaporates.

### DATA-4 — Artifact not self-contained
**`script/build.ts`; `server/routes.ts:1141,2762`; `server/static.ts:7`.** The build copies nothing beyond `index.cjs` + `dist/public`. Production reads `server/data/`, `server/fonts/`, and `content/blog/` from `process.cwd()`. Works on Replit (whole workspace is snapshotted) but breaks the moment anyone deploys "just dist/" (Docker, another host) — data, fonts, blog, and sitemap all fail at once.
**Fix:** add a copy step to `build.ts` (or resolve paths relative to the bundle), so dist is portable. At minimum, document the dependency.

### CORR-1 — Synthetic correlation data on the Stack page
**`server/routes.ts:409-458,1765-1766`.** `generateCCJCorrelationData`/`generateCEGCorrelationData` build the uranium-vs-equity scatter with `Math.random()` (Box-Muller) tuned to a target Pearson r, then `/api/stack` ships it as `correlation`/`correlationCoeff`. For a product whose brand is "check the math," presenting randomly generated points as a correlation chart is the highest-integrity-risk item outside the indices.
**Fix:** either compute the correlation from real historical price series (the backtest already fetches them) or label the scatter unambiguously as an illustrative model — consistent with how the indices are disclosed. Recommend computing it for real.

### CORR-2 — Earnings "today" boundary inconsistency
**`server/routes.ts:2244-2246,2285` vs `2495,2417`.** `refreshEarningsCache` filters with a millisecond `todayMs` from server-local midnight, then emits dates as UTC `toISOString().slice(0,10)`; `getEarningsData`/`loadManualCatalysts` re-filter with a string `todayStr` from UTC. Two different "today" definitions on a UTC container can label an AMC earnings one day off — the recurring class of bug HANDOFF flags ("NVDA at +8 days when it had reported"). The "any positive timestamp is a candidate" heuristic can also resurface a just-reported date as upcoming.
**Fix:** pick one timezone (US/Eastern, the market tz) for all date logic; unit-test the boundary (TEST gap).

### EXP-1 — Express 5 async error forwarding
**`server/index.ts:156-167`; `server/routes.ts:1727`.** Express 5 does not auto-forward rejections from async handlers to the error middleware. Most handlers use try/catch, but `/api/kpis` (and a few others) don't; a throw becomes an unhandled rejection instead of a clean 500. `computeKpis` guards its internals, so risk is low today but latent.
**Fix:** wrap async handlers in an `asyncHandler` helper, or add try/catch to the bare ones. Comes mostly for free during the ARCH-1 router split.

### A11Y-1 / A11Y-2 — Maps/graphs and modal
**`client/src/pages/SupplyChain.tsx`, `PowerMap.tsx`; `client/src/App.tsx:67-113`.** The D3 graph and Leaflet markers are mouse-only (no `tabIndex`/`onKeyDown`/ARIA, no sr-only data table). The shortcuts modal is a hand-rolled fixed div with no `role="dialog"`, `aria-modal`, or focus trap — while a proper Radix `Dialog` sits unused in `ui/dialog.tsx`.
**Fix:** add sr-only fallback tables for chart/map data; swap the modal to Radix Dialog; add keyboard affordances to map/graph selection.

### QUERY-1 — Stale/error traps
**`client/src/lib/queryClient.ts:44-57`.** `retry:false` + `staleTime:Infinity` + `refetchOnWindowFocus:false` + no `refetchInterval` on several pages (PowerMap, BlogIndex) means one transient failure leaves a page permanently errored or stale until a full reload. Several pages also don't destructure `isError` (CatalystTracker, SectorPage), and three custom `queryFn`s skip the `res.ok` check (TheStack:257, SectorPage:70, NewsTicker:14).
**Fix:** allow 1–2 retries, add modest `refetchInterval` to live pages, handle `isError` everywhere, route all fetches through `apiRequest` (which checks `res.ok`).

### DOC-3 / DOC-4 — Documentation drift
**README.md:16,18; replit.md (whole file); HANDOFF.md; HOMEPAGE_HANDOFF.md; CLAUDE.md:27-28.** README says "8 layers / 60+ tickers" (actual 13 layers / 100 tickers, ✓counted) and "21 nodes / 44 links" (actual 24 / 52, ✓counted in `supply-chain-config.ts`). `replit.md` (May 18) still references react-simple-maps, an org-chart supply chain, SESSION_SECRET for unsubscribe, and 4 RSS feeds — all wrong. HANDOFF/HOMEPAGE_HANDOFF/CLAUDE.md present the LBNL queue, the homepage redesign, and the May 21 blocker as open when all shipped weeks ago; CLAUDE.md still calls the redesign "active" and the anchor "Swiss" after Swiss was explicitly torn out.
**Fix:** correct README counts; delete or rewrite replit.md; stamp both handoffs "historical — superseded"; fix CLAUDE.md's redesign section and the G+1–G+9 shortcut count.

### DEAD-1 — Stale claims in the bundle
**`client/src/data/supply-chain-config.ts:35-62`.** Point-in-time figures ("Spot at $93/lb", "$14,200/ton", "Sold out HBM3E 2026", "$200B+ GEV backlog") are hardcoded into the client bundle and go stale silently. They belong server-side next to `/api/supply-chain`, which already carries live bottleneck status.
**Fix:** move the volatile metrics server-side; keep the graph topology in the client config.

### DESIGN-1 — No brand token
**Across `client/src` (534 hex literals).** `#F07800` exists only as an HSL `--primary` and `--mkt-accent`, never as a Tailwind color token, so it's hardcoded 181×; `#F0A500` 147×. Worst offenders: PowerMap (110), TiltOverview (96).
**Fix:** add `brand`/`brand-amber` Tailwind tokens and migrate literals incrementally.

---

## Low

- **DEP-1** — `@tailwindcss/vite` ^4 sits in devDeps unused while Tailwind 3.4 is what's actually wired (`postcss.config.js`); `topojson-client`, `date-fns`, `zod`, `zod-validation-error` are unused (the last three are also no-ops in the esbuild allowlist); `@types/d3|leaflet|topojson-client` are in `dependencies` not `devDependencies`; package is still named `rest-express`. (`package.json`)
- **DEAD-2** — `client/src/components/ui/dialog.tsx`, `ui/toggle.tsx`, and `lib/dates.ts` have zero importers; `electricityData` and `manualCatalysts` are duplicated between client config and the page/server; `.gt-pulse` is referenced but defined in no stylesheet; the `redesign/home-swiss` branch is dead, holding only the CI file. Confirmed clean: no `WhatsHappening` or `react-simple-maps` remnants.
- **CORR-3** — `STATIC_MARKET_DATA` is mutated in place as a write-through cache (`routes.ts:521-524`); benign on single-threaded Node but means the "static" fallback isn't static.
- **PORT-1** ✓verified — `httpServer.listen({ ..., reusePort: true })` (`server/index.ts:188`) throws `ENOTSUP` on macOS, so `npm run dev` fails locally out of the box. `reusePort` buys nothing on single-instance Replit. Recommend gating it behind a non-darwin check or removing it.
- **NAV-1** — Six dashboard breadcrumbs (`SectorPage:98`, `RegionPage:67`, `OperatorPage:72`, `StockPage:103`, `BlogPost:175`, `BlogIndex:25`) link `href="/"`, which now lands on the marketing page instead of the dashboard; should point to `/overview`.
- **LOG-1** — The request logger appends full JSON response bodies for all non-redacted `/api` routes with a hardcoded 3-route redaction list (`server/index.ts:140-143`); brittle as new sensitive routes are added.

## Confirmed healthy (do not "fix")

- The index math chain (README ↔ `server/indices.ts` ↔ `INDEX_VALIDATION.md`) agrees exactly and is well unit-tested. Preserve the disclosure discipline.
- Yahoo throttle handling emits `stale:true` with `null` change rather than zero-fill, and it's covered by `supply-chain-throttle.test.ts`. Don't reintroduce zero fallbacks.
- `requireAdmin` uses `timingSafeEqual` correctly and returns 503 (not 401) when the key env is unset. Admin gate works where it's actually applied.
- `trust proxy = 1` is the correct setting for Replit's single proxy.
- SSRF/path-traversal: no `fs` path or outbound fetch URL is built from user input. Clean.
