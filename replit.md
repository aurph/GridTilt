# GridTilt | AI Infrastructure & Power Economy Dashboard

## Overview
Full-stack web application that visualizes the economic relationship between AI compute demand, power consumption, and financial markets. Dark mode only, warm charcoal terminal aesthetic with orange branding. Made by Jack Schwartz / aurph (gridtilt.com).

## Brand
- Primary orange: #F07800
- Amber KPIs: #F0A500
- Blue #1E90FF: STRICTLY for chart data series only
- No em dashes anywhere in the codebase
- Text style: short, direct sentences. No compound AI-sounding phrasing.

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
- News: RSS feeds (Utility Dive, Data Center Dynamics, World Nuclear News, Power Engineering — no key needed, 1hr cache) → NewsData.io (if NEWSDATA_API_KEY set) → static JSON fallback
- All routes prefixed with `/api`
- Falls back to static data when Yahoo Finance is unavailable
- Editable data files: `server/data/news-headlines.json`, `server/data/catalysts.json`

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | TiltOverview | KPI cards + Thesis Health bar + Top Movers + Sector Pulse + Catalyst Calendar + X feed + demand chart |
| `/stack` | TheStack | 8-layer sector breakdown with live stock data, timeframe toggle, sort controls |
| `/power-map` | PowerMap | SVG US map with 48 data center locations, multi-select filters, URL state, RTO choropleth, Grid Stress mode |
| `/trade` | TheTrade | Thesis Calculator — preset scenarios (Conservative/Base/Aggressive/Custom), infra buildout inputs, capex/LPT outputs, methodology panel |
| `/portfolio` | PortfolioOverlay | AI Power Exposure scoring + radar chart + shareable URL |
| `/catalysts` | CatalystTracker | Upcoming market events — earnings, regulatory, policy, commodity windows |
| `/stock/:ticker` | StockPage | Per-stock thesis analysis with price, thesis score, sector context |
| `/sector/:slug` | SectorPage | Sector overview with stock cards and performance stats |
| `/region/:slug` | RegionPage | Grid region profile with description and map link |
| `/operator/:slug` | OperatorPage | Hyperscaler data center operator profile |
| `/blog` | BlogIndex | Analysis articles listing |
| `/blog/:slug` | BlogPost | Full article with TOC, share buttons, internal links |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kpis` | GET | Returns AI Power Index, Nuclear Index, Grid Stress Score |
| `/api/stack` | GET | Returns stock data for 60+ tickers in 8 layers + correlation data. Accepts `?timeframe=1D\|5D\|1M`. 10-min cache. |
| `/api/top-movers` | GET | Returns top 5 tickers by absolute % change across all stack layers |
| `/api/sector-pulse` | GET | Returns average % change per stack layer (8 sectors) |
| `/api/news` | GET | NewsData.io live feed if key present, else static JSON. 30-min cache. |
| `/api/portfolio-score` | POST | Scores portfolio tickers 0-100 on AI Power Exposure |
| `/api/catalysts` | GET | Returns upcoming catalyst events from `server/data/catalysts.json`, sorted by date |
| `/api/earnings-calendar` | GET | Returns upcoming earnings dates for all stack tickers via Yahoo Finance. 4-hour cache. |
| `/api/headlines` | GET | Legacy static headlines endpoint (backward compat) |

## Stack Layers (8 total — TheStack page)

1. **Compute** — NVDA, TSM, AMD, MU, MSFT, GOOGL, META, AAPL, SMCI, AMZN, INTC
2. **Nuclear Power** — CEG, VST, TLN, NRG, OKLO, BWXT, SMR
3. **Uranium & Fuel Cycle** — CCJ, UEC, LEU, UUUU, DNN, NXE, PALAF
4. **Power Hardware** — GEV, ETN, VRT, NVT, CARR, ABB, EMR, HUBB, JCI, SIEGY, BKR
5. **Utilities** — NEE, D, SO, DUK, AEP, XEL, EVRG, PPL, PCG, ETR
6. **Data Centers** — EQIX, DLR, AMT, IREN
7. **Construction & EPC** — PWR, EME, MTZ, STRL, FLR, PRIM
8. **ETF Benchmarks** — URA, URNM, NLR, DTCR, GRID, XLU, PAVE, QQQ, XLK

## Editable Data Files (no redeploy needed)
- `server/data/news-headlines.json` — Array of {headline, source, url, publishedAt} — edit to update news ticker
- `server/data/catalysts.json` — Array of {id, date, title, category, thesisImpact, tickers} — edit to update Catalyst Tracker

## Key Files

- `client/src/App.tsx` — Root app with SidebarProvider + Router + keyboard shortcuts (? opens modal, G+1-6 navigate)
- `client/src/components/app-sidebar.tsx` — Navigation sidebar (7 pages including Analysis/blog)
- `client/src/components/NewsTicker.tsx` — Scrolling orange news banner (uses /api/news, hover-to-pause, clickable)
- `client/src/pages/TiltOverview.tsx` — Landing dashboard (KPIs, Thesis Health, Top Movers, Sector Pulse, Catalyst Calendar, X feed, demand chart)
- `client/src/pages/TheStack.tsx` — 8-layer sector breakdown with timeframe toggle (1D/5D/1M) + sort controls
- `client/src/pages/PowerMap.tsx` — Interactive US map (48 data centers, RTO choropleth, Grid Stress mode)
- `client/src/pages/TheTrade.tsx` — Thesis builder (client-side sliders, no DB needed)
- `client/src/pages/PortfolioOverlay.tsx` — Portfolio scoring with shareable URL (?tickers= param)
- `client/src/pages/CatalystTracker.tsx` — Vertical timeline of upcoming market events with category filter
- `server/routes.ts` — All API routes + static market data + news/catalysts file readers + 8-layer stack
- `client/src/index.css` — Dark-mode-only CSS theme + ticker-scroll animation
- `tailwind.config.ts` — Extended theme with custom colors

## Color Palette
- Background: `hsl(20 5% 7%)` — warm dark charcoal (no blue tint)
- Brand Orange: `#F07800` / `#F0A500` — UI chrome, badges, KPI values, radar, score rings
- Data Viz Blue: `#1E90FF` — chart data series ONLY (Area/Line fills in demand chart)
- Muted Foreground: `hsl(20 4% 50%)` — warm gray labels
- Stack layer colors: Compute #94a3b8, Nuclear #F0A500, Uranium #fb923c, Power HW #60a5fa, Utilities #34d399, Data Centers #a855f7, Construction #f472b6, ETFs #6b7280
- Font: Inter + JetBrains Mono

## Visual Design Principles
- Dark charcoal terminal aesthetic, not AI chatbot navy
- Orange is the only brand color in UI chrome
- Blue restricted to data visualization (chart series) only
- KPI card borders: neutral gray (AI Power), amber (Nuclear Renaissance), orange-red (Grid Stress)
- Card radius: 0.35rem (tighter than consumer apps, more terminal-like)
- All interactive elements have `data-testid` attributes for testing
- No em-dashes in user-facing text

## Global UX Features
- News ticker: CSS keyframes `ticker-scroll` animation, 90s loop, pauses on hover, clickable headlines link to source
- Keyboard shortcuts: press `?` opens modal; `G` then `1-6` navigates to pages
- Thesis Health bar: derived from live KPI values (ACCELERATING/EXPANDING/COOLING)
- Top Movers: top 5 stocks by abs % change with sector color badges
- Sector Pulse: avg % change per stack layer as horizontal bars
- Catalyst Calendar: monthly grid with colored dots per category; click day to expand; "Next 5 Upcoming" list
- X feed: @gridtilt Twitter timeline embedded (dark theme, 5 tweets, no chrome)
- KPI cards: include 14-point sparklines generated from live index values
- Portfolio share: share button copies URL with encoded tickers; ?tickers= auto-scores on load
- 404 page: branded "Grid Signal Lost" in dark GridTilt style
- Stack page: 1D/5D/1M timeframe toggle changes sparkline density/volatility; sort by % change or market cap

## Notes
- No database required — portfolio scoring uses an in-memory lookup table of 60+ tickers
- Yahoo Finance data has static fallbacks in `STATIC_MARKET_DATA` in routes.ts (March 2026 price levels)
- Sparklines are generated procedurally from base price (seeded pseudo-random, deterministic)
- Data center locations are hardcoded from public announcements (see PowerMap.tsx)
- Catalyst dates are relative to March 11, 2026 (current session date)
- Stack cache TTL: 10 min; News cache TTL: 30 min
- PALAF is OTC (Paladin Energy) — live Yahoo Finance quote may not resolve; uses static fallback
- All useQuery hooks have error states with AlertTriangle UI fallback
- Empty states handled for top movers, sector pulse, and stack layers
- Live queries refresh every 15 minutes (refetchInterval: 900000)
- X/Twitter feed has 6-second timeout fallback with external link
- All subtitles are statistics-led (lead with specific data points, not slogans)
- Earnings category color: blue-400 (#60a5fa) — NOT #1E90FF (reserved for chart series)

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

## SEO & Marketing Infrastructure

### Programmatic SEO Pages
| Route | Page | Description |
|-------|------|-------------|
| `/stock/:ticker` | StockPage | Per-stock thesis analysis page with price, thesis score, sector context, related stocks, catalysts |
| `/sector/:slug` | SectorPage | Sector overview with all stocks, avg performance, best/worst performers |
| `/region/:slug` | RegionPage | Grid region info with description, map link, related regions |
| `/operator/:slug` | OperatorPage | Hyperscaler profile with strategy, map link, other operators |
| `/blog` | BlogIndex | Article listing page |
| `/blog/:slug` | BlogPost | Full article with markdown rendering, TOC, share buttons |

### SEO Endpoints
| Endpoint | Description |
|----------|-------------|
| `/sitemap.xml` | Dynamic sitemap (103 URLs: static pages + stocks + sectors + regions + operators + blog) |
| `/robots.txt` | Crawler rules (allow all except /api/) |
| `/humans.txt` | Attribution (Jack Schwartz / aurph) |
| `/.well-known/security.txt` | Security contact |
| `/api/og` | Dynamic OG image generation via satori (Inter font, 1200x630 PNG) |
| `/manifest.json` | PWA manifest (standalone, dark theme) |
| `/feed.xml` | Blog RSS feed (8 articles) |
| `/catalysts/rss.xml` | Catalyst events RSS feed |
| `/news/rss.xml` | News headlines RSS feed |
| `/api/blog` | Blog article index API |
| `/api/blog/:slug` | Blog article detail API |
| `/api/stock/:ticker` | Stock data API (thesis score, related stocks, catalysts) |
| `/api/sectors` | Sector metadata API |
| `/api/export/daily` | Daily data export API |
| `/api/social/generate` | Social post generation API |

### Server-Side SEO
- `server/seo.ts` — Centralized SEO config with `getPageMeta()` for per-route titles, descriptions, OG tags
- JSON-LD schemas: WebSite, Organization, Dataset, FAQ, BreadcrumbList, FinancialProduct, Article
- Server-side meta tag injection for crawlers via `server/vite.ts` and `server/static.ts`
- OG image generation uses `satori` + `@resvg/resvg-js` with Inter font (`server/fonts/Inter-Regular.ttf`)

### Blog System
- 8 seed articles in `content/blog/articles.json`
- Topics: AI data center power, infrastructure stocks, nuclear energy, PJM queues, data center map, transformer shortage, uranium stocks, behind-the-meter power
- Markdown rendering in BlogPost.tsx (headings, bold, links, ordered lists, TOC)

### URL Redirects (301)
- /stocks -> /stack, /map -> /power-map, /calculator -> /trade, /score -> /portfolio
- /catalyst-tracker -> /catalysts, /the-stack -> /stack, /thesis-calculator -> /trade, /portfolio-overlay -> /portfolio

### Key SEO Files
- `server/seo.ts` — Page metadata, JSON-LD, sitemap config
- `server/fonts/Inter-Regular.ttf` — Font for OG image generation
- `content/blog/articles.json` — Blog article content
- `client/index.html` — PWA manifest link, apple-touch-icon, theme-color

## Deployment
- Autoscale deployment on Replit
- Build: `npm run build` (esbuild outputs `dist/index.cjs`)
- Run: `node dist/index.cjs`
- IMPORTANT: `.replit` run command must be `node dist/index.cjs` not `dist/index.js`
- Optional env var: `NEWSDATA_API_KEY` — enables live news from NewsData.io (https://newsdata.io)
