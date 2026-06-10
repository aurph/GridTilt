# GridTilt

> Equities, infrastructure, and power data for the AI power economy.

GridTilt is a research dashboard for tracking the financial and physical buildout of AI infrastructure — compute, data centers, generation, transmission, and the public companies positioned around them. It combines live equity quotes, hand-curated infrastructure datasets, and grid-relevant news so you can see where capital and electrons are actually flowing.

Live: **[gridtilt.com](https://gridtilt.com)**

---

## What it does

| Module | What's inside |
|---|---|
| **Tilt Overview** | The buildout scoreboard (signed nuclear GW, DC pipeline GW, interconnection queue, grid pulse), top movers, catalyst calendar, US electricity demand chart (2010 → 2030 projection). |
| **The Stack** | 100 tickers across 13 supply-chain layers (compute, nuclear, uranium, power hardware, utilities, data-center REITs, construction, mining, natural gas, renewables, grid hardware, crypto/AI DC, ETF benchmarks). |
| **Power Map** | US data center locations with power capacity and the utility / RTO they sit on. |
| **Supply Chain** | D3 force graph of 24 nodes and 52 real supply relationships from raw materials to end-use compute. |
| **Catalyst Tracker** | Earnings + thesis catalyst calendar across 80+ tickers. |
| **Portfolio Overlay** | Score any portfolio 0–100 on AI-power exposure across 5 dimensions. |
| **Thesis Calculator** | Sliders for demand growth, nuclear capacity, and grid stress to model scenarios. |
| **News Ticker** | 7-day rolling feed from 8 industry RSS sources (Utility Dive, DCD, World Nuclear News, POWER Magazine, Power Engineering, Latitude Media, DOE, EIA). |

---

## Data sources

| Data | Source | Freshness |
|---|---|---|
| Equity quotes, P/E, fundamentals | Yahoo Finance via `yahoo-finance2` (unofficial, indicative) | Live, with labeled static fallback when throttled |
| US electricity demand chart | Static annual snapshot (2010–2025) hand-transcribed from [EIA Electric Power Monthly](https://www.eia.gov/electricity/monthly/); 2026–2030 lines are GridTilt projections, not forecasts | Static, embedded in the client |
| Physical electricity output | FRED [`IPG2211A2N`](https://fred.stlouisfed.org/series/IPG2211A2N) served live at `/api/physical/electricity-output`; EIA US48 hourly demand at `/api/physical/load-hourly` once `EIA_API_KEY` is set | Live (FRED daily cache; EIA 30-min cache) |
| Data center locations | Public announcements (Microsoft, Google, Amazon, Meta, Apple, xAI, OpenAI, Oracle), curated through a reviewed RSS ingestion pipeline | Curated, refreshed as announcements land |
| Industry news | Live RSS from 8 publications | Live, refreshed hourly |
| Buildout scoreboard (nuclear deals, DC pipeline, queue, capex) | Curated datasets in `server/data/` summed in real units; every group carries its source and as-of date. See [The scoreboard](#the-scoreboard). | Curated, refreshed as deals and filings land |

No proprietary data feeds and no scraped paywalled sources. All projections are clearly labeled as such.

---

## The scoreboard

The headline numbers are sums over curated datasets, in real units. No baselines, no clamps, no index anchors, nothing rebased to 100.

- **Nuclear-for-AI, signed** = sum of `capacityMW` over active, datacenter-relevant nuclear projects marked `firmness: "signed"` in `server/data/interconnection-queue.json`. Signed means executed contracts and restarts underway. Options, proposals, and aggregate LOI pipelines live in separate buckets and never inflate the headline.
- **DC pipeline** = sums by build status over `server/data/datacenters.json` (tracked US sites at 400 MW or more; a curated registry, not a census), plus disclosed FY2025 hyperscaler capex with per-company source links.
- **Interconnection queue** = LBNL "Queued Up" headline stats plus ISO filings, with as-of dates shipped in the data.
- **Grid pulse** = live US48 demand from EIA's hourly grid monitor (free key) and year-over-year US electric output from FRED `IPG2211A2N`. Measurements, not sentiment.
- The one market element left is a single line: an equal-weight mean of today's percent moves across the tracked tickers, with stale tickers excluded and the live count disclosed. A percent, never a level.

Everything is served at `/api/metrics` with a source and as-of per group; daily snapshots append at `/api/metrics/history`.

### What happened to the indices

GridTilt used to headline three composite indices (AI Demand, Grid Stress, NPI). We backtested them against physical electricity output (FRED, 2019–2026) and published the result: no physical signal at any lead, and NPI moved at r = 0.95 with a single constituent stock. So on 2026-06-10 we retired them and replaced them with the real numbers above. The study stays public in [docs/INDEX_VALIDATION.md](./docs/INDEX_VALIDATION.md), the formulas remain in `server/indices.ts`, the archived daily series is still served at `/api/index-history`, and `npm run backtest:indices` still reproduces it from public prices.

---

## Stack

- **Frontend** — React 18, TypeScript, Vite, Tailwind, shadcn/ui, Recharts, D3, React Leaflet
- **Backend** — Node 20, Express 5; persistence is curated JSON in `server/data/` (no database)
- **Data** — `yahoo-finance2`, `rss-parser`, curated JSON datasets in `server/data/`
- **Hosting** — Replit Deployments (autoscale)

---

## Run locally

```bash
npm install
cp .env.example .env   # set UNSUB_TOKEN_SECRET and ADMIN_API_KEY; the rest is optional
npm run dev
```

Both the Express API and the Vite dev server bind to **port 5000** (override with `PORT`).

```bash
npm run build    # production bundle
npm start        # serve the built bundle
npm run check    # typecheck
```

---

## Configuration

| Var | Required | Notes |
|---|---|---|
| `UNSUB_TOKEN_SECRET` | yes | HMAC key for unsubscribe tokens. `openssl rand -hex 32`. |
| `ADMIN_API_KEY` | yes | Guards `/api/admin/*` and newsletter send. `openssl rand -hex 32`. |
| `RESEND_API_KEY` | no | Syncs subscribers to Resend and enables newsletter sends. Without it, signups only persist to local JSON (ephemeral on autoscale hosts). |
| `EIA_API_KEY` | no | Free key from [eia.gov/opendata](https://www.eia.gov/opendata/register.php). Enables live US48 hourly demand at `/api/physical/load-hourly`. |
| `NEWSDATA_API_KEY` | no | Optional [newsdata.io](https://newsdata.io) key. The 8 RSS feeds work without it. |
| `X_API_*` | no | Four X credentials for the daily auto-poster; dry-run logs locally without them. |

---

## Project layout

```
client/         React + Vite frontend
  src/
    pages/      Route-level components (TiltOverview, Stack, PowerMap, ...)
    components/ Shared UI and shadcn primitives
    data/       Static config (supply chain graph, ticker metadata)
server/         Express API
  routes.ts     All HTTP endpoints + RSS / Yahoo fetchers
  indices.ts    Pure index math (unit-tested)
  data/         Curated JSON datasets (subscribers, queue, datacenters, ...)
```

---

## License

MIT — see [LICENSE](./LICENSE).

Built by [Jack Schwartz](https://github.com/aurph).
