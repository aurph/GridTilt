# GridTilt - Claude Code Context

## What is this?
Research dashboard tracking AI infrastructure investment — data centers, compute, power/energy, public equities. Live at gridtilt.com. Built by Jack Schwartz (aurph).

## Tech Stack
React 18 + TypeScript + Vite + Tailwind + shadcn/ui frontend. Node.js + Express 5 backend. Drizzle ORM, optional Postgres. Deployed on Replit.

## Key Directories
- client/src/pages/ — Route page components
- client/src/components/ — Shared components (app-sidebar.tsx, NewsTicker.tsx, EmailCapture.tsx)
- client/src/data/ — Config files (supply-chain-config.ts, catalyst-config.ts)
- server/ — Express API, routes.ts, seo.ts, storage.ts
- shared/ — Shared types and schemas

## Conventions
- Dark mode only (warm charcoal + orange theme, #F07800 brand color)
- JetBrains Mono for branding, Inter for body
- shadcn/ui components in client/src/components/ui/
- No co-authored-by lines in commits
- Keyboard shortcuts: G+1 through G+8 for navigation

## Deployment
Push to GitHub -> Pull on Replit -> Replit auto-deploys
**Gotcha:** Replit autoscale/reserved-VM does NOT auto-pull on push. Manual redeploy required via Replit → Deployments → Redeploy. Don't say "shipped" after a push.

## Active redesign
The homepage (`/`) is being redesigned. Read `HOMEPAGE_HANDOFF.md` before touching anything under `client/src/pages/TiltOverview.tsx` or `client/src/App.tsx` routes. Anchor is Swiss; route split moves dashboard to `/overview`.
