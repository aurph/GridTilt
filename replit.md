# GridTilt | AI Infrastructure & Power Economy Dashboard

> Short, accurate pointer. For full detail see `README.md`, `CLAUDE.md`, and `docs/ARCHITECTURE.md`. The previous version of this file was a May-18 snapshot that had drifted badly out of date; corrected 2026-06-09.

## Overview
GridTilt is a research dashboard for the AI power economy — compute, data centers, generation, transmission, and the public equities around them. Live at gridtilt.com.

## Architecture
- **Frontend:** React 18 + TypeScript + Vite, `wouter` routing, TanStack Query v5, Tailwind + shadcn/ui (dark mode only, warm charcoal + `#F07800` orange). Visualizations: Recharts (charts), D3 (supply-chain force graph), Leaflet + CartoDB Dark Matter (Power Map). No react-simple-maps.
- **Backend:** Node 20 + Express 5. Market data via `yahoo-finance2` (unofficial, with labeled static fallback when throttled). News from 8 RSS feeds (Utility Dive, Data Center Dynamics, World Nuclear News, POWER Magazine, Power Engineering, Latitude Media, DOE, EIA) with optional NewsData.io. Physical electricity data from FRED and EIA. All API routes are prefixed `/api`.
- **Persistence:** curated JSON datasets in `server/data/` (no database). On Replit autoscale these are ephemeral across deploys — see `docs/audit/01_findings.md`.

## Key surfaces
TiltOverview (`/overview`), TheStack (`/stack`, 100 tickers / 13 layers), PowerMap (`/power-map`, Leaflet), SupplyChain (`/supply-chain`, D3 force graph, 24 nodes / 52 links), CatalystTracker (`/catalysts`), TheTrade (`/trade`), PortfolioOverlay (`/portfolio`), Queue (`/queue`, LBNL interconnection backlog), Blog, Subscribe. Marketing home at `/`.

## Conventions
- No em dashes. Short, direct sentences; no marketing phrasing.
- Dark mode only; `#F07800` brand orange; blue (`#1E90FF`) reserved for chart series.
- Keyboard shortcuts: `?` for the modal, `G+1`–`G+9` for navigation.
- Unsubscribe tokens use HMAC-SHA256 with `UNSUB_TOKEN_SECRET` (not SESSION_SECRET).

## Deployment
Replit autoscale. A push to GitHub does NOT auto-deploy — redeploy manually via Replit → Deployments. A push is not a ship.
