# GridTilt — AI Infrastructure & Power Economy Dashboard

## Overview
Full-stack web application that visualizes the economic relationship between AI compute demand, power consumption, and financial markets. Dark mode only, warm charcoal terminal aesthetic with orange branding. Made by Jack Schwartz / aurph (gridtilt.com).

## Architecture

### Frontend
- React + TypeScript with Vite
- Routing: wouter
- Data fetching: TanStack Query v5
- Charts: recharts, react-simple-maps
- UI: shadcn/ui components
- Styling: TailwindCSS (dark-mode-only custom theme)

### Backend
- Node.js + Express
- Market data: yahoo-finance2 (unofficial API, no key required)
- All routes prefixed with `/api`
- Falls back to static data when Yahoo Finance is unavailable
- Editable data files: `server/data/news-headlines.json`, `server/data/catalysts.json`

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | TiltOverview | KPI cards + Thesis Health bar + demand chart + Next Catalysts widget |
| `/stack` | TheStack | Sector breakdown with live stock data, timeframe toggle, sort controls |
| `/power-map` | PowerMap | SVG US map with 48 data center locations, multi-select filters, URL state, RTO choropleth, Grid Stress mode |
| `/trade` | TheTrade | Thesis Calculator — preset scenarios (Conservative/Base/Aggressive/Custom), infra buildout inputs, capex/LPT outputs, methodology panel |
| `/portfolio` | PortfolioOverlay | AI Power Exposure scoring + radar chart + shareable URL |
| `/catalysts` | CatalystTracker | Upcoming market events — earnings, regulatory, policy, commodity windows |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kpis` | GET | Returns AI Power Index, Nuclear Index, Grid Stress Score |
| `/api/stack` | GET | Returns stock data for 12 tickers in 3 layers + correlation data. Accepts `?timeframe=1D\|5D\|1M` |
| `/api/portfolio-score` | POST | Scores portfolio tickers 0-100 on AI Power Exposure |
| `/api/headlines` | GET | Returns news headlines from `server/data/news-headlines.json` |
| `/api/catalysts` | GET | Returns upcoming catalyst events from `server/data/catalysts.json`, sorted by date |

## Editable Data Files (no redeploy needed)
- `server/data/news-headlines.json` — Array of {id, headline, source, url} — edit to update the scrolling news ticker
- `server/data/catalysts.json` — Array of {id, date, title, category, thesisImpact, tickers} — edit to update Catalyst Tracker

## Key Files

- `client/src/App.tsx` — Root app with SidebarProvider + Router + keyboard shortcuts (? opens modal, G+1-6 navigate)
- `client/src/components/app-sidebar.tsx` — Navigation sidebar (6 pages)
- `client/src/components/NewsTicker.tsx` — Scrolling orange news banner below header
- `client/src/pages/TiltOverview.tsx` — Landing dashboard with Thesis Health bar + Next Catalysts widget
- `client/src/pages/TheStack.tsx` — Sector breakdown with timeframe toggle (1D/5D/1M) + sort controls
- `client/src/pages/PowerMap.tsx` — Interactive US map (48 data centers, RTO choropleth, Grid Stress mode)
- `client/src/pages/TheTrade.tsx` — Thesis builder (client-side sliders, no DB needed)
- `client/src/pages/PortfolioOverlay.tsx` — Portfolio scoring with shareable URL (?tickers= param)
- `client/src/pages/CatalystTracker.tsx` — Vertical timeline of upcoming market events with category filter
- `server/routes.ts` — All API routes + static market data fallbacks + headlines/catalysts file readers
- `client/src/index.css` — Dark-mode-only CSS theme + ticker-scroll animation
- `tailwind.config.ts` — Extended theme with custom colors

## Color Palette
- Background: `hsl(20 5% 7%)` — warm dark charcoal (no blue tint)
- Brand Orange: `#F07800` / `#F0A500` — UI chrome, badges, KPI values, radar, score rings
- Data Viz Blue: `#1E90FF` — chart data series ONLY (Area/Line fills in demand chart)
- Muted Foreground: `hsl(20 4% 50%)` — warm gray labels
- Compute segment: `#94a3b8` (slate), Infrastructure: `#a855f7` (purple), Power: `#F0A500` (amber)
- Font: Inter + JetBrains Mono

## Visual Design Principles
- Dark charcoal terminal aesthetic, not AI chatbot navy
- Orange is the only brand color in UI chrome
- Blue restricted to data visualization (chart series) only
- KPI card borders: neutral gray (AI Power), amber (Nuclear Renaissance), orange-red (Grid Stress)
- Card radius: 0.35rem (tighter than consumer apps, more terminal-like)
- All interactive elements have `data-testid` attributes for testing

## Global UX Features
- News ticker: CSS keyframes `ticker-scroll` animation, 90s loop, pauses on hover
- Keyboard shortcuts: press `?` opens modal; `G` then `1-6` navigates to pages
- Thesis Health bar: derived from live KPI values (ACCELERATING/EXPANDING/COOLING)
- Next Catalysts widget on TiltOverview: 3 soonest events with "View All" link
- KPI cards: include 14-point sparklines generated from live index values
- Portfolio share: share button copies URL with encoded tickers; ?tickers= auto-scores on load
- 404 page: branded "Grid Signal Lost" in dark GridTilt style
- Stack page: 1D/5D/1M timeframe toggle changes sparkline density/volatility; sort by % change, market cap, or thesis leverage

## Notes
- No database required — portfolio scoring uses an in-memory lookup table of 30+ tickers
- Yahoo Finance data has static fallbacks in `STATIC_MARKET_DATA` in routes.ts (March 2026 price levels)
- Sparklines are generated procedurally from base price
- Data center locations are hardcoded from public announcements (see PowerMap.tsx)
- Catalyst dates are relative to March 11, 2026 (current session date)

## Data Freshness (as of March 2026)
- RTO reserve margins: NERC LTRA 2026 (MISO 13.4%, ERCOT 15.8%, PJM 17.5%)
- US electricity demand: 2025 EIA estimate (4,490 TWh total, 288 TWh data centers = 6.4%)
- Sector demand table: 2025 actuals (Data Centers +33.3% YoY)
- Hyperscaler capex: 2025 Big 4 actuals ($328B: AMZN $105B, GOOGL $75B, MSFT $83B, META $65B)
- NRI base prices anchored Jan 1, 2024; uranium spot ~$92/lb (Mar 2026)

## Power Map Features
- 48 data center locations (hardcoded from public announcements)
- Multi-select filter bar: by operator (10 companies), by RTO/ISO (7 regions), by capacity (<100/100-500/500+ MW)
- Filter state encoded in URL query params for shareable links
- Dimmed (opacity 0.12) vs active (opacity 0.78) dots on filtered views
- Dynamic "Showing X of 48 facilities" count with Clear All button
- Mobile filter bottom sheet (hamburger toggle on small screens)
- Hover tooltip (name, MW, status, city, ETA) — suppressed when sidebar open
- Selected dot: leader line + city label with dark outline; click to pin
- 7 RTO/ISO regions with distinct choropleth tints on state fill
- View mode toggle: "DC Locations" (RTO colors) | "Grid Stress" (reserve margin colors)
- Grid Operator Load Analysis table: per-RTO MW totals, reserve margins, stress badges
- Per-facility sidebar with Grid Context block (RTO, reserve margin, total RTO AI load, stress signal)
- Upcoming Projects horizontal scroll strip (announced facilities)

## Thesis Calculator Features
- Three presets: Conservative (35 GW), Base (50 GW), Aggressive (75 GW) — pre-populate all inputs
- Inputs: new AI DC capacity (GW), capex per MW ($M), generation mix % (gas/nuclear/renewables/grid), LPT per GW, AI CAGR, PUE
- Auto-switches to "Custom" badge when any input is modified from a preset
- Generation mix validation: warning + color if sum != 100%
- Output cards: Total Capex ($B), Annual LPTs vs 60/yr domestic capacity (color-coded), Nuclear GW, Interconnect timeline
- Stacked bar buildout chart (2025-2030): gas/nuclear/renewables/grid by year
- Company rankings (8 positions): score adjusted by nuclearPct and aiCagrPct
- Collapsible Methodology panel: sources (IEA/EIA/McKinsey/DOE/hyperscalers), formulas, key sensitivities, disclaimer

## Deployment
- Autoscale deployment on Replit
- Build: `npm run build` (esbuild outputs `dist/index.cjs`)
- Run: `node dist/index.cjs`
- IMPORTANT: `.replit` run command must be `node dist/index.cjs` not `dist/index.js`
