# GridTilt | AI Infrastructure & Power Economy Dashboard

## Overview
GridTilt is a full-stack web application that visualizes the economic interplay between AI compute demand, power consumption, and financial markets. It provides a comprehensive dashboard for understanding and analyzing the AI infrastructure and power economy. The project aims to offer a unique perspective on how advancements in AI drive energy demands and influence market dynamics, with a vision to become the leading platform for tracking and analyzing the AI power sector.

## User Preferences
- No em dashes anywhere in the codebase.
- Text style: short, direct sentences. No compound AI-sounding phrasing.
- Dark mode only, with a warm charcoal terminal aesthetic and orange branding.

## System Architecture

### Frontend
The frontend is built with React and TypeScript using Vite. It leverages `wouter` for routing, `TanStack Query v5` for data fetching, and `recharts` and `react-simple-maps` for data visualization. UI components are sourced from `shadcn/ui`, and styling is managed with `TailwindCSS` using a custom dark-mode-only theme.

### Backend
The backend is a Node.js and Express application. It fetches market data using `yahoo-finance2` and aggregates news from RSS feeds (Utility Dive, Data Center Dynamics, World Nuclear News, Power Engineering) with a fallback to `NewsData.io` if an API key is provided, otherwise utilizing static JSON. All API routes are prefixed with `/api`. The system includes fallbacks to static data when external APIs are unavailable.

### Key Features
- **TiltOverview**: Dashboard with KPIs, Thesis Health, Top Movers, Sector Pulse, Catalyst Calendar, X feed, and a demand chart.
- **TheStack**: An 8-layer sector breakdown with live stock data, timeframe toggles, and sort controls.
- **PowerMap**: An interactive Leaflet map with CartoDB Dark Matter tiles displaying 48 data center locations with glowing animated pins, frosted-glass tooltips, floating stats overlay, collapsible filter panel, and a Grid Stress mode.
- **TheTrade**: A Thesis Calculator offering preset and custom scenarios for infrastructure buildout, capex, and LPT outputs.
- **PortfolioOverlay**: Provides AI Power Exposure scoring and a radar chart for portfolios.
- **CatalystTracker**: Tracks upcoming market events.
- **Stock, Sector, Region, Operator Pages**: Dedicated pages for detailed analysis of individual stocks, sectors, grid regions, and hyperscaler operators.
- **Blog**: Features analysis articles on AI infrastructure and power economy topics.
- **SupplyChain**: 5-stage interactive React Flow diagram (Raw Materials > Generation > Transmission > Distribution > End Use) with live sector data, animated edge particles, bottleneck indicators, and click-to-expand stock cards. Uses `@xyflow/react` v12. The d3-transition/d3-selection compatibility is resolved via `resolve.dedupe` in vite.config.ts and a side-effect `import "d3-transition"` in main.tsx.
- **Subscribe / Email Capture**: Email newsletter signup at /subscribe, inline capture at bottom of TiltOverview, scroll-triggered banner. Backend stores subscribers in JSON file (server/data/subscribers.json). Newsletter send via Resend (needs RESEND_API_KEY). Unsubscribe tokens use HMAC-SHA256 with SESSION_SECRET.

### Visual Design
The application features a dark charcoal terminal aesthetic with orange as the primary brand color for UI chrome, badges, and KPIs. Blue (`#1E90FF`) is strictly reserved for chart data series. The UI emphasizes short, direct sentences and avoids complex phrasing. Card radius is set to 0.35rem for a terminal-like appearance.

### Global UX
Includes a scrolling news ticker, keyboard shortcuts (`?` for modal, `G+1-6` for navigation), dynamic KPI cards with sparklines, and a shareable portfolio scoring feature. The `PowerMap` offers detailed filtering and a "Grid Stress" view. The `Thesis Calculator` provides scenario analysis with buildout charts and company rankings.

## External Dependencies
- **yahoo-finance2**: For fetching real-time market data.
- **NewsData.io**: (Optional, with API key) For live news feeds.
- **Recharts**: For charting and data visualization.
- **leaflet** and **react-leaflet**: For interactive tile-based maps (CartoDB Dark Matter).
- **shadcn/ui**: UI component library.
- **TailwindCSS**: For styling and theming.
- **wouter**: For client-side routing.
- **TanStack Query v5**: For data fetching, caching, and state management.
- **Node.js**: Backend runtime environment.
- **Express**: Web application framework for the backend.
- **satori** and **@resvg/resvg-js**: For dynamic OG image generation.
- **@xyflow/react**: For the interactive Supply Chain flow diagram (React Flow v12).
- **RSS feeds**: Utility Dive, Data Center Dynamics, World Nuclear News, Power Engineering for news aggregation.