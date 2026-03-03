# GridTilt — AI Infrastructure & Power Economy Dashboard

## Overview
Full-stack web application that visualizes the economic relationship between AI compute demand, power consumption, and financial markets. Dark mode only, deep navy color scheme.

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
- Background: `hsl(214 42% 7%)` ≈ `#0D1B2A`
- Primary (Electric Blue): `#1E90FF`
- Accent (Amber): `#F0A500`
- Font: Inter + JetBrains Mono

## Notes
- No database required — portfolio scoring uses an in-memory lookup table of 30+ tickers
- Yahoo Finance data has static fallbacks in `STATIC_MARKET_DATA` in routes.ts
- Sparklines are generated procedurally from the base price
- Data center locations are hardcoded from public announcements (see PowerMap.tsx)
- vite.config.ts has `optimizeDeps.include: ["recharts", "react-simple-maps"]` for Vite compatibility
