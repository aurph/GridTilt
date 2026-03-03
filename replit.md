# GridTilt — AI Infrastructure & Power Economy Dashboard

## Overview
Full-stack web application that visualizes the economic relationship between AI compute demand, power consumption, and financial markets. Dark mode only, warm charcoal terminal aesthetic with orange branding.

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

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | TiltOverview | KPI cards + US electricity demand chart |
| `/stack` | TheStack | Sector breakdown with live stock data |
| `/power-map` | PowerMap | SVG US map with 25 data center locations |
| `/trade` | TheTrade | Interactive thesis builder with sliders |
| `/portfolio` | PortfolioOverlay | AI Power Exposure scoring + radar chart |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/kpis` | GET | Returns AI Power Index, Nuclear Index, Grid Stress Score |
| `/api/stack` | GET | Returns stock data for 12 tickers in 3 layers + correlation data |
| `/api/portfolio-score` | POST | Scores portfolio tickers 0–100 on AI Power Exposure |

## Key Files

- `client/src/App.tsx` — Root app with SidebarProvider + Router
- `client/src/components/app-sidebar.tsx` — Navigation sidebar
- `client/src/pages/TiltOverview.tsx` — Landing dashboard
- `client/src/pages/TheStack.tsx` — Sector breakdown
- `client/src/pages/PowerMap.tsx` — Interactive US map (25 hardcoded data centers)
- `client/src/pages/TheTrade.tsx` — Thesis builder (client-side sliders, no DB needed)
- `client/src/pages/PortfolioOverlay.tsx` — Portfolio scoring
- `server/routes.ts` — All API routes + static market data fallbacks
- `client/src/index.css` — Dark-mode-only CSS theme
- `tailwind.config.ts` — Extended theme with navy/electric/amber custom colors

## Color Palette
- Background: `hsl(20 5% 7%)` — warm dark charcoal (no blue tint)
- Brand Orange: `#F07800` / `#F0A500` — UI chrome, badges, KPI values, radar, score rings
- Data Viz Blue: `#1E90FF` — chart data series ONLY (Area/Line fills in demand chart, Bar fills in thesis chart)
- Muted Foreground: `hsl(20 4% 50%)` — warm gray labels
- Compute segment color: `#94a3b8` (slate) — section headers and segment badges
- Font: Inter + JetBrains Mono

## Visual Design Principles
- Dark charcoal terminal aesthetic, not AI chatbot navy
- Orange is the only brand color in UI chrome
- Blue restricted to data visualization (chart series) only
- KPI card borders: neutral gray (AI Power), amber (Nuclear Renaissance), orange-red (Grid Stress)
- Card radius: 0.35rem (tighter than consumer apps, more terminal-like)

## Notes
- No database required — portfolio scoring uses an in-memory lookup table of 30+ tickers
- Yahoo Finance data has static fallbacks in `STATIC_MARKET_DATA` in routes.ts
- Sparklines are generated procedurally from the base price
- Data center locations are hardcoded from public announcements (see PowerMap.tsx)
- vite.config.ts has `optimizeDeps.include: ["recharts", "react-simple-maps"]` for Vite compatibility
