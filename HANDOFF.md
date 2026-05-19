# GridTilt — Handoff for Claude

Last updated: 2026-05-19
Repo: `aurph/GridTilt` (main)
Owner: Jack Schwartz / aurph

## What GridTilt is
Dark-mode financial dashboard tracking the AI Infrastructure & Power Economy. Tracks how AI compute demand drives power consumption and moves equity markets.

- Brand: orange `#F07800`, amber `#F0A500`, italic "tilted" wordmark
- Aesthetic: warm-charcoal terminal, dark mode only
- Tone: short, direct sentences. No em dashes. No compound AI-sounding phrasing.
- Blue `#1E90FF` is reserved for chart data series only. Never UI chrome.

## Stack
- Frontend: React + TypeScript, Vite, wouter routing, TanStack Query v5, recharts, react-simple-maps, Leaflet (CartoDB Dark Matter), shadcn/ui, TailwindCSS
- Backend: Node 20 + Express, `yahoo-finance2`, RSS aggregation (Utility Dive, Data Center Dynamics, World Nuclear News, Power Engineering) with NewsData.io fallback
- All API routes prefixed `/api`. Static JSON fallbacks where external APIs may fail.
- One workflow: `Start application` runs `npm run dev` on port 5000 (Express serves both API and Vite).

## Pages and key files

| Route | File | Notes |
|---|---|---|
| `/` | `client/src/pages/TiltOverview.tsx` | KPIs, Thesis Health, Top Movers, Sector Pulse, Catalyst Calendar, X feed, demand chart, email capture |
| `/stack` | `client/src/pages/Stack.tsx` | 8-layer sector breakdown, live stock data, timeframe toggles |
| `/power-map` | `client/src/pages/PowerMap.tsx` | Leaflet map, 58 raw entries filtered to ≥400 MW (currently 33 visible), Grid Stress mode |
| `/supply-chain` | `client/src/pages/SupplyChain.tsx` | Org-chart tree, 5 systems, 20 sub-systems, inline expand for company cards |
| `/portfolio` | `client/src/pages/PortfolioOverlay.tsx` | AI Power Exposure scoring + radar chart |
| `/thesis` | `client/src/pages/TheTrade.tsx` | Thesis Calculator, preset + custom scenarios |
| `/catalysts` | `client/src/pages/CatalystTracker.tsx` | Monthly grid, upcoming earnings timeline, thesis catalyst cards |
| `/subscribe` | `client/src/pages/Subscribe.tsx` | Newsletter signup. Subscribers in `server/data/subscribers.json`. Resend for sends. |
| `/analysis`, `/stock/:t`, `/sector/:s`, `/region/:r`, `/operator/:o`, `/blog` | various | Detail pages |

## Backend touchpoints (`server/routes.ts`)
- `getCachedStockData(timeframe)` — Yahoo fetcher with cache. On throttle, falls back to `STATIC_MARKET_DATA` but **emits `change: null, changePercent: null, stale: true`** (do not regress this — old bug was emitting `0` and looking frozen).
- `/api/supply-chain` — Builds stages from `SUPPLY_CHAIN_STAGES` + cached stock data. `avgChange` filters out null/non-finite `changePercent` before averaging.
- `/api/stack` and `/api/supply-chain` share `stackCache` keyed by timeframe ("1D" etc.). Cache is a flat `{TICKER: stock}` dict, not sectored.
- `/api/export/daily`, `/api/stock/:ticker` — Both must use `Object.values(cached.data)` / direct ticker indexing on the flat cache. Treating it as sectored arrays was a pre-existing bug, now fixed.
- `/api/catalysts/all` — Merges Yahoo earnings dates for 8 curated tickers with manual thesis catalysts.
- Subscribe / unsubscribe — HMAC-SHA256 tokens using `SESSION_SECRET`. `UNSUB_TOKEN_SECRET` and `ADMIN_API_KEY` are required at boot.

## Data model
`shared/schema.ts` is the source of truth. Currently lightweight — most data is static JSON or live API.

- `server/data/supply-chain-stages.json` — 5 systems with sub-system definitions
- `client/src/data/supply-chain-config.ts` — tree layout config
- `client/src/pages/PowerMap.tsx` — `DATA_CENTERS_RAW` array (58 entries). `DATA_CENTERS` is `DATA_CENTERS_RAW.filter(d => d.powerMW >= MIN_TRACKED_MW)` where `MIN_TRACKED_MW = 400`. Banner copy depends on this filter being enforced.

## Recent work (last 3 commits)
1. `492357c` — Address review: enforce ≥400 MW filter on map, drop nulls from `avgChange`, remove stale hardcoded `facility_count`/`total_capacity_gw` from `/api/export/daily`
2. `284829a` — PowerMap: +10 new ≥400 MW projects (ids 49-58), prominent threshold banner; Supply Chain null fallback (no fake 0%); two cache-shape bug fixes
3. `c757734` — Supply Chain: fix react-icons build break, icons, percentage staleness

## Conventions (non-negotiable)
- **No em dashes** anywhere in code or copy.
- **Dark mode only.** No light variants needed in Tailwind classes.
- **Card radius 0.35rem** (terminal feel).
- **Orange for UI chrome and KPIs. Blue for chart data only.**
- Short direct sentences. Avoid "leverages", "seamlessly", "robust", etc.
- Do not edit `package.json` directly — use the packager tool.
- Do not modify `vite.config.ts` or `server/vite.ts`.
- Add `data-testid` to interactive elements and meaningful display elements.

## Secrets / env
- `SESSION_SECRET` — set
- `ADMIN_API_KEY` — set
- `UNSUB_TOKEN_SECRET` — set
- `NEWSDATA_API_KEY` — optional, missing. RSS fallback covers it.
- `RESEND_API_KEY` — needed for actual newsletter send.

## Git workflow on this Repl
GitHub integration is installed. Token comes from `listConnections('github')[0].settings.access_token` inside `code_execution`.

Critical: **never let the token appear in stdout/stderr** — the sandbox redacts the entire output and the operation fails. Always redirect git commands to a temp log file (`> /tmp/x.log 2>&1`) and only read those logs after stripping the token if you need to surface errors.

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
- The `stackCache` is keyed by timeframe string ("1D", "1W", etc.). Newsletter preview must use a valid timeframe key, not a route name like "supply-chain".
- React Flow is *not* used. Supply Chain is CSS Grid + SVG connector lines (V3 layout).
- PowerMap tile layer is CartoDB Dark Matter via Leaflet, not react-simple-maps.

## Open follow-ups (queued as tasks)
- #11 Surface live stale-data indicator (badge/icon for `stale: true` rows on Supply Chain + Stack)
- #12 Auto-track new hyperscale announcements (move `DATA_CENTERS_RAW` to `server/data/datacenters.json` + ingestion)
- #13 Regression test for throttle path (mock Yahoo down, assert `changePercent: null`, assert UI renders "--")

## How to verify changes locally
- `curl -s http://localhost:5000/api/supply-chain | jq '.stages[] | {name, avgChange, companyCount}'` — sanity check live data
- `curl -s http://localhost:5000/api/export/daily | jq 'keys'` — should be `[date, thesis_status, indices, top_movers]`
- Screenshot `/power-map` and confirm: orange "≥ 400 MW ONLY" banner visible, facility count matches the filtered dataset
- Use `runTest()` from the testing skill for end-to-end checks after UI changes
