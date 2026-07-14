# GridTilt

> Equities, infrastructure, and power data for the AI power economy.

GridTilt is a research dashboard tracking the financial and physical buildout of AI infrastructure: compute, data centers, generation, transmission, and the public companies positioned around them. It combines live equity quotes, live GPU rental prices, hand-curated infrastructure datasets, and grid-relevant news.

Live: **[gridtilt.com](https://gridtilt.com)**

![GridTilt dashboard](docs/screenshots/home_after_return.png)

---

## Tools

Eight tools in the sidebar. Retired routes (`/supply-chain`, `/power-deals`, `/queue`, `/gpu-economics`, `/trade`, `/portfolio`, `/brief`) redirect into tabs of these.

| Tool | Route | What's inside |
|---|---|---|
| **Tilt Overview** | `/overview` | Measured headline gauges (tracked AI data center power in GW, fleet-average GPU rental cost, tightest reserve margin among AI-load RTOs), tracked buildout over time, top movers, sector pulse, next catalysts, and a US electricity demand chart (static annual series from EIA Electric Power Monthly with labeled projections). |
| **The Stack** | `/stack` | 100 tickers across 13 supply-chain layers with live quotes and sparklines. Card, table, heatmap, and flow views; the flow view is a d3 force graph of 24 supply-chain nodes and 52 real supply relationships. Also carries the uranium correlation card (see below). |
| **Power** | `/power-map` | US data center facility map (Leaflet), plus tabs for AI power deals and the grid interconnection queue. |
| **Compute Frontier** | `/compute-frontier` | 235 named AI superclusters across 77 operators: GPUs, chip type, rated and planned power, grid region, energy source. Each cluster carries its own source links, and every estimated value sits in a per-cluster `estimated[]` list. GPU counts appear only where an operator disclosed one. |
| **GPU Prices** | `/neocloud-intel` | GPU rental price index built from live marketplace observations, with per-model price history. The economics tab models the cost of AI compute. |
| **Analyze** | `/analyze` | Portfolio tab scores any portfolio 0-100 on AI-power exposure; scenario tab models demand growth, nuclear capacity, and grid stress. |
| **Catalyst Tracker** | `/catalysts` | Earnings dates (live from Yahoo, seeded fallback) plus curated thesis catalysts on a monthly calendar. |
| **Analysis** | `/blog` | Research articles plus the daily Buildout Brief. |

A news ticker runs across every dashboard page: a 7-day rolling feed from 8 industry RSS sources (Utility Dive, DCD, World Nuclear News, Power Engineering, POWER Magazine, Latitude Media, DOE, EIA), with NewsData.io as an optional additional tier.

## Data honesty

The rule across the app: serve real observations, flag estimates, and degrade with an explicit error instead of fabricating a number.

- **GPU prices** are recorded from public, keyless marketplace APIs: RunPod (secure and community on-demand pricing) and Vast.ai (median of the cheapest verified on-demand offers). A model with no live source that day records nothing; curated anchor prices are flagged `est.` and charts interpolate across gaps instead of inventing points.
- **Uranium correlation** is computed from 52 weeks of real weekly closes: SRUUF (Sprott Physical Uranium Trust, the closest freely quotable spot proxy) against CCJ and CEG. On fetch failure the card shows an unavailable state, not invented dots.
- **Equity quotes** fall back per ticker to labeled static data when Yahoo throttles; the change column renders "--" rather than a stale number pretending to be live.
- **Keyed sources** respond `{configured: false}` with setup instructions when the key is absent; upstream failures return 502. Nothing is faked on failure.

## Data sources

| Data | Source | Behavior |
|---|---|---|
| Equity quotes, sparklines, fundamentals (~100 tickers) | Yahoo Finance via `yahoo-finance2` (unofficial, indicative) | Live; per-ticker labeled static fallback |
| GPU rental prices | RunPod GraphQL API + Vast.ai marketplace API (public, keyless) | Live observations recorded daily; no observation means no record |
| Uranium correlation | SRUUF vs CCJ and CEG weekly closes via Yahoo | Live; null (unavailable) on failure |
| US monthly electric output | FRED [`IPG2211A2N`](https://fred.stlouisfed.org/series/IPG2211A2N) at `/api/physical/electricity-output` | Live, daily cache; 502 on failure |
| US48 hourly demand | EIA v2 at `/api/physical/load-hourly` (needs `EIA_API_KEY`) | Live, 30-min cache; `{configured: false}` without a key |
| Industry news | 8 RSS feeds; NewsData.io with an optional key | Live, refreshed hourly |
| Facilities, superclusters, deals, interconnection queue, catalysts | Curated JSON in `server/data/` with per-item sources; some files are machine-written by recorders and a reviewed RSS ingester | Curated, refreshed as announcements land |

No proprietary data feeds and no scraped paywalled sources. Projections are labeled as projections.

## Legacy indices

The former headline gauges (AI Demand, Grid Stress, NPI) were sentiment formulas over equity moves. They no longer appear on the dashboard; the overview shows measured numbers instead. `/api/kpis` and `/api/index-history` still serve and record them so the published series stays continuous. Methodology and backtest: [docs/INDEX_VALIDATION.md](./docs/INDEX_VALIDATION.md), `npm run backtest:indices`.

## Stack

- **Client**: React 18, TypeScript, Vite, wouter, TanStack Query v5, Tailwind CSS, shadcn/ui (house-modified fork in `client/src/components/ui`; do not regenerate from upstream), Recharts, visx, d3, react-leaflet.
- **Server**: Express 5, single process. Vite middleware in dev, static files from `dist/public` in prod. Port 5000.
- **Persistence**: JSON files in `server/data/` and `content/blog/`. There is no database.
- **Tests**: Node's built-in test runner; 217 tests across server and client lib suites.

## Run locally

```bash
npm install
cp .env.example .env   # set UNSUB_TOKEN_SECRET and ADMIN_API_KEY; the rest is optional
npm run dev            # Express + Vite middleware on port 5000
```

```bash
npm run check    # typecheck
npm test         # node:test suites
npm run build    # vite client + esbuild server -> dist/
npm start        # serve the built bundle
```

## Configuration

| Var | Required | Notes |
|---|---|---|
| `UNSUB_TOKEN_SECRET` | yes | HMAC key for unsubscribe tokens. `openssl rand -hex 32`. |
| `ADMIN_API_KEY` | yes | Guards `/api/admin/*`, newsletter send, and daily export. `openssl rand -hex 32`. |
| `RESEND_API_KEY` | no | Syncs subscribers to Resend and enables newsletter sends. Without it, signups only persist to local JSON. |
| `EIA_API_KEY` | no | Free key from [eia.gov/opendata](https://www.eia.gov/opendata/register.php). Enables live US48 hourly demand. |
| `NEWSDATA_API_KEY` | no | Optional [newsdata.io](https://newsdata.io) key. The 8 RSS feeds work without it. |
| `X_API_*` | no | Four X credentials for the weekday auto-poster; it dry-runs and logs locally without them. |
| `X_POSTING_ENABLED` | no | Kill switch for the auto-poster; defaults off (dry-run). |
| `DISABLE_DATACENTER_INGESTER` | no | Set to `1` to disable the 6-hour RSS datacenter ingester. |

## Project layout

```
client/src/
  pages/        route-level components, one file per tool
  components/   shared UI; components/ui is the modified shadcn fork
  data/         static client config (supply chain graph, catalysts, RTOs)
  lib/          query client, design tokens, pure helpers (tested)
server/
  routes.ts     all HTTP endpoints
  *.ts          pure modules the routes call (indices, clusters, deals,
                gpu-index, gpu-live, gpu-economics, brief, physical, ...)
  data/         JSON persistence: hand-curated and machine-written files
  __tests__/    node:test suites
content/blog/   articles.json
script/build.ts production build (vite client + esbuild server)
scripts/        backtest and maintenance scripts
```

There is no `shared/` directory, no ORM, and no external datastore. API payload shapes are declared where they are consumed.

## Deploy

Replit autoscale. A push to GitHub does not deploy, and autoscale does not auto-pull: merge, then redeploy manually in Replit (Deployments, then Redeploy). After a redeploy, sanity-check `/api/stack`, `/api/kpis`, and `/api/clusters/metrics`.

Machine-written JSON (subscribers, price history, ingested facilities) lives on the instance disk, which is ephemeral across redeploys.

## License

MIT, see [LICENSE](./LICENSE).

Built by [Jack Schwartz](https://github.com/aurph).
