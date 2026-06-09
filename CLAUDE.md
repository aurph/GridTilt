# GridTilt - Claude Code Context

## What is this?
Research dashboard tracking AI infrastructure investment — data centers, compute, power/energy, public equities. Live at gridtilt.com. Built by Jack Schwartz (aurph).

## Tech Stack
React 18 + TypeScript + Vite + Tailwind + shadcn/ui frontend. Node.js + Express 5 backend. Persistence is curated JSON in `server/data/` (no database). Deployed on Replit (autoscale; the filesystem is ephemeral across deploys).

## Key Directories
- client/src/pages/ — Route page components
- client/src/components/ — Shared components (app-sidebar.tsx, NewsTicker.tsx, EmailCapture.tsx)
- client/src/data/ — Config files (supply-chain-config.ts, catalyst-config.ts)
- server/ — Express API: routes.ts, indices.ts, seo.ts, and data/ (curated JSON datasets)

## Conventions
- Dark mode only (warm charcoal + orange theme, #F07800 brand color)
- JetBrains Mono for branding, Inter for body
- shadcn/ui components in client/src/components/ui/
- No co-authored-by lines in commits
- Keyboard shortcuts: G+1 through G+9 for navigation

## Deployment
Push to GitHub -> Pull on Replit -> Replit auto-deploys
**Gotcha:** Replit autoscale/reserved-VM does NOT auto-pull on push. Manual redeploy required via Replit → Deployments → Redeploy. Don't say "shipped" after a push.

## Homepage (shipped)
The `/` → `/overview` route split shipped in May 2026: `/` is the marketing home (`client/src/pages/Home.tsx`), `/overview` is the dashboard (`TiltOverview.tsx`). The Swiss anchor described in `HOMEPAGE_HANDOFF.md` was tried and then removed in favor of GridTilt's own dark brand; treat that handoff as historical.
