# GridTilt

> Equities, infrastructure, and power data for the AI power economy.

GridTilt is a research dashboard for tracking the financial and physical buildout of AI infrastructure — compute, data centers, generation, transmission, and the public companies positioned around them. It pulls live equity data, EIA power data, and grid-relevant news so you can see where capital and electrons are actually flowing.

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

| Data | Source |
|---|---|
| Equity quotes, P/E, fundamentals | Yahoo Finance via `yahoo-finance2` |
| US electricity demand history | [EIA Electric Power Monthly](https://www.eia.gov/electricity/monthly/) |
| Data center locations | Public announcements (Microsoft, Google, Amazon, Meta, Apple, xAI, OpenAI, Oracle) |
| Industry news | Live RSS from 8 publications, refreshed hourly |
| Grid stress, AI demand, NRI | Composite indices derived from EIA + capacity announcements |

No proprietary data feeds and no scraped paywalled sources. All projections are clearly labeled as such.

---

## Stack

- **Frontend** — React 18, TypeScript, Vite, Tailwind, shadcn/ui, Recharts, D3, React Leaflet
- **Backend** — Node 20, Express 5, Drizzle ORM, optional Postgres (in-memory fallback)
- **Data** — `yahoo-finance2`, `rss-parser`, EIA public endpoints
- **Hosting** — Replit Deployments (autoscale)

---

## Run locally

```bash
npm install
cp .env.example .env   # set SESSION_SECRET; everything else is optional
npm run dev
```

Both the Express API and the Vite dev server bind to **port 5000**.

```bash
npm run build    # production bundle
npm start        # serve the built bundle
npm run check    # typecheck
```

---

## Configuration

| Var | Required | Notes |
|---|---|---|
| `SESSION_SECRET` | yes | Any long random string. |
| `NEWSDATA_API_KEY` | no | Optional [newsdata.io](https://newsdata.io) key. The 8 RSS feeds work without it. |
| `DATABASE_URL` | no | Postgres connection string. Without it, the app uses in-memory storage. |

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
