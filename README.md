# GridTilt — AI Infrastructure & Power Economy Dashboard

GridTilt visualizes the economic relationship between AI compute demand, data center expansion, power consumption, and the financial markets positioned around it. AI data centers now consume 2–3% of global electricity and that number is accelerating.

## Pages

### 1. Tilt Overview (Home)
- Three live KPI cards: AI Power Demand Index, Nuclear Renaissance Index, Grid Stress Score
- Full-width US electricity demand area chart (2019 → 2030 projection) with key event annotations (ChatGPT launch, AI boom, nuclear renaissance)

### 2. The Stack
Three supply-chain layers with live market data:
- **Compute Layer** — NVDA, AMD, MU, INTC (P/E, revenue growth YoY, 30-day sparklines)
- **Infrastructure Layer** — IREN, EQIX, DLR, AMT (power per facility, performance vs S&P 500)
- **Power Layer** — CEG, NEE, URA, CCJ + uranium vs CEG scatter plot with Pearson correlation coefficient

### 3. Power Map
SVG US map with 25 announced/operating data centers from Microsoft, Google, Amazon, Meta, Apple, xAI, OpenAI, and Oracle. Dots are:
- Green = <100 MW
- Yellow = 100–500 MW
- Red = >500 MW

Click a dot → slide-in panel with company, location, planned capacity, estimated annual power consumption, and nearest grid operator.

### 4. The Trade
Financial thesis builder with sliders for:
- AI workload growth per year
- Average data center PUE
- % shift to nuclear power

Right panel shows projected US power demand chart and the 5 most financially leveraged public companies to the scenario.

### 5. Portfolio Overlay
Paste comma-separated tickers. App scores each holding 0–100 on "AI Power Exposure" across 5 dimensions: Compute / Infrastructure / Power / Cooling / Grid. Visualized as a radar chart.

## Data Sources

| Data | Source |
|------|--------|
| Stock prices, P/E ratios | [Yahoo Finance](https://finance.yahoo.com) via `yahoo-finance2` npm package (unofficial API) |
| US electricity demand history | [EIA Electric Power Monthly](https://www.eia.gov/electricity/monthly/) — US Energy Information Administration |
| Nuclear stock correlation | Calculated internally from Yahoo Finance quotes |
| Data center locations | Public announcements from Microsoft, Google, Amazon, Meta, Apple, xAI, OpenAI, Oracle |
| AI Power Demand Index | Composite: hyperscaler capex + data center capacity announcements |
| Grid Stress Score | Derived from EIA demand trends vs. historical capacity baselines |

## EIA API

The EIA provides a free, open API. No key is required for public data endpoints. For production use with higher rate limits, register at [eia.gov/opendata](https://www.eia.gov/opendata/).

## Running Locally

```bash
npm run dev
```

Server runs on port 5000. Both the Express backend and Vite frontend are served from the same port.

## Tech Stack

- **Frontend**: React + TypeScript, Vite, TailwindCSS, shadcn/ui
- **Backend**: Node.js + Express
- **Charts**: Recharts, React Simple Maps
- **Market Data**: yahoo-finance2 (unofficial Yahoo Finance API)
- **State**: TanStack Query v5

## Design

Dark mode only. Color palette:
- Background: deep navy `#0D1B2A`
- Primary / Electric blue: `#1E90FF`  
- Highlights / Amber: `#F0A500`
- Font: Inter (sans-serif), JetBrains Mono (data)
