# GridTilt

> Equities, infrastructure, and power data for the AI power economy.

GridTilt is a research dashboard for tracking the financial and physical buildout of AI infrastructure — compute, data centers, generation, transmission, and the public companies positioned around them. It combines live equity quotes, hand-curated infrastructure datasets, and grid-relevant news so you can see where capital and electrons are actually flowing.

Live: **[gridtilt.com](https://gridtilt.com)**

---

## What it does

| Module | What's inside |
|---|---|
| **Tilt Overview** | Top movers, sector pulse, catalyst calendar, US electricity demand chart (2010 → 2030 projection), thesis-health KPIs. |
| **The Stack** | 60+ tickers across 8 supply-chain layers (compute, nuclear, uranium, power hardware, utilities, construction, hyperscalers, REITs). |
| **Power Map** | US data center locations with power capacity and the utility / RTO they sit on. |
| **Supply Chain** | D3 force graph of 21 nodes and 44 real supply relationships from raw materials to end-use compute. |
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
| AI Demand, Grid Stress, NPI | Composite indices computed from constituent **equity moves** (NPI also uses uranium spot and a hand-derived policy score). They are market-based gauges, **not** physical grid measurements. See [Index methodology](#index-methodology). | Live, with labeled static fallback |

No proprietary data feeds and no scraped paywalled sources. All projections are clearly labeled as such.

---

## Index methodology

The three headline indices are deterministic functions of their published constituents. Exact formulas, so you can check the math:

- **AI Demand** = clamp(52–94, `72 + 1.2 × (NVDA% × 0.40 + TSM% × 0.25 + EQIX% × 0.20 + MU% × 0.15)`) using today's intraday percent changes. It reads how the market is pricing the AI-buildout complex **today**; it does not measure data-center load.
- **Grid Stress** = clamp(52–92, `68 + (VST% × 0.40 + CEG% × 0.35 + EQIX% × 0.25)`). Same construction; EQIX appears in both baskets. It reads power-equity momentum, not reserve margins or LMPs.
- **NPI (Nuclear Power Index)** = `100 × (0.25·CEG + 0.20·VST + 0.15·CCJ + 0.20·NLR + 0.10·uranium spot + 0.10·policy)` as price relatives to Jan 1, 2024 bases, times a 0.9–1.1 policy multiplier from a hand-derived SMR policy score. Weights are judgment calls and labeled as such.

Baselines (72, 68) and clamps are presentation choices that keep the gauges readable; they are disclosed here so nobody mistakes them for measurements. Constituent values are exposed at `/api/kpis`.

**Validation:** the gauges are backtested against physical electricity output (FRED `IPG2211A2N`, 2019–2026, leads 0–3 months) in [docs/INDEX_VALIDATION.md](./docs/INDEX_VALIDATION.md). Result: neither AI Demand nor Grid Stress shows a physical signal, so both are labeled **market sentiment gauges** in the UI, not measurements. Reproduce it yourself: `npm run backtest:indices`. The reconstructed daily series lives in `server/data/index-history.json`.

---

## Stack

- **Frontend** — React 18, TypeScript, Vite, Tailwind, shadcn/ui, Recharts, D3, React Leaflet
- **Backend** — Node 20, Express 5, Drizzle ORM, optional Postgres (in-memory fallback)
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
| `DATABASE_URL` | no | Postgres connection string. Without it, the app uses in-memory storage. |
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
  storage.ts    IStorage interface (in-memory + Postgres impls)
shared/         Types and Drizzle schemas shared between client and server
```

---

## License

MIT — see [LICENSE](./LICENSE).

Built by [Jack Schwartz](https://github.com/aurph).
