 # GridTilt — Handoff for Claude / Replit / future-you

> **HISTORICAL — superseded (2026-06-09).** Kept for provenance. The "ACTIVE BLOCKER" below was resolved weeks ago: production is current, and the `/`→`/overview` route split, the LBNL interconnection queue (item #13), index-history, and live gauges all shipped. Do not act on the open items here without checking `docs/audit/` first.

Last updated: 2026-05-21
Repo: `aurph/GridTilt` (main)
Owner: Jack Schwartz / aurph

---

## ACTIVE BLOCKER — read this first (2026-05-21)

Three commits are sitting in `origin/main` that production has **not** picked up. The work is correct in git; Replit is just not deploying.

```
b5acf4f  Earnings calendar: stop dropping tickers via overzealous lastReported gate
c1aabbe  Remove dead earningsSeed (client/src/data/catalyst-config.ts)
7dcb5aa  Fix the three glaring issues: editorial, backlog, NVDA earnings
```

**Action:** Open Replit → Deployments tab → Redeploy. Until that happens, the site still shows:
- Editorial block (`WhatsHappening`) on the homepage — already deleted from source
- Backlog page empty ("0 of 0") — `Queue.tsx` adapter is in source but not deployed
- Wrong NVDA earnings (stale May 28 + ghost `"quarter": "Q1 FY2027"` string) — the old `EARNINGS_SEED` is gone from source

### Verify after redeploy

```bash
# 1. Bundle hash should change away from BJ-AlAq9
curl -s https://gridtilt.com/ | grep -oE 'src="/assets/[^"]*\.js"'

# 2. The ghost "Q1 FY2027" should no longer appear (string isn't in current source)
curl -s https://gridtilt.com/api/catalysts/all | grep -o "Q1 FY2027"
# expected: no output

# 3. Earnings calendar populated
curl -s https://gridtilt.com/api/earnings-calendar | python3 -c "import json,sys; d=json.load(sys.stdin); print('count:', len(d))"

# 4. Backlog endpoint can return either shape — Queue.tsx normalizes both
curl -s https://gridtilt.com/api/queue | python3 -c "import json,sys; d=json.load(sys.stdin); print('keys:', list(d.keys()))"
```

### What was actually fixed in source (awaiting deploy)

1. **Editorial removed.** `client/src/components/WhatsHappening.tsx` deleted. Import + mount removed from `client/src/pages/TiltOverview.tsx`. User feedback: leading with opinion is "asking too much of the user."

2. **Backlog defensive adapter.** `client/src/pages/Queue.tsx` now has `normalizeBacklog(raw)` at the top. Accepts both the new shape `{headline, projects, lastRefreshed}` (60 verified projects, local data file) AND the old shape `{source, aggregates, notableProjects}` (15 projects, what production currently serves). This was the actual "ENTIRELY BROKEN" — the page expected new shape, server returned old shape, deploys were out of sync. Adapter lets the page render with either.

3. **Earnings — final approach (b5acf4f).** `server/routes.ts::refreshEarningsCache()`:
   - Pulls both `quoteSummary(ticker, { modules: ["calendarEvents"] })` and `quote(ticker)` per ticker
   - Collects candidate timestamps from `calendarEvents.earnings.earningsDate[]`, `earningsTimestampStart`, `earningsTimestampEnd`, AND `earningsTimestamp`
   - Picks the soonest candidate that is today-or-later
   - No "must be after lastReported" gate — that filter dropped tickers when Yahoo's `earningsTimestamp` was the next upcoming earnings rather than the last reported (Yahoo is inconsistent ticker-by-ticker)
   - Trade-off: for 1–2 days post-report, Yahoo's `calendarEvents` may still hold the just-passed date. Calendar will show that briefly. Better than empty.

### What this session taught
**Replit autoscale/reserved-VM deployments do NOT auto-pull from GitHub on push.** Manual redeploy is required. Don't say "shipped" after a push — say "pushed to main; redeploy on Replit to ship." Several user complaints this session ("isnt fixed at all", "ENTIRELY BROKEN") were because production was a build or more behind main, not because the code was wrong.

### Untracked files
- `CLAUDE.md` at repo root (untracked). Decide whether to commit or `.gitignore`.

---

## What GridTilt is
Dark-mode dashboard tracking the AI infrastructure and power buildout. Covers ~60+ public equities across compute, nuclear, uranium, power hardware, utilities, datacenters, construction, and ETF benchmarks. The thesis the site quietly expresses: AI compute demand is the load story driving an under-built grid. The site visualizes that story without grandstanding about it.

- Brand: orange `#F07800`, amber `#F0A500`
- Aesthetic: warm-charcoal terminal, dark mode only, card radius `0.35rem`
- Voice: short, direct sentences. No em dashes. No "thesis" / "renaissance" branded framings.
- Blue `#1E90FF` is reserved for chart data series only. Never UI chrome.

## Stack
- Frontend: React + TypeScript, Vite, wouter routing, TanStack Query v5, recharts, react-simple-maps where needed, Leaflet (CartoDB Dark Matter) for the Power Map, shadcn/ui, TailwindCSS
- Backend: Node 20 + Express, `yahoo-finance2`, RSS aggregation, NewsData.io fallback
- All API routes prefixed `/api`. Static JSON fallbacks where external APIs may fail.
- One workflow: `Start application` runs `npm run dev` on port 5000 (Express serves both API and Vite).
- Production: deployed to gridtilt.com via Replit Deployments. Republish is required to pick up new env vars.

## Pages and key files

| Route | File | Notes |
|---|---|---|
| `/` | `client/src/pages/TiltOverview.tsx` | Hero, three KPI cards (AI Power Demand, NPI, Grid Stress), Tilt Status bar, Top Movers, Sector Pulse, Catalyst Calendar, X feed (desktop only), demand chart, modules grid (moved to bottom), email capture, footer |
| `/stack` | `client/src/pages/TheStack.tsx` | 8-layer sector breakdown, live stock data, timeframe toggles, stale indicators |
| `/power-map` | `client/src/pages/PowerMap.tsx` | Leaflet map. `DATA_CENTERS_RAW` now lives in `server/data/datacenters.json`. ≥400 MW filter enforced; banner depends on it. |
| `/supply-chain` | `client/src/pages/SupplyChain.tsx` | D3 force-directed graph. 24 nodes, 53 links across 5 stages. Bottleneck status pills under each stage label. Legend strip at the bottom. |
| `/portfolio` | `client/src/pages/PortfolioOverlay.tsx` | AI-power exposure scoring + radar |
| `/trade` | `client/src/pages/TheTrade.tsx` | **Scenario Calculator** (renamed from Thesis Calculator) |
| `/catalysts` | `client/src/pages/CatalystTracker.tsx` | Monthly grid, upcoming earnings, manual catalysts |
| `/subscribe` | `client/src/pages/Subscribe.tsx` | Newsletter signup. Subscribers in `server/data/subscribers.json`. Resend for sends. |
| `/blog`, `/stock/:t`, `/sector/:s`, `/region/:r`, `/operator/:o` | various | Detail pages |

## Backend touchpoints (`server/routes.ts`)

### Shared data
- `getCachedStockData(timeframe)` — Yahoo fetcher with 10-min cache. On throttle, falls back to `STATIC_MARKET_DATA` but **emits `change: null, changePercent: null, stale: true`** — do not regress to `0` fallback (audited via the throttle regression test in `server/__tests__/supply-chain-throttle.test.ts`).
- `computeKpis()` — shared by `/api/kpis` and the daily-tweet cron so dashboard and social can never drift.
- `SUPPLY_CHAIN_STAGES` ticker-and-bottleneck config is in `server/data/supply-chain-stages.json` (extracted out of code).

### Public read endpoints
- `/api/kpis` — three composite indices (AI Power Demand, NPI, Grid Stress) plus constituents
- `/api/stack`, `/api/top-movers`, `/api/sector-pulse` — share `getCachedStockData`
- `/api/supply-chain` — also reads from the shared cache; returns stages with `bottleneckStatus` so the client can render status pills
- `/api/catalysts/all`, `/api/catalysts/earnings`, `/api/catalysts/manual`
- `/api/news`, `/api/news/rss.xml`, `/feed.xml`, `/catalysts/rss.xml`
- `/api/og` — satori-based PNG generator for social cards
- `/api/social/generate` — preview a tweet template without posting. Body: `{ template?: string }`. Defaults to today's day-of-week template.

### Admin endpoints (header `x-admin-key: $ADMIN_API_KEY`)
- `POST /api/admin/post-now` — `{ text }` → posts to X immediately, logs to `social-log.json`. Used for feature launches and ad-hoc posts.
- `POST /api/admin/cron/daily-tweet` — picks today's rotating template, composes from live data, posts to X. Weekends return `{ skipped: true }`. This is what cron-job.org hits.
- `GET  /api/admin/social-log[?limit=N]` — read-only audit log
- `GET  /api/export/daily` — daily JSON snapshot (date, tilt_status, indices, top_movers). Admin-gated post-fdca953.
- `POST /api/newsletter/send` — manual newsletter trigger via Resend
- `GET  /api/admin/subscribers`, `DELETE /api/admin/subscribers/:email`, `POST /api/admin/datacenters`

### X (Twitter) auto-poster
- OAuth 1.0a hand-rolled in Node `crypto` (no third-party SDK). See `xPostTweet()` and `buildOAuth1Header()` in `server/routes.ts`.
- Required env vars: `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.
- Missing any of the four → dry-run mode: skips X, logs the would-be tweet, returns `{ ok: true, dryRun: true }`.
- App must be **Read and Write** on developer.x.com. Tokens generated under Read-only stay Read-only forever; regenerate after permission flip.
- After regenerating tokens, **Republish on Replit** to refresh the live process's in-memory env vars.

### Rotating template schedule (Mon–Fri)

| Day | Template | Says |
|---|---|---|
| Mon | `tilt_status` | Three indices + lowercase status + one-line observation about most stretched dimension |
| Tue | `top_movers` | Top 4 movers by absolute % change + sector-dominance observation |
| Wed | `npi_update` | NPI value + 4 constituent perfs + leader/laggard call-out |
| Thu | `top_movers` | Same as Tue |
| Fri | `catalyst_preview` | Next 7 days of catalysts + headline of the week if a tier-1 ticker reports |
| Sat/Sun | (skipped) | endpoint returns `{ skipped: true }` |

All four templates end with `⚡ gridtilt.com[/page]`. Single brand mark. Lowercase voice throughout.

## Scheduled jobs
- **cron-job.org → POST `/api/admin/cron/daily-tweet`** weekdays 8:30 AM America/New_York (DST-aware). Auth via `x-admin-key: $ADMIN_API_KEY` header.

## Data model
Most data is static JSON or live API. There is no Postgres in use; the drizzle/users scaffolding was deleted in the earlier cleanup pass.

- `server/data/supply-chain-stages.json` — 5 systems with ticker lists + bottleneck copy
- `server/data/datacenters.json` — 58 facility records (filtered ≥400 MW for display)
- `server/data/subscribers.json` — newsletter subscribers
- `server/data/catalysts.json` — manual thesis-relevant catalysts
- `server/data/social-log.json` — every posted (or dry-run) tweet
- `client/src/data/supply-chain-config.ts` — graph layout config (nodes + links + icon names)

## Conventions (non-negotiable)
- **No em dashes** anywhere in code or copy.
- **Dark mode only.** No light variants needed in Tailwind classes.
- **Card radius 0.35rem.** Terminal feel.
- **Orange/amber for UI chrome and KPIs. Blue for chart data only.**
- **Lowercase voice** in tweets and inline narration. Status words are `elevated`, `tracking baseline`, `easing` (not uppercase).
- **No "thesis" or "renaissance" framing** in user-facing copy. Refer to the indices by name (NPI, AI Power Demand, Grid Stress) and the calculator as "Scenario Calculator."
- Add `data-testid` to interactive elements and meaningful display elements.
- **Do not edit `package.json` directly** — use the Replit packager tool.
- **Do not modify `vite.config.ts` or `server/vite.ts`.**
- **Yahoo throttle path returns null, not 0.** Do not regress.

## Secrets / env (Replit Secrets, in both dev and Deployment)
- `ADMIN_API_KEY` — admin endpoints + cron
- `UNSUB_TOKEN_SECRET` — HMAC for newsletter unsubscribe links
- `SESSION_SECRET` — legacy, no longer read by code but still set
- `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` — OAuth 1.0a posting to @gridtilt
- `X_CLIENT_ID`, `X_CLIENT_SECRET` — OAuth 2.0, stored for future, currently unused
- `RESEND_API_KEY` — newsletter send
- `NEWSDATA_API_KEY` — optional, RSS fallback covers it

Reminder: after changing any secret, **Republish on Replit**. The live process holds env vars in memory from startup; changing a Secret without a restart leaves stale values.

## Recent work (2026-05-19 session, multiple sub-sessions)

Today's commits, oldest first:

1. **`c757734`** Supply Chain: fix react-icons build break (Bitcoin icon was importing a deleted dep), real icons (Copper Circle → Pickaxe, Miners Bitcoin → Server, Steel Wrench → Hammer, REITs Landmark → Warehouse, Substations Zap → Workflow). Renamed "Crypto Miners" to "AI Hosting." Extracted `SUPPLY_CHAIN_STAGES` to JSON. Unified `/api/supply-chain` with `getCachedStockData` (deleted ~70 lines of duplicated fetch).
2. **`284829a`** PowerMap: +10 new ≥400 MW projects, prominent threshold banner. Supply Chain null fallback for stale data. Two cache-shape bug fixes.
3. **`492357c`** Address review: enforce ≥400 MW filter on map, drop nulls from `avgChange`, remove stale `facility_count`/`total_capacity_gw` from `/api/export/daily`.
4. **`0400717`** Added the first version of this handoff document.
5. **`653624b`** + **`83b323d`** + **`7398732`** Surfaced live stale-data indicator (clock icon + tooltip) on TheStack and SupplyChain when Yahoo throttles a ticker. Post-merge setup.
6. **`392704b`** Supply Chain: 3 new nodes (HBM Memory, Optics & Networking, Workforce), bottleneck status pills under each stage label (green/amber/red, hover for detail), legend strip at the bottom.
7. **`f4f5966`** Auto-track hyperscale announcements: moved `DATA_CENTERS_RAW` out of `PowerMap.tsx` into `server/data/datacenters.json` with a JSON-backed API.
8. **`4e80e1a`** Added regression test for Yahoo throttle fallback in `/api/supply-chain` (locks in the null-not-0 contract).
9. **`b62f0ab`** Daily X posting pipeline. Hand-rolled OAuth 1.0a, four rotating templates, `/api/admin/post-now`, `/api/admin/cron/daily-tweet`, `/api/admin/social-log`, refactored `/api/social/generate`. `/api/export/daily` gated by `requireAdmin`. Renamed "Thesis Calculator" → "Scenario Calculator" and "Thesis Health" → "Tilt Status" everywhere.
10. **`4a42171`** Renamed "Nuclear Renaissance Index" → "Nuclear Power Index" (NPI) across server, client, API field names (`nriValue` → `npiValue`, `nuclear_renaissance` → `nuclear_power`, etc.), and SEO FAQ. Status words moved from `ACCELERATING/EXPANDING/COOLING` to lowercase `elevated/tracking baseline/easing`. Tweet templates rewritten with one-line narrative observations and `⚡` footer mark.

**Major user-visible outcomes today:**
- First real auto-post to @gridtilt landed (tweet id `2056832457022882259`).
- Daily X cron is live on cron-job.org, fires weekdays 8:30 AM ET.
- Supply Chain page got HBM/Optics/Workforce nodes, bottleneck pills, legend, real icons throughout (no more circle-for-copper).
- Stale-data path is honest: shows a clock icon + tooltip instead of fake 0% rows.
- Brand tone is calmer: no more "Thesis," no more "Renaissance," lowercase status words.

## Open follow-ups (priority order, next session)

### High priority

**#13 LBNL Interconnection Queue module** — *the differentiator*

The Lawrence Berkeley National Lab publishes the public interconnection queue for ~98% of US generating capacity (all 7 ISO/RTOs + 50+ non-ISO balancing areas). Currently no public dashboard surfaces this. It is the binding constraint on AI datacenter buildout, directly tied to GridTilt's whole reason for existing.

Build plan:
1. Ingestion script that pulls the latest LBNL `Queued Up` dataset (`emp.lbl.gov/queues`), normalizes the per-ISO schemas, stores as `server/data/interconnection-queue.json`. Schedule annual refresh.
2. New `/queue` page:
   - Map of pending requests by state/region, color by project type
   - Sortable table: capacity (MW), type, ISO, status, queue date, withdrawal rate
   - Headline number: total pending GW, withdrawal rate, average wait time
   - "Datacenter-relevant" filter: ≥100 MW in hyperscaler-heavy regions
3. Module card on the homepage
4. New tweet template (`queue_update`) for periodic posts when queue stats shift materially

This is the new-data play. SemiAnalysis doesn't have it. DC Byte doesn't have it. Data Center Frontier writes editorial pieces but no interactive tool. Estimated 1–2 sessions of work.

### Medium priority

**#20 leftovers — Supply Chain UX polish**
- d3.drag for node repositioning with touch support
- Label collision deconfliction (overlapping labels at default zoom)
- Mobile-specific responsive layout for the DetailPanel (currently sidebar, should stack below on small screens)

**Replit Agent's open items** (lower priority)
- `#17` Run the throttle regression test automatically in CI
- `#22` Extend the stale-data indicator pattern wherever %-change rows render

### Low priority (or skip)

**#21 Sankey toggle on Supply Chain** — proposed earlier, but a Sankey shines when you have flow magnitudes ($ or units between stages). We don't have those. The current force-directed graph already exposes the topology. Skip unless we later introduce real flow data. Would need `d3-sankey` package install via Replit packager.

## How to verify changes locally
- `curl -s http://localhost:5000/api/supply-chain | jq '.stages[] | {name, avgChange, bottleneckStatus}'`
- `curl -s "http://localhost:5000/api/export/daily" -H "x-admin-key: $ADMIN_API_KEY" | jq` — should be `{ date, tilt_status, indices: { ai_demand, nuclear_power, grid_stress }, top_movers }`
- `curl -s -X POST http://localhost:5000/api/social/generate -H "Content-Type: application/json" -d '{}' | jq -r .text` — picks today's template
- Screenshot `/power-map` → orange "≥ 400 MW ONLY" banner visible, facility count matches the filtered dataset
- Screenshot `/supply-chain` → bottleneck pills visible under each of the 5 stage labels, legend strip below the graph, all node icons render (no more circle for copper)

## Git workflow on this Repl
GitHub integration is installed. Token comes from `listConnections('github')[0].settings.access_token` inside `code_execution`.

Critical: **never let the token appear in stdout/stderr** — the sandbox redacts the entire output and the operation fails. Redirect git commands to a temp log file (`> /tmp/x.log 2>&1`) and only read those logs after stripping the token if you need to surface errors.

Push pattern:
```js
const sh = (c) => execSync(c, { stdio: ['pipe','pipe','pipe'] }).toString();
const remote = `https://x-access-token:${token}@github.com/aurph/GridTilt.git`;
sh('git add -A');
sh(`git -c user.email=agent@replit.com -c user.name="Replit Agent" commit -m "..." > /tmp/c.log 2>&1`);
sh(`git push ${remote} main > /tmp/p.log 2>&1`);
```

## Known quirks
- Yahoo Finance frequently throttles. Expect intermittent `stale: true` rows. Do not "fix" by reintroducing zero fallbacks.
- The `stackCache` is keyed by timeframe string ("1D", "1W", etc.). Newsletter preview must use a valid timeframe key, not a route name like "supply-chain."
- X rejects duplicate tweet content. Manual test posts should vary the text each call.
- React Flow is *not* used. Supply Chain is D3 force-directed (force-x to stage column, then force-y + collision).
- PowerMap tile layer is CartoDB Dark Matter via Leaflet, not react-simple-maps.
- Replit's live process holds env vars in memory from boot. After changing any Secret, **Republish** (or Stop + Start) to refresh.

## Open follow-ups (queued as tasks)
- #11 Surface live stale-data indicator (badge/icon for `stale: true` rows on Supply Chain + Stack)
- #12 Auto-track new hyperscale announcements (move `DATA_CENTERS_RAW` to `server/data/datacenters.json` + ingestion)
- #13 Regression test for throttle path (mock Yahoo down, assert `changePercent: null`, assert UI renders "--")

## How to verify changes locally
- `curl -s http://localhost:5000/api/supply-chain | jq '.stages[] | {name, avgChange, companyCount}'` — sanity check live data
- `curl -s http://localhost:5000/api/export/daily | jq 'keys'` — should be `[date, thesis_status, indices, top_movers]`
- Screenshot `/power-map` and confirm: orange "≥ 400 MW ONLY" banner visible, facility count matches the filtered dataset
- Use `runTest()` from the testing skill for end-to-end checks after UI changes

---

## Addendum: Daily X auto-post pipeline (added 2026-05-19)

### What it does
At a scheduled time on weekdays, an external cron service hits a Replit-hosted endpoint, which composes a tweet from live market data and posts it as @gridtilt via the X API. Failures are logged to a JSON file for audit.

### Endpoints (all on gridtilt.com, all admin-gated by `x-admin-key: $ADMIN_API_KEY`)
- `POST /api/admin/post-now` — body `{ text: string }`. Posts arbitrary text. Used for diagnostics.
- `POST /api/admin/cron/daily-tweet` — no body. Picks a weekday template (mon/tue/wed/thu/fri), builds the text from live data, posts it, writes a row to the social log. Weekends return `{ skipped: true }` early.
- `GET /api/admin/social-log?limit=N` — returns last N entries from `server/data/social-log.json`.
- `POST /api/social/generate` — public, returns generated text only, does not post. Used by the UI preview.

Code lives in `server/routes.ts` (search `post-now`, `daily-tweet`, `social-log`). The X client is OAuth 1.0a, hand-rolled with `crypto` + a thin signer (no SDK).

### X auth setup
Six secrets configured in Replit Secrets:
- `X_API_KEY`, `X_API_SECRET` — OAuth 1.0a consumer (app-level)
- `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` — OAuth 1.0a user tokens for @gridtilt
- `X_CLIENT_ID`, `X_CLIENT_SECRET` — OAuth 2.0 credentials. Stored for future migration but NOT used by current code.

The app permission on developer.x.com is **Read and write**. After flipping that switch you MUST regenerate the OAuth 1.0a Access Token + Secret (a separate button on Keys and tokens) — the old ones stay scoped to whatever they were issued under.

### Cron trigger (external)
We use **cron-job.org** (free) instead of a Replit Scheduled Deployment because Replit's per-repl Publishing pane only manages one deployment slot and the account-wide Deployments dashboard was inaccessible.

Cron config:
- URL: `https://gridtilt.com/api/admin/cron/daily-tweet`
- Method: POST
- Header: `x-admin-key: <ADMIN_API_KEY value>`
- Schedule: every weekday 8:30 AM America/New_York (DST-aware)

### Common failure: 401 from X after credential changes
The deployed snapshot at gridtilt.com caches env vars at deploy time. If you regenerate X tokens (or any secret), the dev workspace picks up the new value on next workflow restart, but production keeps the old value until you click **Republish** in the Publishing pane. Symptom: `/api/admin/post-now` returns `ok:true` locally but `401 Unauthorized` on prod. Fix: republish.

### Verification commands
```bash
# Local (dev workspace, port 5000)
curl -s -X POST http://localhost:5000/api/admin/post-now \
  -H "x-admin-key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"text":"local diag"}' | jq

# Production
curl -s -X POST https://gridtilt.com/api/admin/post-now \
  -H "x-admin-key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"text":"prod diag"}' | jq

# Inspect recent log entries
curl -s "https://gridtilt.com/api/admin/social-log?limit=5" \
  -H "x-admin-key: $ADMIN_API_KEY" | jq

# Force a cron run without waiting for the schedule
curl -s -X POST https://gridtilt.com/api/admin/cron/daily-tweet \
  -H "x-admin-key: $ADMIN_API_KEY" | jq
```

### Admin UI
- `/admin/social` — browser console for the pipeline. Same admin-key pattern as `/admin/datacenters` (key stored in localStorage under `gridtilt_admin_key`).
  - Load a template, edit, post to @gridtilt
  - Delete tweets by id
  - Auto-refreshing log of the last 50 entries with open / stage-delete buttons per row
- `DELETE /api/admin/tweet/:id` — backing endpoint. Validates numeric id, calls X `DELETE /2/tweets/:id` with OAuth 1.0a, logs the attempt.

### Open follow-ups (not done)
- Confirm first real weekday cron fire posts cleanly (the prod redeploy unblocks this).

### Completed 2026-05-19
- Three diagnostic tweets deleted (ids `2056832457022882259`, `2056837049072669038`, `2056839400344936574`).
- `/admin/social` console shipped.
